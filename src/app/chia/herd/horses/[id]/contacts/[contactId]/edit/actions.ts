'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function updateHorseContact(
  horseId: string,
  contactId: string,
  formData: FormData,
) {
  const supabase = createAdminClient()

  const role             = (formData.get('role') as string | null)?.trim() || null
  const isBillingContact = formData.get('is_billing_contact') === 'on'
  const canLogIn         = formData.get('can_log_in') === 'on'
  const receivesAlerts   = formData.get('receives_health_alerts') === 'on'

  const { error } = await supabase
    .from('horse_contact')
    .update({
      role,
      is_billing_contact:    isBillingContact,
      can_log_in:            canLogIn,
      receives_health_alerts: receivesAlerts,
      updated_at:            new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('horse_id', horseId)

  if (error) throw error

  redirect(`/chia/herd/horses/${horseId}`)
}

export async function removeHorseContact(
  horseId: string,
  contactId: string,
  _formData?: FormData,
) {
  const supabase = createAdminClient()

  const { data: row } = await supabase
    .from('horse_contact')
    .select('person_id')
    .eq('id', contactId)
    .eq('horse_id', horseId)
    .is('deleted_at', null)
    .maybeSingle()

  const { error } = await supabase
    .from('horse_contact')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('horse_id', horseId)
    .is('deleted_at', null)

  if (error) throw error

  revalidatePath(`/chia/herd/horses/${horseId}`)
  if (row?.person_id) revalidatePath(`/chia/people/${row.person_id}`)
  revalidatePath('/chia/people')

  redirect(`/chia/herd/horses/${horseId}`)
}
