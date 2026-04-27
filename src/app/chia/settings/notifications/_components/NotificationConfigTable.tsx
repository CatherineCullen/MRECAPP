'use client'

import { useTransition } from 'react'
import { updateNotificationConfig } from '../actions'
import type { Database } from '@/lib/supabase/types'

type NotificationType = Database['public']['Enums']['notification_type']

type Row = {
  type:         NotificationType
  label:        string
  description:  string
  wired:        boolean
  note?:        string
  emailEnabled: boolean
  smsEnabled:   boolean
  updatedAt:    string
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked:  boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#0f3460] focus:ring-offset-1
        ${checked ? 'bg-[#0f3460]' : 'bg-gray-200'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0
          transition duration-150
          ${checked ? 'translate-x-4' : 'translate-x-0'}
        `}
      />
    </button>
  )
}

function ConfigRow({ row }: { row: Row }) {
  const [pending, startTransition] = useTransition()

  function toggle(channel: 'email' | 'sms', value: boolean) {
    startTransition(async () => {
      await updateNotificationConfig(row.type, channel, value)
    })
  }

  return (
    <tr className={`border-b border-gray-100 ${pending ? 'opacity-60' : ''}`}>
      <td className="py-3 pr-4 align-top">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-[#002058]">{row.label}</span>
          {!row.wired && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 uppercase tracking-wide">
              Not yet wired
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{row.description}</p>
        {row.note && (
          <p className="text-xs text-amber-600 mt-0.5">⚠ {row.note}</p>
        )}
      </td>
      <td className="py-3 px-4 align-middle text-center">
        <Toggle checked={row.emailEnabled} onChange={v => toggle('email', v)} />
      </td>
      <td className="py-3 px-4 align-middle text-center">
        <Toggle checked={row.smsEnabled} onChange={v => toggle('sms', v)} />
      </td>
    </tr>
  )
}

export default function NotificationConfigTable({ rows }: { rows: Row[] }) {
  // Sort: wired first, then alphabetical within each group
  const sorted = [...rows].sort((a, b) => {
    if (a.wired !== b.wired) return a.wired ? -1 : 1
    return a.label.localeCompare(b.label)
  })

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="py-2.5 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Notification
            </th>
            <th className="py-2.5 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">
              Email
            </th>
            <th className="py-2.5 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">
              SMS
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <ConfigRow key={row.type} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
