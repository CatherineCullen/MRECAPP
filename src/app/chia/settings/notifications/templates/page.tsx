import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TemplateEditor from './_components/TemplateEditor'

export const metadata = { title: 'Notification Templates — CHIA' }

export default async function NotificationTemplatesPage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/sign-in')

  const db = createAdminClient()
  const { data: templates } = await db
    .from('notification_template')
    .select('notification_type, channel, subject, body, default_subject, default_body')
    .in('channel', ['email', 'sms'])  // 'push' has no editable text template — payloads are built in code
    .order('notification_type')
    .order('channel')

  // Cast: the runtime filter above guarantees channel is email|sms, but the
  // generated DB type still includes 'push'. The editor doesn't render push.
  const rows = (templates ?? []) as Array<typeof templates extends (infer T)[] | null ? T & { channel: 'email' | 'sms' } : never>

  return <TemplateEditor initialTemplates={rows} />
}
