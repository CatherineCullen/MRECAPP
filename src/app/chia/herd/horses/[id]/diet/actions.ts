'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function saveDiet(horseId: string, existingId: string | null, formData: FormData) {
  const user    = await getCurrentUser()
  const supabase = createAdminClient()

  const amFeed         = (formData.get('am_feed')        as string)?.trim() || null
  const amSupplements  = (formData.get('am_supplements') as string)?.trim() || null
  const amHay          = (formData.get('am_hay')         as string)?.trim() || null
  const pmFeed         = (formData.get('pm_feed')        as string)?.trim() || null
  const pmSupplements  = (formData.get('pm_supplements') as string)?.trim() || null
  const pmHay          = (formData.get('pm_hay')         as string)?.trim() || null
  const notes          = (formData.get('notes')          as string)?.trim() || null

  let nextVersion = 1

  if (existingId) {
    // Get current version number, then soft-delete it
    const { data: existing } = await supabase
      .from('diet_record')
      .select('version')
      .eq('id', existingId)
      .single()

    nextVersion = (existing?.version ?? 1) + 1

    await supabase
      .from('diet_record')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', existingId)
  }

  const { error } = await supabase
    .from('diet_record')
    .insert({
      horse_id:       horseId,
      am_feed:        amFeed,
      am_supplements: amSupplements,
      am_hay:         amHay,
      pm_feed:        pmFeed,
      pm_supplements: pmSupplements,
      pm_hay:         pmHay,
      notes,
      version:        nextVersion,
      created_by:     user?.personId ?? null,
    })

  if (error) throw error

  redirect(`/chia/herd/horses/${horseId}`)
}
