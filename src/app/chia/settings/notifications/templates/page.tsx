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
    .order('notification_type')
    .order('channel')

  return <TemplateEditor initialTemplates={templates ?? []} />
}
