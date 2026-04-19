'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resolveCarePlan, editCarePlan } from '../horses/[id]/care-plans/actions'

/**
 * Shared Temporary Care Plan card — rendered on both the per-horse view and
 * the herd-wide Care Plans view. The only UI difference between the two
 * surfaces is that the herd view prints a clickable barn-name header (the
 * card lives above a cross-horse list; the horse view is already scoped).
 *
 * Edit is implemented as a versioned supersession — the server action
 * deactivates this row (is_active=false, resolved_at stays null) and inserts
 * a new care_plan row pointing back via previous_version_id. This matches
 * CLAUDE.md principle #7 (archived, not overwritten) and preserves an audit
 * trail. From the admin's perspective it looks like an in-place edit.
 *
 * Resolve keeps its own existing semantics (is_active=false, resolved_at set,
 * optional resolution_note).
 */

export type CarePlan = {
  id:              string
  content:         string
  starts_on:       string | null
  ends_on:         string | null
  resolved_at:     string | null
  resolution_note: string | null
  source_quote:    string | null
  person:          { first_name: string; last_name: string } | null
  resolved_by_person?: { first_name: string; last_name: string } | null
}

export type HorseLabel = {
  id:        string
  barn_name: string
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ActivePlanCard({
  plan,
  horseId,
  horseLabel,
}: {
  plan:        CarePlan
  horseId:     string
  horseLabel?: HorseLabel    // present on herd view, absent on horse view
}) {
  const router = useRouter()
  const [mode, setMode]     = useState<'view' | 'resolve' | 'edit'>('view')
  const [note, setNote]     = useState('')
  const [content, setContent] = useState(plan.content)
  const [startsOn, setStartsOn] = useState(plan.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(plan.ends_on ?? '')
  const [error, setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleResolve() {
    setError(null)
    startTransition(async () => {
      await resolveCarePlan(plan.id, horseId, note || null)
      router.refresh()
    })
  }

  function handleSaveEdit() {
    setError(null)
    const trimmed = content.trim()
    if (!trimmed) { setError('Content is required.'); return }
    startTransition(async () => {
      const r = await editCarePlan({
        planId:    plan.id,
        horseId,
        content:   trimmed,
        starts_on: startsOn || null,
        ends_on:   endsOn   || null,
      })
      if (r?.error) { setError(r.error); return }
      setMode('view')
      router.refresh()
    })
  }

  function cancelEdit() {
    setContent(plan.content)
    setStartsOn(plan.starts_on ?? '')
    setEndsOn(plan.ends_on ?? '')
    setError(null)
    setMode('view')
  }

  const addedBy = plan.person ? `${plan.person.first_name} ${plan.person.last_name}` : null
  const showingForm = mode === 'edit'

  return (
    <div className="border border-[#ffddb3] bg-[#fffbf5] rounded p-3">
      {horseLabel && (
        <Link
          href={`/chia/herd/horses/${horseLabel.id}`}
          className="inline-block text-xs font-bold text-[#056380] hover:text-[#002058] uppercase tracking-wider mb-1.5"
        >
          {horseLabel.barn_name}
        </Link>
      )}

      {!showingForm ? (
        <div className="text-sm text-[#191c1e] whitespace-pre-wrap">{plan.content}</div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
            className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
            autoFocus
          />
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-[#444650]">
            <label className="flex items-center gap-1">
              Starts
              <input
                type="date"
                value={startsOn}
                onChange={e => setStartsOn(e.target.value)}
                className="border border-[#c4c6d1] rounded px-1.5 py-0.5 text-[11px] text-[#191c1e]"
              />
            </label>
            <label className="flex items-center gap-1">
              Ends
              <input
                type="date"
                value={endsOn}
                onChange={e => setEndsOn(e.target.value)}
                className="border border-[#c4c6d1] rounded px-1.5 py-0.5 text-[11px] text-[#191c1e]"
              />
              {!endsOn && <span className="text-[#7c4b00]">— no end date</span>}
            </label>
          </div>
        </div>
      )}

      {!showingForm && plan.source_quote && (
        <div className="mt-1 text-xs text-[#444650] italic">&ldquo;{plan.source_quote}&rdquo;</div>
      )}

      {!showingForm && (
        <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-[#444650]">
          {plan.starts_on && <span>Started {formatDate(plan.starts_on)}</span>}
          {plan.ends_on
            ? <span className="text-[#7c4b00]">Ends {formatDate(plan.ends_on)}</span>
            : <span className="text-[#7c4b00] font-semibold">No end date</span>
          }
          {addedBy && <span>Added by {addedBy}</span>}
        </div>
      )}

      {/* Action row */}
      {mode === 'view' && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => setMode('edit')}
            className="text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
          >
            Edit
          </button>
          <button
            onClick={() => setMode('resolve')}
            className="text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
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
            className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380] resize-none"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleResolve}
              disabled={pending}
              className="text-[10px] font-semibold text-white bg-[#444650] hover:bg-[#191c1e] px-2.5 py-1 rounded disabled:opacity-60"
            >
              {pending ? 'Resolving…' : 'Confirm resolve'}
            </button>
            <button
              onClick={() => { setMode('view'); setNote('') }}
              className="text-[10px] text-[#444650] hover:text-[#191c1e]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleSaveEdit}
            disabled={pending}
            className="text-[10px] font-semibold text-white bg-[#056380] hover:bg-[#002058] px-2.5 py-1 rounded disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={cancelEdit}
            disabled={pending}
            className="text-[10px] text-[#444650] hover:text-[#191c1e]"
          >
            Cancel
          </button>
          {error && <span className="text-[10px] text-red-700 ml-1">{error}</span>}
        </div>
      )}
    </div>
  )
}

export function ResolvedPlanCard({ plan }: { plan: CarePlan }) {
  const resolvedBy = plan.resolved_by_person
    ? `${plan.resolved_by_person.first_name} ${plan.resolved_by_person.last_name}`
    : null

  return (
    <div className="border border-[#e0e3e6] bg-[#f7f9fc] rounded p-3 opacity-75">
      <div className="text-sm text-[#444650] whitespace-pre-wrap line-through decoration-[#c4c6d1]">{plan.content}</div>
      {plan.resolution_note && (
        <div className="mt-1 text-xs text-[#444650]">Note: {plan.resolution_note}</div>
      )}
      <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-[#444650]">
        {plan.starts_on && <span>Started {formatDate(plan.starts_on)}</span>}
        {plan.resolved_at && <span>Resolved {formatDateTime(plan.resolved_at)}</span>}
        {resolvedBy && <span>by {resolvedBy}</span>}
      </div>
    </div>
  )
}
