import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type PersonRole =
  | 'rider' | 'owner' | 'instructor' | 'admin'
  | 'barn_owner' | 'barn_worker' | 'service_provider'

export interface CurrentUser {
  authId: string
  personId: string
  firstName: string
  lastName: string
  preferredName: string | null
  roles: PersonRole[]
  isAdmin: boolean
  isStaff: boolean   // admin, barn_owner, instructor, barn_worker, or training ride provider
  isTrainingRideProvider: boolean
}

/**
 * Returns the current user's Person record and roles.
 * Uses the admin client to bypass RLS (safe — only called server-side,
 * after auth.getUser() has verified the session).
 * Returns null if the session is invalid or no Person record exists.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) return null

  const admin = createAdminClient()

  const { data: person } = await admin
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_training_ride_provider')
    .eq('auth_user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!person) return null

  const { data: roleRows } = await admin
    .from('person_role')
    .select('role')
    .eq('person_id', person.id)
    .is('deleted_at', null)

  const roles = (roleRows ?? []).map(r => r.role as PersonRole)

  const isAdmin = roles.includes('admin') || roles.includes('barn_owner')
  const isStaff =
    isAdmin ||
    roles.includes('instructor') ||
    roles.includes('barn_worker') ||
    person.is_training_ride_provider

  return {
    authId: user.id,
    personId: person.id,
    firstName: person.first_name,
    lastName: person.last_name,
    preferredName: person.preferred_name,
    roles,
    isAdmin,
    isStaff,
    isTrainingRideProvider: person.is_training_ride_provider,
  }
}
