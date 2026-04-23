'use client'

import { useState, useTransition } from 'react'
import { saveTemplate, resetTemplate } from '../actions'
import type { Database } from '@/lib/supabase/types'

type NotificationType = Database['public']['Enums']['notification_type']

type TemplateRow = {
  notification_type: NotificationType
  channel:           'email' | 'sms'
  subject:           string | null
  body:              string
  default_subject:   string | null
  default_body:      string
}

const VARS: Record<NotificationType, string[]> = {
  lesson_reminder:     ['first_name', 'lesson_type', 'lesson_time'],
  lesson_cancellation: ['first_name', 'lesson_time', 'token_note'],
  lesson_confirmation: ['first_name', 'lesson_type', 'lesson_time'],
  lesson_type_change:  ['first_name', 'lesson_type', 'lesson_time'],
  health_alert:        ['first_name', 'horse_name', 'health_item', 'due_date'],
  invoice:             ['first_name'],
  makeup_token:        ['first_name'],
  renewal_notice:      ['first_name'],
  enrollment_invite:   ['first_name', 'enroll_link', 'expires_days'],
}

const LABELS: Record<NotificationType, string> = {
  lesson_reminder:     'Lesson Reminder',
  lesson_cancellation: 'Lesson Cancellation',
  lesson_confirmation: 'Lesson Confirmation',
  lesson_type_change:  'Lesson Type Change',
  health_alert:        'Health Alert',
  invoice:             'Invoice Sent',
  makeup_token:        'Makeup Token Issued',
  renewal_notice:      'Renewal Notice',
  enrollment_invite:   'Enrollment Invitation',
}

const WIRED: Set<NotificationType> = new Set([
  'lesson_reminder', 'lesson_cancellation', 'invoice', 'enrollment_invite',
])

function ChannelEditor({
  tmpl,
  onSaved,
}: {
  tmpl: TemplateRow
  onSaved: (updated: TemplateRow) => void
}) {
  const [subject, setSubject] = useState(tmpl.subject ?? '')
  const [body,    setBody]    = useState(tmpl.body)
  const [pending, start]      = useTransition()
  const [msg,     setMsg]     = useState<string | null>(null)

  const dirty = body !== tmpl.body || subject !== (tmpl.subject ?? '')

  function save() {
    start(async () => {
      const res = await saveTemplate(
        tmpl.notification_type,
        tmpl.channel,
        tmpl.channel === 'email' ? subject : null,
        body,
      )
      if (res.error) { setMsg(`Error: ${res.error}`); return }
      setMsg('Saved.')
      onSaved({ ...tmpl, subject: tmpl.channel === 'email' ? subject : null, body })
      setTimeout(() => setMsg(null), 2000)
    })
  }

  function reset() {
    start(async () => {
      const res = await resetTemplate(tmpl.notification_type, tmpl.channel)
      if (res.error) { setMsg(`Error: ${res.error}`); return }
      const s = tmpl.default_subject ?? ''
      const b = tmpl.default_body
      setSubject(s)
      setBody(b)
      setMsg('Reset to default.')
      onSaved({ ...tmpl, subject: tmpl.channel === 'email' ? tmpl.default_subject : null, body: b })
      setTimeout(() => setMsg(null), 2000)
    })
  }

  const vars = VARS[tmpl.notification_type] ?? []

  return (
    <div className={`rounded border ${tmpl.channel === 'email' ? 'border-blue-100 bg-blue-50/30' : 'border-gray-100 bg-gray-50/30'} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {tmpl.channel === 'email' ? '✉ Email' : '💬 SMS'}
        </span>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-green-700">{msg}</span>}
          <button
            onClick={reset}
            disabled={pending}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
          >
            Restore default
          </button>
          <button
            onClick={save}
            disabled={pending || !dirty}
            className="text-xs px-3 py-1 rounded bg-[#002058] text-white disabled:opacity-40 hover:bg-[#0f3460]"
          >
            Save
          </button>
        </div>
      </div>

      {tmpl.channel === 'email' && (
        <div className="mb-2">
          <label className="block text-xs text-gray-500 mb-1">Subject</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#002058]"
          />
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">
          {tmpl.channel === 'email' ? 'Body (HTML — inner content only, wrapper added automatically)' : 'Message'}
        </label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={tmpl.channel === 'email' ? 6 : 3}
          className="w-full text-sm font-mono border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#002058] resize-y"
        />
      </div>

      {vars.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-xs text-gray-400">Variables:</span>
          {vars.map(v => (
            <code
              key={v}
              className="text-xs bg-gray-100 text-gray-600 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-200"
              title="Click to copy"
              onClick={() => navigator.clipboard.writeText(`{{${v}}}`)}
            >
              {`{{${v}}}`}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}

type GroupedTemplates = Record<NotificationType, { email?: TemplateRow; sms?: TemplateRow }>

function groupTemplates(templates: TemplateRow[]): GroupedTemplates {
  const result: Partial<GroupedTemplates> = {}
  for (const t of templates) {
    if (!result[t.notification_type]) result[t.notification_type] = {}
    result[t.notification_type]![t.channel] = t
  }
  return result as GroupedTemplates
}

export default function TemplateEditor({ initialTemplates }: { initialTemplates: TemplateRow[] }) {
  const [templates, setTemplates] = useState(initialTemplates)

  function handleSaved(updated: TemplateRow) {
    setTemplates(prev =>
      prev.map(t =>
        t.notification_type === updated.notification_type && t.channel === updated.channel
          ? updated
          : t,
      ),
    )
  }

  const grouped = groupTemplates(templates)

  const order: NotificationType[] = [
    'lesson_reminder', 'lesson_cancellation', 'invoice',
    'makeup_token', 'lesson_confirmation', 'lesson_type_change',
    'health_alert', 'renewal_notice',
  ]

  return (
    <div className="space-y-6">
      {order.map(type => {
        const group = grouped[type]
        if (!group) return null
        return (
          <div key={type} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className="font-medium text-sm text-[#002058]">{LABELS[type]}</span>
              {!WIRED.has(type) && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 uppercase tracking-wide">
                  Not yet wired
                </span>
              )}
            </div>
            <div className="p-4 space-y-3">
              {group.email && (
                <ChannelEditor tmpl={group.email} onSaved={handleSaved} />
              )}
              {group.sms && (
                <ChannelEditor tmpl={group.sms} onSaved={handleSaved} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
