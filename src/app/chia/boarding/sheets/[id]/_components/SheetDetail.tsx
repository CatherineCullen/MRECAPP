'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  claimSlot, releaseSlot, updateSlotNote,
  updateSheetMeta, deleteSheet, deleteSlot,
} from '../../actions'
import CopyAsTextButton from './CopyAsTextButton'

export type SlotRow = {
  id:                string
  position:          number
  start_time:        string | null
  duration_minutes:  number | null
  horse_id:          string | null
  horse_name:        string | null
  signed_up_by:      { first_name: string | null; last_name: string | null; preferred_name: string | null; is_organization: boolean | null; organization_name: string | null } | null
  signed_up_by_name: string | null
  notes:             string | null
}

export type HorseOption = { id: string; barn_name: string; status: string | null }

export type SheetDetailProps = {
  sheet: {
    id:           string
    title:        string
    date:         string
    mode:         'timed' | 'ordered'
    description:  string | null
    providerName: string
    serviceName:  string | null
  }
  slots:  SlotRow[]
  horses: HorseOption[]
}

function fmtClock(t: string | null): string {
  if (!t) return ''
  const [hh, mm] = t.split(':').map(Number)
  const period   = hh >= 12 ? 'pm' : 'am'
  const h12      = ((hh + 11) % 12) + 1
  return `${h12}:${String(mm).padStart(2, '0')}${period}`
}

