'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { Database } from '@/lib/supabase/types'

type NotificationType = Database['public']['Enums']['notification_type']
type Channel = Database['public']['Enums']['notification_channel']

export async function saveTemplate(
  type: NotificationType,
  channel: Channel,
  subject: string | null,
  body: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()
  const { error } = await db
    .from('notification_template')
    .update({
      subject:    channel === 'email' ? subject : null,
      body,
      updated_at: new Date().toISOString(),
      updated_by: user.personId ?? null,
    })
    .eq('notification_type', type)
    .eq('channel', channel)

  if (error) return { error: error.message }
  revalidatePath('/chia/settings/notifications/templates')
  return {}
}

export async function resetTemplate(
  type: NotificationType,
  channel: Channel,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()

  const { data: tmpl } = await db
    .from('notification_template')
    .select('default_subject, default_body')
    .eq('notification_type', type)
    .eq('channel', channel)
    .maybeSingle()

  if (!tmpl) return { error: 'Template not found.' }

  const { error } = await db
    .from('notification_template')
    .update({
      subject:    tmpl.default_subject,
      body:       tmpl.default_body,
      updated_at: new Date().toISOString(),
      updated_by: user.personId ?? null,
    })
    .eq('notification_type', type)
    .eq('channel', channel)

  if (error) return { error: error.message }
  revalidatePath('/chia/settings/notifications/templates')
  return {}
}
