'use server'

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { ensureStripeCustomer } from '@/lib/stripe/customer'
import { createAndSendInvoice } from '@/lib/stripe/invoice'
import { getCurrentUser } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { getAppOrigin } from '@/lib/appUrl'
import { renderTemplate, wrapEmailBody } from '@/lib/renderTemplate'

const TOKEN_TTL_DAYS = 30

/**
 * Admin "Change login email" — lockout-recovery path for when a person
 * can't access their old inbox (typo, lost access, etc).
 *
 * Updates Supabase auth user and person.email atomically-ish: auth first,
 * then person row. If auth fails we don't touch person; if person update
 * fails after auth succeeded we still return an error but the login email
 * is already changed (acceptable — next page load will show the new email
 * on the profile anyway, and the auth swap is the harder-to-reverse half).
 *
 * Best practice (post-outbound launch) is user-initiated change with
 * verification email to the new address. This bypass exists because admins
 * need a recovery tool. Intentional friction: separate button, confirmation
 * dialog in the UI.
 */
export async function changeLoginEmail(
  personId: string,
  newEmail: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const trimmed = newEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: 'Please enter a valid email address.' }
  }

  const db = createAdminClient()

  const { data: person } = await db
    .from('person')
    .select('id, auth_user_id, email')
    .eq('id', personId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!person)                return { error: 'Person not found.' }
  if (!person.auth_user_id)   return { error: 'This person does not have a login yet. Use "Send Invite" instead.' }
  if (person.email === trimmed) return { error: 'That is already their email.' }

  // Check for collision — another person in this barn already using it?
  const { data: collision } = await db
    .from('person')
    .select('id')
    .eq('email', trimmed)
    .neq('id', personId)
    .is('deleted_at', null)
    .maybeSingle()
  if (collision) return { error: 'Another person is already using that email.' }

  // Auth first — harder to reverse, so if this fails we bail before touching person.
  const { error: authErr } = await db.auth.admin.updateUserById(
    person.auth_user_id,
    { email: trimmed, email_confirm: true },
  )
  if (authErr) return { error: `Failed to update login: ${authErr.message}` }

  const { error: pErr } = await db
    .from('person')
    .update({ email: trimmed })
    .eq('id', personId)
  if (pErr) return { error: `Login updated but failed to save email on profile: ${pErr.message}` }

  revalidatePath(`/chia/people/${personId}`)
  return {}
}

/**
 * Soft-delete a person. Meant for dupes and truly-no-longer-relevant people
 * — NOT for inactive riders (set subscription end date instead) or former
 * staff (remove the role). Refuses if the person has any meaningful data
 * attached, so admin has to clean that up first.
 */
export async function archivePerson(
  personId: string,
): Promise<{ error?: string; blockers?: string[] }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()

  const { data: person } = await db
    .from('person')
    .select('id, auth_user_id')
    .eq('id', personId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!person) return { error: 'Person not found.' }

  const blockers: string[] = []

  if (person.auth_user_id) blockers.push('has a login account')

  const [subsRider, subsBill, subsInstr, lessonsInstr, lessonRiders, horseContacts, minors, invoices] = await Promise.all([
    db.from('lesson_subscription').select('id', { count: 'exact', head: true })
      .eq('rider_id', personId).is('deleted_at', null),
    db.from('lesson_subscription').select('id', { count: 'exact', head: true })
      .eq('billed_to_id', personId).is('deleted_at', null),
    db.from('lesson_subscription').select('id', { count: 'exact', head: true })
      .eq('instructor_id', personId).is('deleted_at', null),
    db.from('lesson').select('id', { count: 'exact', head: true })
      .eq('instructor_id', personId).is('deleted_at', null),
    db.from('lesson_rider').select('id', { count: 'exact', head: true })
      .eq('rider_id', personId).is('deleted_at', null),
    db.from('horse_contact').select('id', { count: 'exact', head: true })
      .eq('person_id', personId).is('deleted_at', null),
    db.from('person').select('id', { count: 'exact', head: true })
      .eq('guardian_id', personId).is('deleted_at', null),
    db.from('invoice').select('id', { count: 'exact', head: true })
      .eq('billed_to_id', personId).is('deleted_at', null),
  ])

  if ((subsRider.count ?? 0) > 0)    blockers.push('is a rider on active lesson subscriptions')
  if ((subsBill.count ?? 0) > 0)     blockers.push('is the billing contact on active subscriptions')
  if ((subsInstr.count ?? 0) > 0)    blockers.push('is the instructor on active subscriptions')
  if ((lessonsInstr.count ?? 0) > 0) blockers.push('is the instructor on existing lessons')
  if ((lessonRiders.count ?? 0) > 0) blockers.push('has lesson history as a rider')
  if ((horseContacts.count ?? 0) > 0) blockers.push('is linked to one or more horses')
  if ((minors.count ?? 0) > 0)       blockers.push('is a guardian for one or more minors')
  if ((invoices.count ?? 0) > 0)     blockers.push('has invoices on file')

  if (blockers.length) return { blockers }

  // Soft-delete person + their active role rows so they drop from staff lists.
  const now = new Date().toISOString()
  const { error } = await db
    .from('person')
    .update({ deleted_at: now })
    .eq('id', personId)
  if (error) return { error: error.message }

  await db
    .from('person_role')
    .update({ deleted_at: now })
    .eq('person_id', personId)
    .is('deleted_at', null)

  revalidatePath('/chia/people')
  revalidatePath(`/chia/people/${personId}`)
  return {}
}

