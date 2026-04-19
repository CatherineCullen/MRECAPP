'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const QUARTERS_PATH = '/chia/lessons-events/configuration/quarters'

export async function toggleDayClosed(dayId: string, closed: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('barn_calendar_day')
    .update({ barn_closed: closed, updated_at: new Date().toISOString() })
    .eq('id', dayId)
  if (error) throw error
  revalidatePath(QUARTERS_PATH)
}

export async function toggleDayMakeup(dayId: string, isMakeup: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('barn_calendar_day')
    .update({ is_makeup_day: isMakeup, updated_at: new Date().toISOString() })
    .eq('id', dayId)
  if (error) throw error
  revalidatePath(QUARTERS_PATH)
}

export async function updateDayNote(dayId: string, notes: string | null) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('barn_calendar_day')
    .update({ notes: notes?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', dayId)
  if (error) throw error
  revalidatePath(QUARTERS_PATH)
}

export async function setQuarterActive(quarterId: string) {
  const supabase = createAdminClient()
  const { error: deactivateError } = await supabase
    .from('quarter')
    .update({ is_active: false })
    .eq('is_active', true)
  if (deactivateError) throw deactivateError

  const { error } = await supabase
    .from('quarter')
    .update({ is_active: true })
    .eq('id', quarterId)
  if (error) throw error
  revalidatePath(QUARTERS_PATH)
}
