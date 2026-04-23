'use client'

import { useState, useTransition } from 'react'
import {
  addHorseHealthItem,
  updateHorseHealthItem,
  deleteHorseHealthItem,
} from '../_lib/healthItemActions'

export type HorseHealthItem = {
  id:                   string
  last_done:            string | null
  next_due:             string | null
  current_note:         string | null
  type: {
    id:                      string
    name:                    string
    is_essential:            boolean
    show_in_herd_dashboard:  boolean
  }
}

export type HealthItemTypeOption = {
  id:                     string
  name:                   string
  is_essential:           boolean
  show_in_herd_dashboard: boolean
}

const DUE_SOON_DAYS = 30

type Bucket = 'overdue' | 'due_soon' | 'ok' | 'no_due_date'

function bucketFor(nextDue: string | null): Bucket {
  if (!nextDue) return 'no_due_date'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(nextDue + 'T00:00:00')
  const daysOut = Math.floor((due.getTime() - today.getTime()) / 86400000)
  if (daysOut < 0)              return 'overdue'
  if (daysOut <= DUE_SOON_DAYS) return 'due_soon'
  return 'ok'
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

export default function HorseHealthItemsSection({
  horseId,
  items,
  catalog,
}: {
  horseId: string
  items:   HorseHealthItem[]
  catalog: HealthItemTypeOption[]
}) {
  // Defensive defaults — during dev recompile the page and component can
  // be briefly out of sync and a prop may arrive undefined. Both settle
  // to real arrays on the next render.
  const safeItems:   HorseHealthItem[]       = items   ?? []
  const safeCatalog: HealthItemTypeOption[]  = catalog ?? []

  const [expanded, setExpanded]   = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding,    setAdding]    = useState(false)

  // Sort by next_due ascending (soonest first), nulls last
  const sorted = [...safeItems].sort((a, b) => {
    if (!a.next_due && !b.next_due) return a.type.name.localeCompare(b.type.name)
    if (!a.next_due) return 1
    if (!b.next_due) return -1
    return a.next_due.localeCompare(b.next_due)
  })

  const attention = sorted.filter(i => {
    const b = bucketFor(i.next_due)
    return b === 'overdue' || b === 'due_soon'
  })
  const rest = sorted.filter(i => !attention.includes(i))

  // Types not already used by this horse (so the Add picker doesn't offer
  // duplicates — add server action would reject those anyway).
  const usedTypeIds = new Set(safeItems.map(i => i.type.id))
  const addableTypes = safeCatalog.filter(t => !usedTypeIds.has(t.id))

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          Health Items
          <span className="ml-1.5 text-[10px] font-normal text-[#444650] normal-case tracking-normal">
            ({attention.length} need attention / {sorted.length} total)
          </span>
        </h2>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null) }}
            className="text-[11px] font-semibold text-[#056380] hover:text-[#002058]"
          >
            + Add
          </button>
        )}
      </div>

      <div className="px-4 pt-1 pb-2">
        {adding && (
          <EditForm
            horseId={horseId}
            initial={null}
            catalog={addableTypes}
            onCancel={() => setAdding(false)}
            onDone={()   => setAdding(false)}
          />
        )}

        {sorted.length === 0 && !adding && (
          <p className="py-2 text-xs text-[#444650]">No health items recorded.</p>
        )}

        {attention.length === 0 && sorted.length > 0 && !adding && (
          <p className="py-2 text-xs text-[#444650]">Nothing overdue or due within 30 days.</p>
        )}

        {attention.map(i => (
          editingId === i.id
            ? <EditForm
                key={i.id}
                horseId={horseId}
                initial={i}
                catalog={safeCatalog}
                onCancel={() => setEditingId(null)}
                onDone={()   => setEditingId(null)}
              />
            : <Row
                key={i.id}
                item={i}
                onEdit={()   => { setEditingId(i.id); setAdding(false) }}
                horseId={horseId}
              />
        ))}

        {expanded && rest.map(i => (
          editingId === i.id
            ? <EditForm
                key={i.id}
                horseId={horseId}
                initial={i}
                catalog={safeCatalog}
                onCancel={() => setEditingId(null)}
                onDone={()   => setEditingId(null)}
              />
            : <Row
                key={i.id}
                item={i}
                onEdit={()   => { setEditingId(i.id); setAdding(false) }}
                horseId={horseId}
              />
        ))}

        {rest.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-1 text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
          >
            {expanded ? 'Show less' : `Show ${rest.length} more`}
          </button>
        )}
      </div>
    </section>
  )
}

