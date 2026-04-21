import 'server-only'
import { Resend } from 'resend'
import { assertDirectOutboundAllowed } from './outbound'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM =
  process.env.EMAIL_FROM ??
  'Marlboro Ridge Equestrian Center <noreply@mrecapp.com>'

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  replyTo?: string
}): Promise<void> {
  assertDirectOutboundAllowed('email')
  const { error } = await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}
