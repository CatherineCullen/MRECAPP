'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { loadCurrentTemplate } from '@/app/chia/documents/_lib/loadTemplate'
import { renderSignedWaiverPdf } from '@/app/chia/documents/_lib/waiverPdf'

// Public-action (no admin gate) — the token IS the authorization. We validate
// it exists, hasn't been used, and isn't expired before doing anything.
//
// Order matters here. The previous version did Person updates, storage
// uploads, and the Document insert BEFORE trying to create the auth user —
// so an email collision at the auth step left behind a mutated Person (stub
// email silently overwritten), orphan files in storage, a completed Document
// row, and an unused token. Every retry then accumulated more duplicates.
//
// The current order fails fast on anything that depends on external state:
//   1. Validate token / template / signature / password.
//   2. Figure out who's signing and what email they typed.
//   3. Pre-flight the auth account — either confirm the signing Person
//      already has one, or create it NOW. If the email collides with
//      another Person's auth, or with an orphan auth user, we bail before
//      touching anything else.
//   4. THEN update Person row(s), upload signature + PDF, insert Document,
//      mark token used. These are writes we control; they shouldn't fail
//      on state we don't own.
//
// The Document insert is guarded by an idempotency check so a partial
// retry (e.g., storage upload failed mid-way) doesn't re-sign on the same
// template version.

export type EnrollInput = {
  token:               string
  riderFirstName:      string
  riderLastName:       string
  riderDob:            string | null
  address:             string | null
  phone:               string | null
  email:               string | null
  emergencyName:       string | null
  emergencyPhone:      string | null
  // For minors, the parent confirms/fills their own fields separately.
  parentFirstName?:    string
  parentLastName?:     string
  parentEmail?:        string
  parentPhone?:        string
  password:            string
  signaturePngDataUrl: string   // "data:image/png;base64,…"
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return Buffer.from(match[1], 'base64')
}

const EMAIL_COLLISION_MSG =
  'An account already exists for that email. Please contact the barn — we can link this waiver to your existing account.'

