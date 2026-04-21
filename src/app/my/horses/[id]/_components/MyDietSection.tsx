'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveMyDiet } from '../diet/actions'

export type Diet = {
  id:             string
  am_feed:        string | null
  am_supplements: string | null
  am_hay:         string | null
  pm_feed:        string | null
  pm_supplements: string | null
  pm_hay:         string | null
  notes:          string | null
  version:        number
  updated_at:     string
} | null

const inputCls = 'w-full border border-outline rounded px-2 py-1 text-sm text-on-surface focus:outline-none focus:border-primary bg-surface-lowest'
const labelCls = 'block text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider mb-0.5'

function ReadRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className={labelCls}>{label}</div>
      <div className="text-sm text-on-surface whitespace-pre-wrap">{value}</div>
    </div>
  )
}

function ReadBlock({ label, feed, supplements, hay }: {
  label: string
  feed: string | null
  supplements: string | null
  hay: string | null
}) {
  if (!feed && !supplements && !hay) return null
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold text-on-surface uppercase tracking-wider">{label}</div>
      <ReadRow label="Feed"               value={feed} />
      <ReadRow label="Supplements / Meds" value={supplements} />
      <ReadRow label="Hay"                value={hay} />
    </div>
  )
}

export default function MyDietSection({ horseId, diet }: { horseId: string; diet: Diet }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [amFeed,         setAmFeed]         = useState(diet?.am_feed        ?? '')
  const [amSupplements,  setAmSupplements]  = useState(diet?.am_supplements ?? '')
  const [amHay,          setAmHay]          = useState(diet?.am_hay         ?? '')
  const [pmFeed,         setPmFeed]         = useState(diet?.pm_feed        ?? '')
  const [pmSupplements,  setPmSupplements]  = useState(diet?.pm_supplements ?? '')
  const [pmHay,          setPmHay]          = useState(diet?.pm_hay         ?? '')
  const [notes,          setNotes]          = useState(diet?.notes          ?? '')

  const hasAny = diet && (diet.am_feed || diet.am_supplements || diet.am_hay || diet.pm_feed || diet.pm_supplements || diet.pm_hay || diet.notes)

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const r = await saveMyDiet(horseId, diet?.id ?? null, {
        am_feed:        amFeed,
        am_supplements: amSupplements,
        am_hay:         amHay,
        pm_feed:        pmFeed,
        pm_supplements: pmSupplements,
        pm_hay:         pmHay,
        notes,
      })
      if (r?.error) { setError(r.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  function handleCancel() {
    setAmFeed(diet?.am_feed ?? '')
    setAmSupplements(diet?.am_supplements ?? '')
    setAmHay(diet?.am_hay ?? '')
    setPmFeed(diet?.pm_feed ?? '')
    setPmSupplements(diet?.pm_supplements ?? '')
    setPmHay(diet?.pm_hay ?? '')
    setNotes(diet?.notes ?? '')
    setError(null)
    setEditing(false)
  }

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide"
        >
          Diet
        </button>
        {expanded && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-on-secondary-container"
          >
            {hasAny ? 'Edit' : '+ Add'}
          </button>
        )}
      </div>

      {expanded && !editing && (
        <div className="mt-2">
          {!hasAny ? (
            <p className="text-sm text-on-surface-muted">No diet record on file.</p>
          ) : (
            <div className="space-y-3">
              <ReadBlock
                label="AM"
                feed={diet!.am_feed}
                supplements={diet!.am_supplements}
                hay={diet!.am_hay}
              />
              <ReadBlock
                label="PM"
                feed={diet!.pm_feed}
                supplements={diet!.pm_supplements}
                hay={diet!.pm_hay}
              />
              {diet!.notes && (
                <div>
                  <div className={labelCls}>Notes</div>
                  <div className="text-sm text-on-surface whitespace-pre-wrap">{diet!.notes}</div>
                </div>
              )}
              {diet!.updated_at && (
                <div className="text-[10px] text-on-surface-muted">
                  Updated {new Date(diet!.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {diet!.version > 1 && ` · v${diet!.version}`}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && editing && (
        <div className="mt-2 space-y-3">
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-on-surface uppercase tracking-wider">AM</div>
            <label className="block">
              <span className={labelCls}>Feed</span>
              <input type="text" value={amFeed} onChange={e => setAmFeed(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Supplements / Meds</span>
              <input type="text" value={amSupplements} onChange={e => setAmSupplements(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Hay</span>
              <input type="text" value={amHay} onChange={e => setAmHay(e.target.value)} className={inputCls} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-on-surface uppercase tracking-wider">PM</div>
            <label className="block">
              <span className={labelCls}>Feed</span>
              <input type="text" value={pmFeed} onChange={e => setPmFeed(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Supplements / Meds</span>
              <input type="text" value={pmSupplements} onChange={e => setPmSupplements(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Hay</span>
              <input type="text" value={pmHay} onChange={e => setPmHay(e.target.value)} className={inputCls} />
            </label>
          </div>

          <label className="block">
            <span className={labelCls}>Notes</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={pending}
              className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              disabled={pending}
              className="text-xs text-on-surface-muted"
            >
              Cancel
            </button>
            {error && <span className="text-[10px] text-error ml-1">{error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
