'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

type DietFields = {
  am_feed:        string | null
  am_supplements: string | null
  am_hay:         string | null
  pm_feed:        string | null
  pm_supplements: string | null
  pm_hay:         string | null
  notes:          string | null
}

export async function saveDietInline(horseId: string, existingId: string | null, fields: DietFields) {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  const clean = (v: string | null) => {
    const t = (v ?? '').trim()
    return t.length === 0 ? null : t
  }

  let nextVersion = 1

  if (existingId) {
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
      am_feed:        clean(fields.am_feed),
      am_supplements: clean(fields.am_supplements),
      am_hay:         clean(fields.am_hay),
      pm_feed:        clean(fields.pm_feed),
      pm_supplements: clean(fields.pm_supplements),
      pm_hay:         clean(fields.pm_hay),
      notes:          clean(fields.notes),
      version:        nextVersion,
      created_by:     user?.personId ?? null,
    })

  if (error) throw error

  revalidatePath('/chia/herd/diets')
}
