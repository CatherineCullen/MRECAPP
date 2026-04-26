'use client'

import { useState } from 'react'
import { formatSheetAsText, type SheetTextSlot } from '@/app/chia/boarding/sheets/_lib/sheetText'
import { displayName } from '@/lib/displayName'

export type ProviderSheetSlot = {
  position:         number
  start_time:       string | null
  duration_minutes: number | null
  horse_name:       string | null
  signed_up_by:     { first_name: string | null; last_name: string | null; preferred_name: string | null; is_organization: boolean | null; organization_name: string | null } | null
  notes:            string | null
}

export type ProviderSheetData = {
  id:          string
  title:       string
  date:        string
  mode:        'timed' | 'ordered'
  description: string | null
  slots:       ProviderSheetSlot[]
}

function fmtClock(t: string | null) {
  if (!t) return ''
  const [hh, mm] = t.split(':').map(Number)
  const period   = hh >= 12 ? 'pm' : 'am'
  const h12      = ((hh + 11) % 12) + 1
  return `${h12}:${String(mm).padStart(2, '0')}${period}`
}

function fmtRange(start: string | null, dur: number | null) {
  if (!start || !dur) return ''
  const [hh, mm] = start.split(':').map(Number)
  const total    = hh * 60 + mm + dur
  const endHH    = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const endMM    = String(total % 60).padStart(2, '0')
  return `${fmtClock(start)}–${fmtClock(`${endHH}:${endMM}:00`)}`
}

/**
 * Read-only roster shown to the provider when they scan their QR on a day
 * that has a sign-up sheet. Lets them see who's expected and copy the list
 * to text. Logging happens through the scan form below, not from here.
 */
export default function ProviderSheetRoster({ sheet }: { sheet: ProviderSheetData }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const text = formatSheetAsText({
      title:       sheet.title,
      date:        sheet.date,
      mode:        sheet.mode,
      description: sheet.description,
      slots:       sheet.slots as SheetTextSlot[],
    })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this:', text)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[#444650]">Today's roster</div>
          <h2 className="text-base font-bold text-[#191c1e]">{sheet.title}</h2>
        </div>
        <button
          onClick={copy}
          className="text-xs font-semibold text-[#056380] hover:underline"
        >
          {copied ? 'Copied!' : 'Copy as text'}
        </button>
      </div>

      {sheet.description && (
        <div className="text-sm text-[#191c1e] whitespace-pre-wrap mb-3 bg-[#f7f9fc] rounded p-2">
          {sheet.description}
        </div>
      )}

      <ol className="space-y-1">
        {sheet.slots.map(slot => {
          const label = sheet.mode === 'timed'
            ? fmtRange(slot.start_time, slot.duration_minutes) || '—'
            : null
          const who = slot.signed_up_by ? displayName(slot.signed_up_by) : null
          return (
            <li key={slot.position} className="text-sm flex items-baseline gap-2">
              <span className="text-[#9095a3] w-6 shrink-0">{slot.position}.</span>
              {label && <span className="text-[#444650] w-24 shrink-0">{label}</span>}
              <span className="flex-1 min-w-0">
                {slot.horse_name ? (
                  <>
                    <span className="font-semibold text-[#191c1e]">{slot.horse_name}</span>
                    {who && <span className="text-[#9095a3]"> · {who}</span>}
                    {slot.notes && <span className="text-[#444650]"> — {slot.notes}</span>}
                  </>
                ) : (
                  <span className="text-[#9095a3] italic">open</span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