function Row({
  item,
  onEdit,
  horseId,
}: {
  item:    HorseHealthItem
  onEdit:  () => void
  horseId: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showNote, setShowNote] = useState(false)
  const hasNote = !!item.current_note

  const b = bucketFor(item.next_due)
  const pillClass =
    b === 'overdue'  ? 'bg-[#ffdad6] text-[#b00020] font-semibold' :
    b === 'due_soon' ? 'bg-[#ffddb3] text-[#7c4b00] font-medium'   :
                       'text-[#444650]'
  const pillLabel =
    b === 'overdue'     ? `Overdue — due ${formatDate(item.next_due)}` :
    b === 'due_soon'    ? `Due ${formatDate(item.next_due)}`            :
    b === 'ok'          ? `Next due ${formatDate(item.next_due)}`       :
                          'No upcoming date'

  function onDelete() {
    if (!confirm(`Delete the ${item.type.name} health item for this horse?`)) return
    setError(null)
    startTransition(async () => {
      const r = await deleteHorseHealthItem(horseId, item.id)
      if (r.error) setError(r.error)
    })
  }

  return (
    <div className="py-2 border-b border-[#f2f4f7] last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          {hasNote ? (
            <button
              onClick={() => setShowNote(v => !v)}
              className="text-[10px] text-[#444650] hover:text-[#191c1e] w-3 text-left"
              aria-label={showNote ? 'Hide note' : 'Show note'}
              title={showNote ? 'Hide note' : 'Show note'}
            >
              {showNote ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-3" />
          )}
          <span className="text-xs font-semibold text-[#191c1e]">{item.type.name}</span>
          {item.type.is_essential && (
            <span className="text-[9px] font-semibold bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded uppercase tracking-wider">
              Essential
            </span>
          )}
          {!item.type.show_in_herd_dashboard && (
            <span className="text-[9px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider" title="Not shown on the herd dashboard grid.">
              Not on grid
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {item.last_done && (
            <span className="text-[10px] text-[#444650]">
              Last: {formatDate(item.last_done)}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded ${pillClass}`}>
            {pillLabel}
          </span>
          <button
            onClick={onEdit}
            className="text-[10px] font-semibold text-[#056380] hover:text-[#002058]"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={pending}
            className="text-[10px] font-semibold text-[#b00020] hover:underline disabled:opacity-50"
          >
            {pending ? '…' : 'Delete'}
          </button>
        </div>
      </div>
      {hasNote && showNote && (
        <div className="mt-1 ml-5 text-[11px] text-[#444650] whitespace-pre-wrap">
          {item.current_note}
        </div>
      )}
      {error && (
        <div className="mt-1 text-[10px] text-[#b00020]">{error}</div>
      )}
    </div>
  )
}

function EditForm({
  horseId,
  initial,
  catalog,
  onCancel,
  onDone,
}: {
  horseId:  string
  initial:  HorseHealthItem | null    // null → add mode
  catalog:  HealthItemTypeOption[]
  onCancel: () => void
  onDone:   () => void
}) {
  const [typeId,   setTypeId]   = useState<string>(initial?.type.id ?? catalog[0]?.id ?? '')
  const [lastDone, setLastDone] = useState<string>(initial?.last_done ?? '')
  const [nextDue,  setNextDue]  = useState<string>(initial?.next_due ?? '')
  // Notes start blank on every open — each save logs a new health_event, so
  // the textarea isn't the "standing note for this row," it's the "note for
  // this new dose I'm recording right now."
  const [notes,    setNotes]    = useState<string>('')
  const [error,    setError]    = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const input = {
        typeId,
        lastDone: lastDone || null,
        nextDue:  nextDue  || null,
        notes:    notes.trim() || null,
      }
      const r = initial
        ? await updateHorseHealthItem(horseId, initial.id, input)
        : await addHorseHealthItem(horseId, input)
      if (r.error) { setError(r.error); return }
      onDone()
    })
  }

  const canSubmit = !!typeId && !pending

  return (
    <form onSubmit={onSubmit} className="py-2 border-b border-[#f2f4f7] last:border-0 bg-[#f7f9fc] -mx-4 px-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">Type</label>
          {initial ? (
            <select
              value={typeId}
              onChange={e => setTypeId(e.target.value)}
              className="w-full border border-[#c4c6d1] rounded px-2 py-1 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380]"
            >
              {/* In edit mode, include the current type even if it would be filtered */}
              {!catalog.find(c => c.id === typeId) && initial && (
                <option value={typeId}>{initial.type.name}</option>
              )}
              {catalog.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : catalog.length === 0 ? (
            <div className="text-[11px] text-[#7c4b00]">All catalog items are already recorded for this horse.</div>
          ) : (
            <select
              value={typeId}
              onChange={e => setTypeId(e.target.value)}
              className="w-full border border-[#c4c6d1] rounded px-2 py-1 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380]"
            >
              {catalog.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">Last done</label>
          <input
            type="date"
            value={lastDone}
            onChange={e => setLastDone(e.target.value)}
            className="border border-[#c4c6d1] rounded px-2 py-1 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">Next due</label>
          <input
            type="date"
            value={nextDue}
            onChange={e => setNextDue(e.target.value)}
            className="border border-[#c4c6d1] rounded px-2 py-1 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380]"
          />
        </div>
        <div className="flex-1 min-w-[14rem]">
          <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Quest Plus"
            className="w-full border border-[#c4c6d1] rounded px-2 py-1 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380]"
          />
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary text-white text-[11px] font-semibold px-3 py-1 rounded disabled:opacity-50"
          >
            {pending ? 'Saving…' : initial ? 'Save' : 'Add'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] text-[#444650] hover:text-[#191c1e]"
          >
            Cancel
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-1 text-[10px] text-[#b00020]">{error}</div>
      )}
    </form>
  )
}
