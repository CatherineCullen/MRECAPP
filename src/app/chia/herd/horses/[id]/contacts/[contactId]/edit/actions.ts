'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

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
