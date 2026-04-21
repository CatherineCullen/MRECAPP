'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function updateMyProfile(data: {
  phone?:                    string
  address?:                  string
  emergency_contact_name?:   string
  emergency_contact_phone?:  string
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const db = createAdminClient()
  const { error } = await db
    .from('person')
    .update({
      phone:                   data.phone                   ?? null,
      address:                 data.address                 ?? null,
      emergency_contact_name:  data.emergency_contact_name  ?? null,
      emergency_contact_phone: data.emergency_contact_phone ?? null,
      updated_at:              new Date().toISOString(),
    })
    .eq('id', user.personId)

  if (error) return { error: error.message }

  revalidatePath('/my/profile')
  return {}
}
