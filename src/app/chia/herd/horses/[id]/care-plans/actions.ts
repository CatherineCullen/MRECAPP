'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function addCarePlan(horseId: string, formData: FormData) {
  const user    = await getCurrentUser()
  const supabase = createAdminClient()

  const content  = (formData.get('content') as string).trim()
  const startsOn = (formData.get('starts_on') as string) || null
  const endsOn   = (formData.get('ends_on')   as string) || null

  if (!content) throw new Error('Content is required.')

  const { error } = await supabase
    .from('care_plan')
    .insert({
      horse_id:   horseId,
      content,
      starts_on:  startsOn,
      ends_on:    endsOn,
      created_by: user?.personId ?? null,
      is_active:  true,
      version:    1,
    })

  if (error) throw error

  redirect(`/chia/herd/horses/${horseId}`)
}

export async function resolveCarePlan(
  planId:  string,
  horseId: string,
  note:    string | null,
) {
  const user    = await getCurrentUser()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('care_plan')
    .update({
      is_active:       false,
      resolved_at:     new Date().toISOString(),
      resolved_by:     user?.personId ?? null,
      resolution_note: note?.trim() || null,
    })
    .eq('id', planId)

  if (error) throw error

  revalidatePath(`/chia/herd/horses/${horseId}`)
}
