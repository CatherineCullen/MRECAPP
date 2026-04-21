'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addMyCarePlan, resolveMyCarePlan, editMyCarePlan } from '../care-plans/actions'

export type CarePlan = {
  id:              string
  content:         string
  starts_on:       string | null
  ends_on:         string | null
  resolved_at:     string | null
  resolution_note: string | null
  source_quote:    string | null
  person?:             { first_name: string; last_name: string } | null
  resolved_by_person?: { first_name: string; last_name: string } | null
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputCls = 'w-full border border-outline rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary bg-surface-lowest'
const dateInputCls = 'border border-outline rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary bg-surface-lowest'

function ActivePlan({ plan, horseId }: { plan: CarePlan; horseId: string }) {
  const router = useRouter()
  const [mode,    setMode]    = useState<'view' | 'resolve' | 'edit'>('view')
  const [content, setContent] = useState(plan.content)
  const [starts,  setStarts]  = useState(plan.starts_on ?? '')
  const [ends,    setEnds]    = useState(plan.ends_on   ?? '')
  const [note,    setNote]    = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const addedBy = plan.person ? `${plan.person.first_name} ${plan.person.last_name}` : null

  function handleSaveEdit() {
    setError(null)
    const trimmed = content.trim()
    if (!trimmed) { setError('Content is required.'); return }
    startTransition(async () => {
      const r = await editMyCarePlan({
        planId: plan.id, horseId,
        content: trimmed,
        starts_on: starts || null,
        ends_on:   ends   || null,
      })
      if (r?.error) { setError(r.error); return }
      setMode('view')
      router.refresh()
    })
  }

  function handleResolve() {
    setError(null)
    startTransition(async () => {
      const r = await resolveMyCarePlan({ planId: plan.id, horseId, note: note || null })
      if (r?.error) { setError(r.error); return }
      router.refresh()
    })
  }

  function cancelEdit() {
    setContent(plan.content)
    setStarts(plan.starts_on ?? '')
    setEnds(plan.ends_on ?? '')
    setError(null)
    setMode('view')
  }

  return (
    <div className="bg-warning-container rounded-lg px-3 py-2.5">
      {mode !== 'edit' ? (
        <p className="text-sm text-on-surface whitespace-pre-wrap">{plan.content}</p>
      ) : (
        <div className="space-y-2">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
            className={`${inputCls} resize-y`}
            autoFocus
          />
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-on-surface-muted">
            <label className="flex items-center gap-1">
              Starts
              <input type="date" value={starts} onChange={e => setStarts(e.target.value)} className={dateInputCls} />
            </label>
            <label className="flex items-center gap-1">
              Ends
              <input type="date" value={ends} onChange={e => setEnds(e.target.value)} className={dateInputCls} />
              {!ends && <span className="text-warning">— no end date</span>}
            </label>
          </div>
        </div>
      )}

      {mode !== 'edit' && plan.source_quote && (
        <p className="mt-1 text-xs text-on-surface-muted italic">&ldquo;{plan.source_quote}&rdquo;</p>
      )}

      {mode !== 'edit' && (
        <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-on-surface-muted">
          {plan.starts_on && <span>Started {formatDate(plan.starts_on)}</span>}
          {plan.ends_on
            ? <span className="text-warning">Ends {formatDate(plan.ends_on)}</span>
            : <span className="text-warning font-semibold">No end date</span>}
          {addedBy && <span>Added by {addedBy}</span>}
        </div>
      )}

      {mode === 'view' && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => setMode('edit')}
            className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider"
          >
            Edit
          </button>
          <button
            onClick={() => setMode('resolve')}
            className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider"
          >
            Resolve
          </button>
        </div>
      )}

      {mode === 'resolve' && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Resolution note (optional)…"
            rows={2}
            className={`${inputCls} resize-none`}
            autoFocus
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleResolve}
              disabled={pending}
              className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
            >
              {pending ? 'Resolving…' : 'Confirm resolve'}
            </button>
            <button
              onClick={() => { setMode('view'); setNote('') }}
              className="text-xs text-on-surface-muted"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-[10px] text-error">{error}</p>}
        </div>
      )}

      {mode === 'edit' && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleSaveEdit}
            disabled={pending}
            className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={cancelEdit}
            disabled={pending}
            className="text-xs text-on-surface-muted"
          >
            Cancel
          </button>
          {error && <span className="text-[10px] text-error ml-1">{error}</span>}
        </div>
      )}
    </div>
  )
}

