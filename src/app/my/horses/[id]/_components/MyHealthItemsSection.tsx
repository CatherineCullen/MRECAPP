'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addMyHorseHealthItem,
  updateMyHorseHealthItem,
  deleteMyHorseHealthItem,
} from '../health/actions'

export type HorseHealthItem = {
  id:           string
  last_done:    string | null
  next_due:     string | null
  current_note: string | null
  type: {
    id:                     string
    name:                   string
    is_essential:           boolean
    show_in_herd_dashboard: boolean
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
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputCls = 'w-full border border-outline rounded px-2 py-1 text-sm text-on-surface focus:outline-none focus:border-primary bg-surface-lowest'

export default function MyHealthItemsSection({
  horseId,
  items,
  catalog,
}: {
  horseId: string
  items:   HorseHealthItem[]
  catalog: HealthItemTypeOption[]
}) {
  const safeItems   = items   ?? []
  const safeCatalog = catalog ?? []

  const [expanded,  setExpanded]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding,    setAdding]    = useState(false)

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

  const usedTypeIds = new Set(safeItems.map(i => i.type.id))
  const addableTypes = safeCatalog.filter(t => !usedTypeIds.has(t.id))

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
          Recurring Health Items
          {attention.length > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold bg-warning-container text-warning px-1.5 py-0.5 rounded">
              {attention.length}
            </span>
          )}
        </h2>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null) }}
            className="text-xs font-semibold text-on-secondary-container"
          >
            + Add
          </button>
        )}
      </div>

      <div className="mt-2 space-y-2">
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
          <p className="text-sm text-on-surface-muted">No health items recorded.</p>
        )}

        {attention.length === 0 && sorted.length > 0 && !adding && (
          <p className="text-sm text-on-surface-muted">Nothing overdue or due within 30 days.</p>
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
      </div>

      {rest.length > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider"
        >
          {expanded ? 'Show less' : `Show ${rest.length} more`}
        </button>
      )}
    </div>
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
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showNote, setShowNote] = useState(false)
  const hasNote = !!item.current_note

  const b = bucketFor(item.next_due)
  const dueClass =
    b === 'overdue'  ? 'text-error font-semibold' :
    b === 'due_soon' ? 'text-warning font-semibold' :
                       'text-on-surface-muted'
  const dueLabel =
    b === 'overdue'     ? `Overdue — ${formatDate(item.next_due)}` :
    b === 'due_soon'    ? `Due ${formatDate(item.next_due)}`       :
    b === 'ok'          ? `Due ${formatDate(item.next_due)}`       :
                          'No date'

  function onDelete() {
    if (!confirm(`Delete the ${item.type.name} health item?`)) return
    setError(null)
    startTransition(async () => {
      const r = await deleteMyHorseHealthItem(horseId, item.id)
      if (r.error) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="bg-surface rounded-lg px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasNote ? (
              <button
                onClick={() => setShowNote(v => !v)}
                className="text-xs text-on-surface-muted"
                aria-label={showNote ? 'Hide note' : 'Show note'}
              >
                {showNote ? '▾' : '▸'}
              </button>
            ) : (
              <span className="w-3" />
            )}
            <span className="text-sm font-semibold text-on-surface">{item.type.name}</span>
            {item.type.is_essential && (
              <span className="text-[9px] font-semibold bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded uppercase tracking-wider">
                Essential
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 flex-wrap text-[10px]">
            <span className={dueClass}>{dueLabel}</span>
            {item.last_done && (
              <span className="text-on-surface-muted">Last {formatDate(item.last_done)}</span>
            )}
          </div>
          {hasNote && showNote && (
            <p className="mt-1.5 text-[11px] text-on-surface-muted whitespace-pre-wrap">
              {item.current_note}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <button
            onClick={onEdit}
            className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={pending}
            className="text-[10px] font-semibold text-error uppercase tracking-wider disabled:opacity-50"
          >
            {pending ? '…' : 'Delete'}
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-[10px] text-error">{error}</p>}
    </div>
  )
}

const NEW_TYPE = '__new__'

function EditForm({
  horseId,
  initial,
  catalog,
  onCancel,
  onDone,
}: {
  horseId:  string
  initial:  HorseHealthItem | null
  catalog:  HealthItemTypeOption[]
  onCancel: () => void
  onDone:   () => void
}) {
  const router = useRouter()
  const [typeId,      setTypeId]      = useState<string>(initial?.type.id ?? catalog[0]?.id ?? NEW_TYPE)
  const [newTypeName, setNewTypeName] = useState<string>('')
  const [lastDone,    setLastDone]    = useState<string>(initial?.last_done ?? '')
  const [nextDue,     setNextDue]     = useState<string>(initial?.next_due  ?? '')
  const [notes,       setNotes]       = useState<string>('')
  const [error,       setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isNew = typeId === NEW_TYPE

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = initial
        ? await updateMyHorseHealthItem(horseId, initial.id, {
            typeId,
            lastDone: lastDone || null,
            nextDue:  nextDue  || null,
            notes:    notes.trim() || null,
          })
        : await addMyHorseHealthItem(horseId, {
            typeId:      isNew ? null : typeId,
            newTypeName: isNew ? newTypeName.trim() : null,
            lastDone:    lastDone || null,
            nextDue:     nextDue  || null,
            notes:       notes.trim() || null,
          })
      if (r.error) { setError(r.error); return }
      router.refresh()
      onDone()
    })
  }

  const canSubmit =
    !pending &&
    (initial
      ? !!typeId && typeId !== NEW_TYPE
      : isNew
        ? !!newTypeName.trim()
        : !!typeId)

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-lg px-3 py-2.5 space-y-2">
      <div>
        <label className="block text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider mb-1">Type</label>
        <select
          value={typeId}
          onChange={e => setTypeId(e.target.value)}
          className={inputCls}
        >
          {initial && !catalog.find(c => c.id === typeId) && (
            <option value={typeId}>{initial.type.name}</option>
          )}
          {catalog.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          {!initial && (
            <option value={NEW_TYPE}>+ Add new type…</option>
          )}
        </select>
        {!initial && isNew && (
          <input
            type="text"
            value={newTypeName}
            onChange={e => setNewTypeName(e.target.value)}
            placeholder="e.g. Pergolide"
            className={`${inputCls} mt-2`}
            autoFocus
          />
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex-1 min-w-[8rem]">
          <span className="block text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider mb-1">Last done</span>
          <input
            type="date"
            value={lastDone}
            onChange={e => setLastDone(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex-1 min-w-[8rem]">
          <span className="block text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider mb-1">Next due</span>
          <input
            type="date"
            value={nextDue}
            onChange={e => setNextDue(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider mb-1">
          Notes {initial && <span className="font-normal normal-case tracking-normal">(for this dose)</span>}
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Ivermectin paste, 1 tube"
          className={inputCls}
          rows={2}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
        >
          {pending ? 'Saving…' : initial ? 'Save' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-xs text-on-surface-muted"
        >
          Cancel
        </button>
        {error && <span className="text-[10px] text-error ml-1">{error}</span>}
      </div>
    </form>
  )
}
