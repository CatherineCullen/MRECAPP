import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRiderScope } from '@/app/my/_lib/riderScope'

/**
 * Eligibility for who can message whom.
 *
 * Spec:
 *   - A rider/guardian can message any instructor whose name appears on
 *     any lesson_rider row tied to them (or their minors). Includes past
 *     lessons of any type — subscription, eval, makeup, extra.
 *   - An instructor can message any rider/guardian whose name appears on
 *     any lesson where they're the instructor.
 *   - Admin can message anyone (active, non-self).
 *   - Anyone can message admin.
 *
 * Eligibility check is run at compose time only. Once a thread exists,
 * existing participants can keep posting even if eligibility later
 * disappears (e.g. lesson_rider rows soft-deleted). Per spec, threads
 * are indefinite.
 */

export interface EligibleRecipient {
  personId: string
  /** Display label — guardian-decorated where applicable. */
  label: string
  isAdmin: boolean
}

/**
 * Set of person IDs whose admin role makes them universally addressable.
 */
async function adminPersonIds(): Promise<string[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('person_role')
    .select('person_id, role, person:person!person_role_person_id_fkey(id, deleted_at)')
    .in('role', ['admin', 'barn_owner'])
    .is('deleted_at', null)
  return (data ?? [])
    .filter(r => {
      const p = Array.isArray(r.person) ? r.person[0] : r.person as any
      return p && !p.deleted_at
    })
    .map(r => r.person_id)
}

/**
 * Set of instructor person IDs that the given rider (or their minors) has
 * had a lesson with — past or present, any lesson type.
 */
async function instructorsForRider(riderPersonId: string): Promise<string[]> {
  const db = createAdminClient()
  const scope = await getRiderScope(riderPersonId)

  const { data } = await db
    .from('lesson_rider')
    .select('lesson:lesson!lesson_id(instructor_id)')
    .in('rider_id', scope)
    .is('deleted_at', null)

  const ids = new Set<string>()
  for (const row of data ?? []) {
    const lesson = Array.isArray(row.lesson) ? row.lesson[0] : row.lesson as any
    if (lesson?.instructor_id) ids.add(lesson.instructor_id)
  }
  return [...ids]
}

/**
 * Set of rider/guardian person IDs that the instructor has taught (or has
 * scheduled). For minors, returns the guardian's person_id (the account
 * holder), since threads are person-to-person and minors don't have logins.
 */
async function ridersForInstructor(instructorPersonId: string): Promise<string[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('lesson_rider')
    .select(`
      rider_id,
      rider:person!rider_id(id, is_minor, guardian_id, deleted_at)
    `)
    .is('deleted_at', null)

  // Filter to lessons taught by this instructor. We did the rider join above
  // for the deactivation/guardian filter; lesson join would explode payload,
  // so do a second small query for the instructor filter.
  const { data: theirLessons } = await db
    .from('lesson')
    .select('id')
    .eq('instructor_id', instructorPersonId)
    .is('deleted_at', null)
  const lessonIds = new Set((theirLessons ?? []).map(l => l.id))
  if (lessonIds.size === 0) return []

  const { data: lr } = await db
    .from('lesson_rider')
    .select(`
      rider_id, lesson_id,
      rider:person!rider_id(id, is_minor, guardian_id, deleted_at)
    `)
    .in('lesson_id', [...lessonIds])
    .is('deleted_at', null)

  const ids = new Set<string>()
  for (const row of lr ?? []) {
    const rider = Array.isArray(row.rider) ? row.rider[0] : row.rider as any
    if (!rider || rider.deleted_at) continue
    // Route minors → guardian (account holder)
    const target = rider.is_minor && rider.guardian_id ? rider.guardian_id : rider.id
    ids.add(target)
  }
  return [...ids]
}

/**
 * Returns whether `viewer` is allowed to start (or continue composing in)
 * a thread with `other`. Cheap — used in server actions before sendMessage
 * to prevent unauthorized writes via direct action invocation.
 */
export async function canMessage(viewerPersonId: string, otherPersonId: string): Promise<boolean> {
  if (viewerPersonId === otherPersonId) return false

  const admins = new Set(await adminPersonIds())
  // Either side admin → allowed.
  if (admins.has(viewerPersonId) || admins.has(otherPersonId)) {
    // Still verify the other person is active.
    const db = createAdminClient()
    const { data: target } = await db.from('person').select('deleted_at').eq('id', otherPersonId).maybeSingle()
    return !!target && !target.deleted_at
  }

  // Both are non-admin: there must be a lesson_rider link between them in
  // either direction. We don't know which side is the instructor, so try
  // both lookups.
  const asRider = await instructorsForRider(viewerPersonId)
  if (asRider.includes(otherPersonId)) return true

  const asInstructor = await ridersForInstructor(viewerPersonId)
  return asInstructor.includes(otherPersonId)
}

/**
 * Returns the list of people the viewer can compose a new message to.
 * Powers the recipient picker. Includes self-relevant labels (admin gets
 * "(admin)" suffix, guardians get minor decoration).
 */
export async function eligibleRecipientsFor(viewerPersonId: string): Promise<EligibleRecipient[]> {
  const db = createAdminClient()
  const { guardianMessageLabel, adminLabel } = await import('./displayName')

  const admins = new Set(await adminPersonIds())
  const isViewerAdmin = admins.has(viewerPersonId)

  let candidateIds: Set<string>

  if (isViewerAdmin) {
    // Admin: anyone active except self.
    const { data: people } = await db
      .from('person')
      .select('id')
      .neq('id', viewerPersonId)
      .is('deleted_at', null)
    candidateIds = new Set((people ?? []).map(p => p.id))
  } else {
    // Non-admin: union of "instructors I've ridden with" + "riders I teach"
    // + admins.
    candidateIds = new Set<string>()
    for (const id of await instructorsForRider(viewerPersonId)) candidateIds.add(id)
    for (const id of await ridersForInstructor(viewerPersonId))  candidateIds.add(id)
    for (const id of admins) candidateIds.add(id)
    candidateIds.delete(viewerPersonId)
  }

  // Filter out deactivated.
  if (candidateIds.size === 0) return []
  const { data: active } = await db
    .from('person')
    .select('id, deleted_at')
    .in('id', [...candidateIds])
  const activeIds = (active ?? []).filter(p => !p.deleted_at).map(p => p.id)

  // Build labels (parallel for speed).
  const recipients = await Promise.all(activeIds.map(async id => {
    const baseLabel = await guardianMessageLabel(id)
    const isAdmin = admins.has(id)
    return {
      personId: id,
      label: isAdmin ? adminLabel(baseLabel) : baseLabel,
      isAdmin,
    }
  }))

  // Sort: admins last (operational, less common), then alphabetical by label.
  recipients.sort((a, b) => {
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? 1 : -1
    return a.label.localeCompare(b.label)
  })

  return recipients
}