export async function submitEnrollment(input: EnrollInput): Promise<{ error?: string; ok?: boolean; signInEmail?: string | null }> {
  const db = createAdminClient()

  // ── 1. Validate token ────────────────────────────────────────────────
  const { data: tok } = await db
    .from('enrollment_token')
    .select('*')
    .eq('token', input.token)
    .is('deleted_at', null)
    .maybeSingle()
  if (!tok) return { error: 'This enrollment link is not valid.' }
  if (tok.used_at) return { error: 'This enrollment link has already been used.' }
  if (new Date(tok.expires_at).getTime() < Date.now()) return { error: 'This enrollment link has expired. Ask the barn for a new one.' }

  // ── 2. Validate template + signature + password ──────────────────────
  const template = await loadCurrentTemplate(tok.template_kind as 'waiver' | 'boarding_agreement')
  if (!template) return { error: 'The barn has not yet configured this document template. Contact the office.' }

  const sigBytes = dataUrlToBytes(input.signaturePngDataUrl)
  if (!sigBytes) return { error: 'Signature is missing or invalid. Please sign again.' }

  if (!input.password || input.password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  // ── 3. Figure out the signer ─────────────────────────────────────────
  const isMinor = tok.kind === 'minor'
  let signerPersonId = tok.rider_person_id as string
  let signerEmail = input.email?.trim() || null
  let signerPrintedName = `${input.riderFirstName.trim()} ${input.riderLastName.trim()}`

  if (isMinor) {
    if (!tok.guardian_person_id) return { error: 'Token is minor but has no guardian linked. Contact the office.' }
    if (!input.parentFirstName || !input.parentLastName) {
      return { error: 'Parent / guardian name is required.' }
    }
    signerPersonId = tok.guardian_person_id
    signerEmail = input.parentEmail?.trim() || null
    signerPrintedName = `${input.parentFirstName.trim()} ${input.parentLastName.trim()}`
  }

  if (!signerEmail) return { error: 'Email is required to create your account.' }

  // ── 4. Pre-flight auth BEFORE any writes. ────────────────────────────
  // If the signer Person already has an auth account linked, skip creation
  // entirely (retry or admin re-issue case). Otherwise, check for email
  // collision against other Persons' linked accounts, then try the actual
  // Supabase createUser call — that covers orphan auth users we don't
  // have a Person row for.
  const { data: signerPerson, error: sPerErr } = await db
    .from('person')
    .select('auth_user_id')
    .eq('id', signerPersonId)
    .maybeSingle()
  if (sPerErr) return { error: sPerErr.message }

  if (!signerPerson?.auth_user_id) {
    // Cheap collision check via our own Person table — catches the common
    // "someone else at this barn already signed up with this email" case
    // with a clean error instead of a raw Supabase string.
    const { data: clash } = await db
      .from('person')
      .select('id')
      .eq('email', signerEmail)
      .not('auth_user_id', 'is', null)
      .neq('id', signerPersonId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (clash) return { error: EMAIL_COLLISION_MSG }

    // Actually create the auth user. If this fails — including the orphan
    // auth-user case (auth row exists but no Person links to it) — we bail
    // here, before mutating the Person stub or uploading anything.
    try {
      const { data: authData, error: authErr } = await db.auth.admin.createUser({
        email:         signerEmail,
        password:      input.password,
        email_confirm: true,
      })
      if (authErr || !authData?.user) {
        const msg = authErr?.message ?? 'unknown'
        if (/already|duplicate|registered|exists/i.test(msg)) {
          return { error: EMAIL_COLLISION_MSG }
        }
        return { error: `Account creation failed: ${msg}` }
      }
      // Link the auth user to the signing Person immediately, so any retry
      // short-circuits on the signerPerson.auth_user_id check above.
      const { error: linkErr } = await db
        .from('person')
        .update({ auth_user_id: authData.user.id })
        .eq('id', signerPersonId)
      if (linkErr) {
        // The auth user exists but isn't linked to a Person. Surface this
        // clearly — admin can link manually; the rider shouldn't retry and
        // create a second auth user with a different email.
        return { error: `Account link failed: ${linkErr.message}. Contact the barn.` }
      }
    } catch (e) {
      return { error: `Account setup failed: ${e instanceof Error ? e.message : 'unknown'}` }
    }
  }

  // ── 5. Update Person row(s) ──────────────────────────────────────────
  const riderUpdate = {
    first_name:              input.riderFirstName.trim(),
    last_name:               input.riderLastName.trim(),
    date_of_birth:           input.riderDob || null,
    address:                 input.address?.trim() || null,
    emergency_contact_name:  input.emergencyName?.trim() || null,
    emergency_contact_phone: input.emergencyPhone?.trim() || null,
    ...(isMinor ? {} : {
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    }),
  }
  const { error: rErr } = await db.from('person').update(riderUpdate).eq('id', tok.rider_person_id)
  if (rErr) return { error: rErr.message }

  if (isMinor) {
    const { error: pErr } = await db.from('person').update({
      first_name: input.parentFirstName!.trim(),
      last_name:  input.parentLastName!.trim(),
      email:      signerEmail,
      phone:      input.parentPhone?.trim() || null,
    }).eq('id', tok.guardian_person_id!)
    if (pErr) return { error: pErr.message }
  }

  // ── 6. Idempotency guard for Document + storage ──────────────────────
  // Has this exact (rider, signer, template version) already been recorded?
  // If yes, we skip the PDF render / upload / insert — a prior attempt
  // succeeded here but fell over later (e.g., mark-used update). We just
  // proceed to mark the token used below.
  const { data: existingDoc } = await db
    .from('document')
    .select('id')
    .eq('person_id', tok.rider_person_id)
    .eq('signed_by_person_id', signerPersonId)
    .eq('template_version_id', template.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!existingDoc) {
    const signedAtIso = new Date().toISOString()
    const pdfBytes = await renderSignedWaiverPdf({
      bodyMarkdown:      template.body_markdown,
      templateVersion:   template.version,
      riderName:         `${input.riderFirstName.trim()} ${input.riderLastName.trim()}`,
      riderDob:          input.riderDob,
      address:           input.address?.trim() || null,
      phone:             input.phone?.trim() || input.parentPhone?.trim() || null,
      email:             signerEmail,
      emergencyName:     input.emergencyName?.trim() || null,
      emergencyPhone:    input.emergencyPhone?.trim() || null,
      signerPrintedName,
      isMinor,
      signedAtIso,
      signaturePngBytes: sigBytes,
    })

    const stamp = Date.now()
    const sigPath = `signatures/${tok.rider_person_id}-${stamp}.png`
    const pdfPath = `waivers/${tok.rider_person_id}-${stamp}.pdf`

    const { error: sigUp } = await db.storage.from('documents').upload(
      sigPath,
      Buffer.from(sigBytes),
      { contentType: 'image/png', upsert: false },
    )
    if (sigUp) return { error: `Signature upload failed: ${sigUp.message}` }

    const { error: pdfUp } = await db.storage.from('documents').upload(
      pdfPath,
      Buffer.from(pdfBytes),
      { contentType: 'application/pdf', upsert: false },
    )
    if (pdfUp) return { error: `PDF upload failed: ${pdfUp.message}` }

    const docType = tok.template_kind === 'waiver' ? 'Waiver' : 'Boarding Agreement'
    const filename = `${docType.replace(/ /g, '_')}_${input.riderLastName.trim()}_${new Date(signedAtIso).toISOString().slice(0, 10)}.pdf`
    const { error: docErr } = await db.from('document').insert({
      document_type:        docType,
      filename,
      file_url:             pdfPath,
      person_id:            tok.rider_person_id,
      horse_id:             null,
      signed_at:            signedAtIso.slice(0, 10),
      template_version_id:  template.id,
      signature_png_path:   sigPath,
      signed_by_person_id:  signerPersonId,
      uploaded_at:          signedAtIso,
    })
    if (docErr) return { error: `Document insert failed: ${docErr.message}` }
  }

  // ── 7. Mark token used ───────────────────────────────────────────────
  await db.from('enrollment_token').update({ used_at: new Date().toISOString() }).eq('id', tok.id)

  // Return the signer email so the form can sign them in client-side with
  // the password they just set. (Minor case: this is the guardian's email;
  // adult case: the rider's own email. Either way, the one we just attached
  // to the auth account.)
  return { ok: true, signInEmail: signerEmail }
}
