'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { getRiderScope } from '../../../_lib/riderScope'

export async function saveMyDiet(
  horseId: string,
  existingId: string | null,
  input: {
    am_feed:        string | null
    am_supplements: string | null
    am_hay:         string | null
    pm_feed:        string | null
    pm_supplements: string | null
    pm_hay:         string | null
    notes:          string | null
  },
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in' }

  const supabase = createAdminClient()
  const riderIds = await getRiderScope(user.personId)
  const { data: connection } = await supabase
    .from('horse_contact')
    .select('id')
    .eq('horse_id', horseId)
    .in('person_id', riderIds)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!connection && !user.isAdmin) return { error: 'Not authorized' }

  let nextVersion = 1

  if (existingId) {
    const { data: existing } = await supabase
      .from('diet_record')
      .select('version')
      .eq('id', existingId)
      .single()

    nextVersion = (existing?.version ?? 1) + 1

    const { error: delErr } = await supabase
      .from('diet_record')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', existingId)
    if (delErr) return { error: delErr.message }
  }

  const trim = (s: string | null) => (s?.trim() || null)

  const { error } = await supabase
    .from('diet_record')
    .insert({
      horse_id:       horseId,
      am_feed:        trim(input.am_feed),
      am_supplements: trim(input.am_supplements),
      am_hay:         trim(input.am_hay),
      pm_feed:        trim(input.pm_feed),
      pm_supplements: trim(input.pm_supplements),
      pm_hay:         trim(input.pm_hay),
      notes:          trim(input.notes),
      version:        nextVersion,
      created_by:     user.personId,
    })

  if (error) return { error: error.message }

  revalidatePath(`/my/horses/${horseId}`)
  return {}
}