/**
 * Create an enrollment token for a person who already exists in the DB but
 * has no Supabase account yet. Sends an invite email if they have one on file.
 * Used from the person detail page for existing boarders / riders.
 */
export async function sendInviteToExistingPerson(
  personId: string,
): Promise<{ link?: string; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()

  const { data: person } = await db
    .from('person')
    .select('id, first_name, email, is_minor, auth_user_id')
    .eq('id', personId)
    .maybeSingle()

  if (!person) return { error: 'Person not found.' }
  if (person.auth_user_id) return { error: 'This person already has an account.' }
  if (person.is_minor)     return { error: 'Minors do not get direct logins — invite the guardian instead.' }

  // Expire any existing unused tokens so only one is live at a time
  await db
    .from('enrollment_token')
    .update({ deleted_at: new Date().toISOString() })
    .eq('rider_person_id', personId)
    .is('used_at', null)
    .is('deleted_at', null)

  const token   = crypto.randomBytes(32).toString('base64url')
  const expires = new Date()
  expires.setDate(expires.getDate() + TOKEN_TTL_DAYS)

  const { error: tokErr } = await db.from('enrollment_token').insert({
    token,
    rider_person_id:    personId,
    guardian_person_id: null,
    kind:               'adult',
    template_kind:      'waiver',
    expires_at:         expires.toISOString(),
    created_by:         user.personId ?? null,
  })
  if (tokErr) return { error: tokErr.message }

  const origin     = await getAppOrigin()
  const enrollLink = `${origin}/enroll/${token}`

  if (person.email) {
    // Pull subject/body from the editable notification_template row so
    // admin can tweak invite copy at /chia/settings/notifications/templates
    // without a deploy. Respect the email toggle in notification_config —
    // but NOT the per-user preference table (invitee has no prefs yet).
    const [{ data: config }, { data: tmpl }] = await Promise.all([
      db.from('notification_config').select('email_enabled').eq('notification_type', 'enrollment_invite').maybeSingle(),
      db.from('notification_template').select('subject, body').eq('notification_type', 'enrollment_invite').eq('channel', 'email').maybeSingle(),
    ])

    if (config?.email_enabled && tmpl) {
      const vars = {
        first_name:    person.first_name ?? 'there',
        enroll_link:   enrollLink,
        expires_days:  String(TOKEN_TTL_DAYS),
      }
      sendEmail({
        to:      person.email,
        subject: renderTemplate(tmpl.subject ?? 'Enrollment invitation', vars),
        html:    wrapEmailBody(renderTemplate(tmpl.body, vars)),
      }).catch(e => console.error('[sendInviteToExistingPerson] email failed', personId, e))
    }
  }

  revalidatePath(`/chia/people/${personId}`)
  return { link: enrollLink }
}

/**
 * Add or remove a single role from a person.
 *
 * Previous implementation used `upsert` with onConflict on (person_id, role),
 * but the unique index is PARTIAL (WHERE deleted_at IS NULL) — Postgres
 * couldn't match the conflict target reliably and the upsert silently failed.
 *
 * This version:
 *   - Add:    restore a soft-deleted row if one exists, otherwise insert fresh.
 *             No-op if already active (idempotent).
 *   - Remove: soft-delete the active row.
 */
