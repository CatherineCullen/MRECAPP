'use server'

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { ensureStripeCustomer } from '@/lib/stripe/customer'
import { revalidatePath } from 'next/cache'

// Admin-only. Generates the stub Person(s) + a tokenized enrollment row,
// returning a link the admin hands off to the rider. No email is sent from
// here — admin-held-link pattern while rider-facing pages are still being
// built. Once those ship, we flip a switch to email as well (gated behind
// the outbound kill switch).

const TOKEN_TTL_DAYS = 30

function mintToken(): string {
  // 32 bytes base64url = 43 chars. Easy to paste into chat, not guessable.
  return crypto.randomBytes(32).toString('base64url')
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

type AdultInvite = {
  kind:         'adult'
  templateKind: 'waiver' | 'boarding_agreement'
  firstName:    string
  lastName:     string
  email:        string | null
  phone:        string | null
}

type MinorInvite = {
  kind:             'minor'
  templateKind:     'waiver' | 'boarding_agreement'
  parentFirstName:  string
  parentLastName:   string
  parentEmail:      string | null
  parentPhone:      string | null
  childFirstName:   string
  childLastName:    string
  childDob:         string | null   // YYYY-MM-DD; optional but useful
}

export async function createInvite(
  input: AdultInvite | MinorInvite,
): Promise<{ token?: string; riderPersonId?: string; link?: string; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()
  const now = new Date().toISOString()
  const expires = addDays(now, TOKEN_TTL_DAYS)

  if (input.kind === 'adult') {
    if (!input.firstName.trim() || !input.lastName.trim()) {
      return { error: 'First and last name required.' }
    }
    const { data: person, error } = await db
      .from('person')
      .insert({
        first_name: input.firstName.trim(),
        last_name:  input.lastName.trim(),
        email:      input.email?.trim() || null,
        phone:      input.phone?.trim() || null,
        is_minor:   false,
      })
      .select('id')
      .single()
    if (error || !person) return { error: error?.message ?? 'Failed to create person.' }

    const token = mintToken()
    const { error: tokErr } = await db.from('enrollment_token').insert({
      token,
      rider_person_id:    person.id,
      guardian_person_id: null,
      kind:               'adult',
      template_kind:      input.templateKind,
      expires_at:         expires,
      created_by:         user.personId ?? null,
    })
    if (tokErr) return { error: tokErr.message }

    ensureStripeCustomer(person.id).catch(e =>
      console.error('[createInvite] Stripe customer creation failed', person.id, e)
    )

    revalidatePath('/chia/people')
    return { token, riderPersonId: person.id, link: `/enroll/${token}` }
  }

  // Minor — two stubs in sequence. We insert parent first, then child with
  // guardian_id → parent.id. If the child insert fails we soft-roll-back by
  // soft-deleting the parent stub (we can't do a real transaction from the
  // client libs; orphan parents are at worst a no-op blank record admin can
  // clean up).
  if (!input.parentFirstName.trim() || !input.parentLastName.trim()) {
    return { error: 'Parent first and last name required.' }
  }
  if (!input.childFirstName.trim() || !input.childLastName.trim()) {
    return { error: 'Child first and last name required.' }
  }

  const { data: parent, error: parentErr } = await db
    .from('person')
    .insert({
      first_name: input.parentFirstName.trim(),
      last_name:  input.parentLastName.trim(),
      email:      input.parentEmail?.trim() || null,
      phone:      input.parentPhone?.trim() || null,
      is_minor:   false,
    })
    .select('id')
    .single()
  if (parentErr || !parent) return { error: parentErr?.message ?? 'Failed to create parent.' }

  const { data: child, error: childErr } = await db
    .from('person')
    .insert({
      first_name:    input.childFirstName.trim(),
      last_name:     input.childLastName.trim(),
      date_of_birth: input.childDob || null,
      is_minor:      true,
      guardian_id:   parent.id,
    })
    .select('id')
    .single()
  if (childErr || !child) {
    // Roll back the parent stub to avoid an orphan.
    await db.from('person').update({ deleted_at: new Date().toISOString() }).eq('id', parent.id)
    return { error: childErr?.message ?? 'Failed to create child.' }
  }

  const token = mintToken()
  const { error: tokErr } = await db.from('enrollment_token').insert({
    token,
    rider_person_id:    child.id,
    guardian_person_id: parent.id,
    kind:               'minor',
    template_kind:      input.templateKind,
    expires_at:         expires,
    created_by:         user.personId ?? null,
  })
  if (tokErr) return { error: tokErr.message }

  // Parent is the billed party for minors — create their Stripe customer
  ensureStripeCustomer(parent.id).catch(e =>
    console.error('[createInvite/minor] Stripe customer creation failed', parent.id, e)
  )

  revalidatePath('/chia/people')
  return { token, riderPersonId: child.id, link: `/enroll/${token}` }
}

/** Admin can regenerate an expired/unused token without recreating the stub. */
export async function regenerateInviteToken(
  riderPersonId: string,
): Promise<{ token?: string; link?: string; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()

  // Find the most recent token for this rider, regardless of state, so we
  // can carry over kind + template_kind + guardian link without admin having
  // to re-enter anything.
  const { data: prior } = await db
    .from('enrollment_token')
    .select('*')
    .eq('rider_person_id', riderPersonId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!prior) return { error: 'No prior invite on file for this rider.' }

  // Soft-delete the old one to keep history clean.
  await db.from('enrollment_token').update({ deleted_at: new Date().toISOString() }).eq('id', prior.id)

  const token = mintToken()
  const expires = addDays(new Date().toISOString(), TOKEN_TTL_DAYS)
  const { error } = await db.from('enrollment_token').insert({
    token,
    rider_person_id:    prior.rider_person_id,
    guardian_person_id: prior.guardian_person_id,
    kind:               prior.kind,
    template_kind:      prior.template_kind,
    expires_at:         expires,
    created_by:         user.personId ?? null,
  })
  if (error) return { error: error.message }

  return { token, link: `/enroll/${token}` }
}
