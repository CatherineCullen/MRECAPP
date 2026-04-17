'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function createPerson(formData: FormData) {
  const supabase     = createAdminClient()
  const isOrg        = formData.get('is_organization') === 'on'
  const isMinor      = formData.get('is_minor') === 'on'
  const isTRProvider = formData.get('is_training_ride_provider') === 'on'

  const { data: person, error } = await supabase
    .from('person')
    .insert({
      first_name:               isOrg ? 'Org' : (formData.get('first_name') as string).trim(),
      last_name:                isOrg ? 'Org' : (formData.get('last_name') as string).trim(),
      preferred_name:           (formData.get('preferred_name') as string | null)?.trim() || null,
      email:                    (formData.get('email') as string | null)?.trim() || null,
      phone:                    (formData.get('phone') as string | null)?.trim() || null,
      address:                  (formData.get('address') as string | null)?.trim() || null,
      date_of_birth:            (formData.get('date_of_birth') as string | null) || null,
      is_minor:                 isMinor,
      guardian_id:              isMinor ? ((formData.get('guardian_id') as string | null) || null) : null,
      is_organization:          isOrg,
      organization_name:        isOrg ? (formData.get('organization_name') as string).trim() : null,
      provider_type:            (formData.get('provider_type') as string | null)?.trim() || null,
      is_training_ride_provider: isTRProvider,
      riding_level:             ((formData.get('riding_level') as string | null) || null) as any,
      weight_category:          ((formData.get('weight_category') as string | null) || null) as any,
      height:                   (formData.get('height') as string | null)?.trim() || null,
      usef_id:                  (formData.get('usef_id') as string | null)?.trim() || null,
      notes:                    (formData.get('notes') as string | null)?.trim() || null,
      preferred_language:       ((formData.get('preferred_language') as string | null) || 'english') as any,
    })
    .select('id')
    .single()

  if (error) throw error

  // Assign roles
  const roles = formData.getAll('roles') as string[]
  if (roles.length > 0) {
    await supabase.from('person_role').insert(
      roles.map(role => ({ person_id: person.id, role: role as any }))
    )
  }

  redirect(`/chia/people/${person.id}`)
}