function fmtRange(start: string | null, dur: number | null): string {
  if (!start || !dur) return ''
  const [hh, mm] = start.split(':').map(Number)
  const total    = hh * 60 + mm + dur
  const endHH    = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const endMM    = String(total % 60).padStart(2, '0')
  return `${fmtClock(start)}–${fmtClock(`${endHH}:${endMM}:00`)}`
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function SheetDetail(props: SheetDetailProps) {
  const router = useRouter()
  const { sheet } = props

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(sheet.title)
  const [description, setDescription] = useState(sheet.description ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function saveMeta() {
    setError(null)
    startTransition(async () => {
      const r = await updateSheetMeta({
        sheetId: sheet.id, title, description: description.trim() || null,
      })
      if (r.error) { setError(r.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  function destroySheet() {
    if (!confirm('Delete this sheet? Anyone signed up will be removed.')) return
    startTransition(async () => {
      const r = await deleteSheet(sheet.id)
      if (r.error) { setError(r.error); return }
      router.push('/chia/boarding/sheets')
      router.refresh()
    })
  }

  return (
    <div className="mt-2">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs text-[#444650]">{fmtDate(sheet.date)}</div>
          {editing ? (
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="text-xl font-semibold text-[#191c1e] border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
            />
          ) : (
            <h1 className="text-xl font-semibold text-[#191c1e]">{sheet.title}</h1>
          )}
          <div className="text-sm text-[#444650] mt-0.5">
            {sheet.providerName}{sheet.serviceName ? ` · ${sheet.serviceName}` : ''}
            <span className="text-[#9095a3] capitalize"> · {sheet.mode}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CopyAsTextButton
            sheet={{
              title:       sheet.title,
              date:        sheet.date,
              mode:        sheet.mode,
              description: sheet.description,
              slots: props.slots.map(s => ({
                position:         s.position,
                start_time:       s.start_time,
                duration_minutes: s.duration_minutes,
                horse_name:       s.horse_name,
                signed_up_by:     s.signed_up_by,
                notes:            s.notes,
              })),
            }}
          />
          {editing ? (
            <>
              <button
                onClick={saveMeta}
                disabled={pending}
                className="text-xs font-semibold text-white bg-[#002058] px-2.5 py-1 rounded hover:bg-[#001742] disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setTitle(sheet.title); setDescription(sheet.description ?? '') }}
                disabled={pending}
                className="text-xs text-[#444650] hover:text-[#191c1e]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-semibold text-[#056380] hover:underline"
              >
                Edit
              </button>
              <button
                onClick={destroySheet}
                disabled={pending}
                className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Description shown at top of the sheet (optional)"
          className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 focus:outline-none focus:border-[#002058] mb-4"
        />
      ) : sheet.description ? (
        <div className="bg-[#f7f9fc] rounded p-3 text-sm text-[#191c1e] whitespace-pre-wrap mb-4">
          {sheet.description}
        </div>
      ) : null}

      {error && <div className="text-xs text-red-700 mb-2">{error}</div>}

      <div className="text-[10px] text-[#7a5a00] mb-2">
        Notes are visible to everyone with access to this sheet.
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        {props.slots.map(slot => (
          <SlotRowView
            key={slot.id}
            slot={slot}
            mode={sheet.mode}
            horses={props.horses}
          />
        ))}
      </div>
    </div>
  )
}

function SlotRowView({ slot, mode, horses }: {
  slot:   SlotRow
  mode:   'timed' | 'ordered'
  horses: HorseOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [horseId, setHorseId] = useState('')
  const [note, setNote] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(slot.notes ?? '')

  const label = mode === 'timed'
    ? fmtRange(slot.start_time, slot.duration_minutes) || '—'
    : `Slot ${slot.position}`

  function claim() {
    setError(null)
    if (!horseId) return setError('Pick a horse')
    startTransition(async () => {
      const r = await claimSlot({ slotId: slot.id, horseId, note: note.trim() || null })
      if (r.error) { setError(r.error); return }
      setAdding(false); setHorseId(''); setNote('')
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

  function destroy() {
    if (!confirm('Delete this slot?')) return
    startTransition(async () => {
      const r = await deleteSlot(slot.id)
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
    <div className="border-t border-[#e7e8ed] first:border-t-0 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="text-xs font-semibold text-[#444650] w-8 pt-0.5">{slot.position}.</div>
        <div className="text-sm text-[#191c1e] w-32 pt-0.5">{label}</div>

        <div className="flex-1 min-w-0">
          {slot.horse_id ? (
            <div>
              <div className="text-sm text-[#191c1e]">
                <span className="font-semibold">{slot.horse_name}</span>
                {slot.signed_up_by_name && (
                  <span className="text-[#9095a3]"> · {slot.signed_up_by_name}</span>
                )}
              </div>
              {editingNote ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    placeholder="Note"
                    className="flex-1 text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
                  />
                  <button
                    onClick={saveNote}
                    disabled={pending}
                    className="text-xs font-semibold text-[#002058] hover:underline disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingNote(false); setNoteDraft(slot.notes ?? '') }}
                    className="text-xs text-[#444650] hover:text-[#191c1e]"
                  >
                    Cancel
                  </button>
                </div>
              ) : slot.notes ? (
                <div className="text-xs text-[#444650] mt-0.5">
                  {slot.notes}
                  <button
                    onClick={() => setEditingNote(true)}
                    className="text-[#056380] hover:underline ml-2"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingNote(true)}
                  className="text-[10px] text-[#056380] hover:underline mt-0.5"
                >
                  + Add note
                </button>
              )}
            </div>
          ) : adding ? (
            <div className="space-y-2">
              <select
                value={horseId}
                onChange={e => setHorseId(e.target.value)}
                className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1 bg-white focus:outline-none focus:border-[#002058]"
              >
                <option value="">— pick horse —</option>
                {horses.map(h => (
                  <option key={h.id} value={h.id}>{h.barn_name}</option>
                ))}
              </select>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={claim}
                  disabled={pending}
                  className="text-xs font-semibold text-white bg-[#002058] px-2.5 py-1 rounded hover:bg-[#001742] disabled:opacity-50"
                >
                  Sign up
                </button>
                <button
                  onClick={() => { setAdding(false); setHorseId(''); setNote('') }}
                  className="text-xs text-[#444650] hover:text-[#191c1e]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="text-xs text-[#056380] hover:underline"
            >
              + Sign someone up
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          {slot.horse_id ? (
            <button
              onClick={release}
              disabled={pending}
              className="text-[#056380] hover:underline disabled:opacity-50"
            >
              Release
            </button>
          ) : (
            <button
              onClick={destroy}
              disabled={pending}
              className="text-red-700 hover:underline disabled:opacity-50"
            >
              Delete slot
            </button>
          )}
        </div>
      </div>
      {error && <div className="text-xs text-red-700 mt-1 ml-11">{error}</div>}
    </div>
  )
}
