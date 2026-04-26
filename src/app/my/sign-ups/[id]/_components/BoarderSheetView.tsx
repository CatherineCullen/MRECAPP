'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { claimSlot, releaseSlot, updateSlotNote } from '@/app/chia/boarding/sheets/actions'
import { formatSheetAsText } from '@/app/chia/boarding/sheets/_lib/sheetText'

export type BoarderSlot = {
  id:                string
  position:          number
  start_time:        string | null
  duration_minutes:  number | null
  horse_id:          string | null
  horse_name:        string | null
  signed_up_by_id:   string | null
  signed_up_by_name: string | null
  notes:             string | null
  isMine:            boolean
}

export type BoarderSheetProps = {
  sheet: {
    id:           string
    title:        string
    date:         string
    mode:         'timed' | 'ordered'
    description:  string | null
    providerName: string
    serviceName:  string | null
  }
  slots:      BoarderSlot[]
  myHorses:   { id: string; barn_name: string }[]
  isAdmin:    boolean
  myPersonId: string | null
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

function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function BoarderSheetView(props: BoarderSheetProps) {
  const { sheet, slots, myHorses, isAdmin, myPersonId } = props
  const [copied, setCopied] = useState(false)

  async function copyAsText() {
    const text = formatSheetAsText({
      title:       sheet.title,
      date:        sheet.date,
      mode:        sheet.mode,
      description: sheet.description,
      slots: slots.map(s => ({
        position:         s.position,
        start_time:       s.start_time,
        duration_minutes: s.duration_minutes,
        horse_name:       s.horse_name,
        signed_up_by:     null,
        notes:            s.notes,
      })),
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
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-xs text-on-surface-muted">{fmtDate(sheet.date)}</div>
          <h1 className="text-lg font-bold text-on-surface">{sheet.title}</h1>
          <div className="text-xs text-on-surface-muted">
            {sheet.providerName}{sheet.serviceName ? ` · ${sheet.serviceName}` : ''}
          </div>
        </div>
        <button
          onClick={copyAsText}
          className="text-[11px] font-semibold text-on-secondary-container"
        >
          {copied ? 'Copied!' : 'Copy as text'}
        </button>
      </div>

      {sheet.description && (
        <div className="bg-surface-lowest rounded-lg p-3 text-sm text-on-surface whitespace-pre-wrap mt-3">
          {sheet.description}
        </div>
      )}

      <div className="text-[11px] text-on-surface-muted mt-3 mb-2">
        Notes are visible to everyone with access to this sheet.
      </div>

      <div className="bg-surface-lowest rounded-lg overflow-hidden">
        {slots.map(slot => (
          <BoarderSlotRow
            key={slot.id}
            slot={slot}
            mode={sheet.mode}
            myHorses={myHorses}
            isAdmin={isAdmin}
            myPersonId={myPersonId}
          />
        ))}
      </div>
    </div>
  )
}

function BoarderSlotRow({ slot, mode, myHorses, isAdmin, myPersonId }: {
  slot:       BoarderSlot
  mode:       'timed' | 'ordered'
  myHorses:   { id: string; barn_name: string }[]
  isAdmin:    boolean
  myPersonId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [horseId, setHorseId] = useState(myHorses[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(slot.notes ?? '')

  const label = mode === 'timed'
    ? fmtRange(slot.start_time, slot.duration_minutes) || '—'
    : `Slot ${slot.position}`

  const canEditThisSlot = isAdmin || (slot.signed_up_by_id && slot.signed_up_by_id === myPersonId)

  function claim() {
    setError(null)
    if (!horseId) return setError('Pick a horse')
    startTransition(async () => {
      const r = await claimSlot({ slotId: slot.id, horseId, note: note.trim() || null })
      if (r.error) { setError(r.error); return }
      setAdding(false); setNote('')
      router.refresh()
    })
  }

  function release() {
    if (!confirm('Release this slot?')) return
    startTransition(async () => {
      const r = await releaseSlot(slot.id)
      if (r.error) { setError(r.error); return }
      router.refresh()
    })
  }

  function saveNote() {
    startTransition(async () => {
      const r = await updateSlotNote({ slotId: slot.id, note: noteDraft.trim() || null })
      if (r.error) { setError(r.error); return }
      setEditingNote(false)
      router.refresh()
    })
  }

  return (
    <div className="border-t border-surface-low first:border-t-0 px-3 py-3">
      <div className="flex items-baseline gap-3">
        <div className="text-xs font-semibold text-on-surface-muted w-6">{slot.position}.</div>
        <div className="text-xs text-on-surface w-24 shrink-0">{label}</div>
        <div className="flex-1 min-w-0">
          {slot.horse_id ? (
            <div>
              <div className="text-sm text-on-surface">
                <span className="font-semibold">{slot.horse_name}</span>
                {slot.signed_up_by_name && (
                  <span className="text-on-surface-muted"> · {slot.signed_up_by_name}</span>
                )}
                {slot.isMine && (
                  <span className="ml-2 text-[10px] font-semibold text-on-secondary-container uppercase tracking-wider">Yours</span>
                )}
              </div>
              {editingNote ? (
                <div className="mt-1.5 space-y-1.5">
                  <input
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    placeholder="Note"
                    className="w-full text-xs border border-surface-low rounded px-2 py-1 bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveNote}
                      disabled={pending}
                      className="text-xs font-semibold text-on-secondary-container disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingNote(false); setNoteDraft(slot.notes ?? '') }}
                      className="text-xs text-on-surface-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : slot.notes ? (
                <div className="text-xs text-on-surface-muted mt-0.5">
                  {slot.notes}
                  {canEditThisSlot && (
                    <button onClick={() => setEditingNote(true)} className="text-on-secondary-container ml-2">
                      Edit
                    </button>
                  )}
                </div>
              ) : canEditThisSlot ? (
                <button onClick={() => setEditingNote(true)} className="text-[11px] text-on-secondary-container mt-0.5">
                  + Add note
                </button>
              ) : null}
            </div>
          ) : adding ? (
            <div className="space-y-1.5">
              <select
                value={horseId}
                onChange={e => setHorseId(e.target.value)}
                className="w-full text-sm border border-surface-low rounded px-2 py-1 bg-white"
              >
                {myHorses.map(h => (
                  <option key={h.id} value={h.id}>{h.barn_name}</option>
                ))}
              </select>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full text-xs border border-surface-low rounded px-2 py-1 bg-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={claim}
                  disabled={pending}
                  className="text-xs font-semibold text-white bg-primary px-2.5 py-1 rounded disabled:opacity-50"
                >
                  Sign up
                </button>
                <button
                  onClick={() => { setAdding(false); setNote('') }}
                  className="text-xs text-on-surface-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : myHorses.length === 0 ? (
            <span className="text-xs text-on-surface-muted">Open</span>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="text-xs font-semibold text-on-secondary-container"
            >
              + Sign up
            </button>
          )}
        </div>

        {slot.horse_id && canEditThisSlot && (
          <button
            onClick={release}
            disabled={pending}
            className="text-xs text-on-secondary-container shrink-0 disabled:opacity-50"
          >
            Release
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-700 mt-1 ml-9">{error}</div>}
    </div>
  )
}
