'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { syncBoarderRole } from '@/lib/syncBoarderRole'
import { redirect } from 'next/navigation'

export async function linkPersonToHorse(personId: string, formData: FormData) {
  const supabase = createAdminClient()

  const horseId          = formData.get('horse_id') as string
  const role             = (formData.get('role') as string | null)?.trim() || null
  const isBillingContact = formData.get('is_billing_contact') === 'on'

  const { error } = await supabase
    .from('horse_contact')
    .insert({
      horse_id:           horseId,
      person_id:          personId,
      role,
      is_billing_contact: isBillingContact,
      can_log_in:         true,
      can_log_services:   true,
    })

  if (error) throw error

  // Derive boarder role from horse connections (auto-sync per Catherine's rule:
  // "Everyone with a horse contact is a Boarder").
  await syncBoarderRole(personId)

  redirect(`/chia/people/${personId}`)
}