export async function toggleRole(personId: string, role: string, add: boolean): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  if (add) {
    // Already active? Nothing to do.
    const { data: active } = await supabase
      .from('person_role')
      .select('id')
      .eq('person_id', personId)
      .eq('role', role as any)
      .is('deleted_at', null)
      .maybeSingle()
    if (active) return {}

    // Soft-deleted copy we can restore?
    const { data: deleted } = await supabase
      .from('person_role')
      .select('id')
      .eq('person_id', personId)
      .eq('role', role as any)
      .not('deleted_at', 'is', null)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (deleted) {
      const { error } = await supabase
        .from('person_role')
        .update({ deleted_at: null, assigned_at: new Date().toISOString() })
        .eq('id', deleted.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase
        .from('person_role')
        .insert({ person_id: personId, role: role as any })
      if (error) return { error: error.message }
    }
  } else {
    const { error } = await supabase
      .from('person_role')
      .update({ deleted_at: new Date().toISOString() })
      .eq('person_id', personId)
      .eq('role', role as any)
      .is('deleted_at', null)
    if (error) return { error: error.message }
  }

  revalidatePath(`/chia/people/${personId}`)
  revalidatePath('/chia/people')
  return {}
}

/**
 * Sync a Person to Stripe as a Customer. Idempotent — returns the existing
 * stripe_customer_id if already synced, otherwise creates the Customer and
 * persists the id.
 *
 * Phase 1 smoke test: gives us a button on the person page to confirm the
 * Stripe connection works before Phase B tries to create Invoices.
 */
export async function syncStripeCustomer(
  personId: string
): Promise<{ stripeCustomerId?: string; error?: string }> {
  // Admin-only: Stripe identifiers and billing controls are plumbing for
  // barn staff, not something end users should see or trigger.
  const user = await getCurrentUser()
  if (!user?.isAdmin) {
    return { error: 'Not authorized' }
  }

  // Block minors: CHIA never bills minors directly — billing routes
  // through the guardian. Guard here in case the UI is ever bypassed.
  const db = createAdminClient()
  const { data: person } = await db
    .from('person')
    .select('is_minor')
    .eq('id', personId)
    .maybeSingle()
  if (person?.is_minor) {
    return { error: 'Cannot create a Stripe customer for a minor. Bill the guardian instead.' }
  }

  try {
    const stripeCustomerId = await ensureStripeCustomer(personId)
    revalidatePath(`/chia/people/${personId}`)
    return { stripeCustomerId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

/**
 * Admin-only Phase B smoke test: create + send a one-off ad-hoc invoice
 * to the given Person. Proves the full Stripe Invoicing pipeline end-to-end:
 *   create customer → create invoice items → finalize → send → webhook →
 *   DB status flips.
 *
 * Not a production feature — the real invoice flows (lesson packages,
 * board, camp) will each have their own builders that populate the
 * per-source FKs on invoice_line_item. This is the test harness.
 */
export async function createTestInvoice(params: {
  personId: string
  description: string
  amount: number
  notes?: string
}): Promise<{
  stripeInvoiceId?: string
  hostedInvoiceUrl?: string | null
  chiaInvoiceId?: string
  error?: string
}> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) {
    return { error: 'Not authorized' }
  }

  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    return { error: 'Amount must be greater than $0' }
  }
  if (!params.description.trim()) {
    return { error: 'Description is required' }
  }

  // Block minors: see syncStripeCustomer guard.
  const db = createAdminClient()
  const { data: person } = await db
    .from('person')
    .select('is_minor')
    .eq('id', params.personId)
    .maybeSingle()
  if (person?.is_minor) {
    return { error: 'Cannot invoice a minor directly. Bill the guardian instead.' }
  }

  try {
    const result = await createAndSendInvoice({
      personId: params.personId,
      lineItems: [
        {
          description: params.description.trim(),
          unitPrice: params.amount,
          quantity: 1,
        },
      ],
      notes: params.notes?.trim() || undefined,
    })
    revalidatePath(`/chia/people/${params.personId}`)
    return {
      stripeInvoiceId: result.stripeInvoiceId,
      hostedInvoiceUrl: result.hostedInvoiceUrl,
      chiaInvoiceId: result.chiaInvoiceId,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
