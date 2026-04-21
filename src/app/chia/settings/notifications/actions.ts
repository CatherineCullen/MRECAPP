'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { Database } from '@/lib/supabase/types'

type NotificationType = Database['public']['Enums']['notification_type']

export async function updateNotificationConfig(
  type: NotificationType,
  channel: 'email' | 'sms',
  enabled: boolean,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()
  const patch = channel === 'email'
    ? { email_enabled: enabled, updated_at: new Date().toISOString(), updated_by: user.personId ?? null }
    : { sms_enabled:   enabled, updated_at: new Date().toISOString(), updated_by: user.personId ?? null }

  const { error } = await db
    .from('notification_config')
    .update(patch)
    .eq('notification_type', type)

  if (error) return { error: error.message }
  revalidatePath('/chia/settings/notifications')
  return {}
}