function ResolvedPlan({ plan }: { plan: CarePlan }) {
  const resolvedBy = plan.resolved_by_person
    ? `${plan.resolved_by_person.first_name} ${plan.resolved_by_person.last_name}`
    : null

  return (
    <div className="bg-surface-highest rounded-lg px-3 py-2.5 opacity-75">
      <p className="text-sm text-on-surface-muted whitespace-pre-wrap line-through">{plan.content}</p>
      {plan.resolution_note && (
        <p className="mt-1 text-xs text-on-surface-muted">Note: {plan.resolution_note}</p>
      )}
      <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-on-surface-muted">
        {plan.starts_on  && <span>Started {formatDate(plan.starts_on)}</span>}
        {plan.resolved_at && <span>Resolved {formatDateTime(plan.resolved_at)}</span>}
        {resolvedBy && <span>by {resolvedBy}</span>}
      </div>
    </div>
  )
}

function AddPlanForm({
  horseId,
  onDone,
  onCancel,
}: {
  horseId: string
  onDone:  () => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [starts,  setStarts]  = useState('')
  const [ends,    setEnds]    = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    const trimmed = content.trim()
    if (!trimmed) { setError('Content is required.'); return }
    startTransition(async () => {
      const r = await addMyCarePlan({
        horseId,
        content: trimmed,
        starts_on: starts || null,
        ends_on:   ends   || null,
      })
      if (r?.error) { setError(r.error); return }
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="bg-warning-container rounded-lg px-3 py-2.5 space-y-2">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={3}
        placeholder="e.g. Stall rest with light hand-walking 2x/day for two weeks."
        className={`${inputCls} resize-y`}
        autoFocus
      />
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-on-surface-muted">
        <label className="flex items-center gap-1">
          Starts
          <input type="date" value={starts} onChange={e => setStarts(e.target.value)} className={dateInputCls} />
        </label>
        <label className="flex items-center gap-1">
          Ends
          <input type="date" value={ends} onChange={e => setEnds(e.target.value)} className={dateInputCls} />
          {!ends && <span className="text-warning">— no end date</span>}
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={pending}
          className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={pending}
          className="text-xs text-on-surface-muted"
        >
          Cancel
        </button>
        {error && <span className="text-[10px] text-error ml-1">{error}</span>}
      </div>
    </div>
  )
}

export default function MyCarePlansSection({
  horseId,
  activePlans,
  resolvedPlans,
}: {
  horseId:       string
  activePlans:   CarePlan[]
  resolvedPlans: CarePlan[]
}) {
  const [adding, setAdding] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
          Temporary Care Plans
          {activePlans.length > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold bg-warning-container text-warning px-1.5 py-0.5 rounded">
              {activePlans.length}
            </span>
          )}
        </h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-semibold text-on-secondary-container"
          >
            + Add
          </button>
        )}
      </div>

      <div className="mt-2 space-y-2">
        {adding && (
          <AddPlanForm
            horseId={horseId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}

        {activePlans.length === 0 && !adding && (
          <p className="text-sm text-on-surface-muted">No active care plans.</p>
        )}

        {activePlans.map(plan => (
          <ActivePlan key={plan.id} plan={plan} horseId={horseId} />
        ))}
      </div>

      {resolvedPlans.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider"
          >
            {showHistory ? 'Hide history' : `View history (${resolvedPlans.length})`}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2">
              {resolvedPlans.map(plan => (
                <ResolvedPlan key={plan.id} plan={plan} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
