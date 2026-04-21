import 'server-only'
import twilio from 'twilio'
import { assertDirectOutboundAllowed } from './outbound'

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error('Twilio credentials not configured')
  return twilio(sid, token)
}

const FROM = process.env.TWILIO_FROM_NUMBER ?? ''

export async function sendSms(params: {
  to: string
  body: string
}): Promise<void> {
  assertDirectOutboundAllowed('sms')
  if (!FROM) throw new Error('TWILIO_FROM_NUMBER not configured')
  const client = getClient()
  await client.messages.create({
    from: FROM,
    to: params.to,
    body: params.body,
  })
}
