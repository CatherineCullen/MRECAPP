'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { expireToken, restoreToken, updateTokenNote, batchExpirePastDue } from '../actions'
import { useSort, SortableHeader, type Sortable } from '@/lib/sortableTable'

export type TokenRow = {
  id:                  string
  rider_id:            string | null
  rider_name:          string
  quarter_id:          string
  quarter_label:       string
  original_lesson_date: string | null    // ISO date (from originating lesson) or null if admin-grant
  scheduled_lesson_id:  string | null    // present when status='scheduled' (or later 'used')
  scheduled_lesson_date: string | null   // ISO timestamp of the makeup lesson
  reason:              'rider_cancel' | 'barn_cancel' | 'admin_grant'
  grant_reason:        string | null
  official_expires_at: string            // ISO date
  status:              'available' | 'scheduled' | 'used' | 'expired'
  notes:               string | null
  created_at:          string            // ISO timestamp
}

const REASON_LABEL: Record<TokenRow['reason'], string> = {
  rider_cancel: 'Rider',
  barn_cancel:  'Barn',
  admin_grant:  'Admin',
}

const REASON_COLOR: Record<TokenRow['reason'], string> = {
  rider_cancel: 'bg-[#fff4d6] text-[#7a5a00]',
  barn_cancel:  'bg-[#ffd6d6] text-[#8a1a1a]',
  admin_grant:  'bg-[#e8d5ff] text-[#4a1a8c]',
}

const STATUS_COLOR: Record<TokenRow['status'], string> = {
  available: 'bg-[#b7f0d0] text-[#1a6b3c]',
  scheduled: 'bg-[#dae2ff] text-[#002058]',
  used:      'bg-[#e8edf4] text-[#444650]',
  expired:   'bg-[#ffd6d6] text-[#8a1a1a]',
}

function daysSince(iso: string) {
  const then = new Date(iso)
  const now  = new Date()
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

function isPastDue(row: TokenRow) {
  const today = new Date().toISOString().slice(0, 10)
  return row.status === 'available' && row.official_expires_at < today
}

type Props = {
  rows:     TokenRow[]
  quarters: { id: string; label: string }[]
}

export default function TokenTable({ rows, quarters }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError]          = useState<string | null>(null)

  // Filters
  const [status, setStatus]       = useState<'all' | TokenRow['status']>('available')
  const [quarterId, setQuarterId] = useState<string>('all')

  const STATUS_ORDER = { available: 0, scheduled: 1, used: 2, expired: 3 } as const
  const REASON_ORDER = { barn_cancel: 0, rider_cancel: 1, admin_grant: 2 } as const

  const filtered = useMemo(() => {
    return rows
      .filter(r => {
        if (status    !== 'all' && r.status !== status)        return false
        if (quarterId !== 'all' && r.quarter_id !== quarterId) return false
        return true
      })
      .map(r => ({
        ...r,
        _sort: {
          rider:   r.rider_name,
          quarter: r.quarter_label,
          origin:  r.original_lesson_date,
          reason:  REASON_ORDER[r.reason],
          issued:  r.created_at,
          expires: r.official_expires_at,
          status:  STATUS_ORDER[r.status],
          notes:   (r.notes || r.grant_reason || '').toLowerCase() || null,
        } satisfies Record<string, string | number | null>,
      })) satisfies (TokenRow & Sortable)[]
  }, [rows, status, quarterId])

  const { sorted, sort, onSort } = useSort(filtered, { key: 'expires', dir: 'asc' })

  const pastDueCount = rows.filter(isPastDue).length

  // Per-row note editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft]         = useState('')

  function handleExpire(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await expireToken(id)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  function handleRestore(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await restoreToken(id)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  function handleBatchExpire() {
    setError(null)
    const scope = quarterId === 'all' ? 'all past-due tokens' : `past-due tokens in ${quarters.find(q => q.id === quarterId)?.label}`
    if (!confirm(`Expire ${scope}? ${pastDueCount} token${pastDueCount === 1 ? '' : 's'} affected.`)) return
    startTransition(async () => {
      const r = await batchExpirePastDue(quarterId === 'all' ? undefined : quarterId)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  function handleNoteSave(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await updateTokenNote(id, noteDraft || null)
      if (r?.error) setError(r.error)
      else {
        setEditingNoteId(null)
        router.refresh()
      }
    })
  }

  const selCls = 'border border-[#c4c6d1] rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#002058]'

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-[#444650] font-semibold uppercase tracking-wide">Status</label>
          <select className={selCls} value={status} onChange={e => setStatus(e.target.value as any)}>
            <option value="all">All</option>
            <option value="available">Available</option>
            <option value="scheduled">Scheduled</option>
            <option value="used">Used</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-[#444650] font-semibold uppercase tracking-wide">Quarter</label>
          <select className={selCls} value={quarterId} onChange={e => setQuarterId(e.target.value)}>
            <option value="all">All</option>
            {quarters.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
          </select>
        </div>

        <div className="flex-1" />

        {pastDueCount > 0 && (
          <button
            onClick={handleBatchExpire}
            disabled={pending}
            className="text-xs font-semibold text-[#8a1a1a] border border-[#ffd6d6] bg-white px-2.5 py-1 rounded hover:bg-[#ffd6d6]/30 disabled:opacity-50 transition-colors"
            title="Expire all tokens past their official quarter end date"
          >
            Batch-Expire Past Due ({pastDueCount})
          </button>
        )}
      </div>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      {sorted.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#c4c6d1]/40 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-[#191c1e] mb-1">No tokens match the filters</p>
          <p className="text-xs text-[#444650]">Change the status or quarter filter to see more.</p>
        </div>
      ) : (
        <div className="bg-white rounded border border-[#c4c6d1]/40 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f7f9fc] border-b border-[#c4c6d1]/30 text-left">
                <SortableHeader sortKey="rider"   current={sort} onSort={onSort}>Rider</SortableHeader>
                <SortableHeader sortKey="quarter" current={sort} onSort={onSort}>Quarter</SortableHeader>
                <SortableHeader sortKey="origin"  current={sort} onSort={onSort}>Origin</SortableHeader>
                <SortableHeader sortKey="reason"  current={sort} onSort={onSort}>Reason</SortableHeader>
                <SortableHeader sortKey="issued"  current={sort} onSort={onSort}>Issued</SortableHeader>
                <SortableHeader sortKey="expires" current={sort} onSort={onSort}>Expires</SortableHeader>
                <SortableHeader sortKey="status"  current={sort} onSort={onSort}>Status</SortableHeader>
                <SortableHeader sortKey="notes"   current={sort} onSort={onSort}>Notes</SortableHeader>
                <th className="py-2 px-3 font-semibold text-[#444650] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => {
                const pastDue   = isPastDue(t)
                const editing   = editingNoteId === t.id
                const shownNote = t.notes || t.grant_reason
                return (
                  <tr key={t.id} className={`border-b border-[#c4c6d1]/20 align-top ${pastDue ? 'bg-[#fff4d6]/30' : ''}`}>
                    <td className="py-1.5 px-3 font-medium text-[#191c1e]">
                      {t.rider_id ? (
                        <Link
                          href={`/chia/people/${t.rider_id}`}
                          target="_blank"
                          rel="noopener"
                          className="hover:underline hover:text-[#002058]"
                          title="Open profile in new tab"
                        >
                          {t.rider_name}
                        </Link>
                      ) : t.rider_name}
                    </td>
                    <td className="py-1.5 px-3 text-[#444650]">{t.quarter_label}</td>
                    <td className="py-1.5 px-3 text-[#444650]">
                      <Link
                        href={`/chia/lessons-events/tokens/${t.id}`}
                        className="hover:underline hover:text-[#002058]"
                        title="Open token detail"
                      >
                        {t.original_lesson_date
                          ? new Date(t.original_lesson_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : <span className="text-[#c4c6d1]">details →</span>}
                      </Link>
                    </td>
                    <td className="py-1.5 px-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${REASON_COLOR[t.reason]}`}>
                        {REASON_LABEL[t.reason]}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-[#444650]">
                      {daysSince(t.created_at)}d ago
                    </td>
                    <td className={`py-1.5 px-3 ${pastDue ? 'text-[#8a1a1a] font-semibold' : 'text-[#444650]'}`}>
                      {new Date(t.official_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {pastDue && <span className="ml-1 text-[10px]">past due</span>}
                    </td>
                    <td className="py-1.5 px-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS_COLOR[t.status]}`}>
                        {t.status}
                      </span>
                      {t.scheduled_lesson_date && (t.status === 'scheduled' || t.status === 'used') && (
                        <div className="mt-0.5">
                          <Link
                            href={`/chia/lessons-events/${t.scheduled_lesson_id}`}
                            className="text-[10px] text-[#444650] hover:text-[#002058] hover:underline"
                            title="Open the scheduled makeup lesson"
                          >
                            {new Date(t.scheduled_lesson_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' · '}
                            {new Date(t.scheduled_lesson_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </Link>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-3">
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  handleNoteSave(t.id)
                              if (e.key === 'Escape') setEditingNoteId(null)
                            }}
                            className="flex-1 border border-[#c4c6d1] rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-[#002058]"
                            placeholder="Note…"
                          />
                          <button onClick={() => handleNoteSave(t.id)} className="text-[10px] text-[#002058] font-semibold hover:underline">Save</button>
                          <button onClick={() => setEditingNoteId(null)}  className="text-[10px] text-[#444650] hover:underline">×</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setNoteDraft(t.notes ?? ''); setEditingNoteId(t.id) }}
                          className="text-xs text-left text-[#444650] hover:text-[#191c1e] hover:underline"
                          disabled={t.status !== 'available'}
                        >
                          {shownNote || (t.status === 'available' ? <span className="text-[#c4c6d1]">+ note</span> : <span className="text-[#c4c6d1]">—</span>)}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right whitespace-nowrap space-x-1">
                      {t.status === 'available' && (
                        <>
                          <Link
                            href={`/chia/lessons-events/products/new?tokenId=${t.id}`}
                            className="inline-block text-[10px] font-semibold text-[#002058] border border-[#002058]/40 px-2 py-0.5 rounded hover:bg-[#dae2ff]/40 transition-colors"
                          >
                            Schedule Makeup
                          </Link>
                          <button
                            onClick={() => handleExpire(t.id)}
                            disabled={pending}
                            className="text-[10px] font-semibold text-[#8a1a1a] border border-[#ffd6d6] px-2 py-0.5 rounded hover:bg-[#ffd6d6]/30 disabled:opacity-50 transition-colors"
                          >
                            Expire
                          </button>
                        </>
                      )}
                      {t.status === 'expired' && (
                        <button
                          onClick={() => handleRestore(t.id)}
                          disabled={pending}
                          className="text-[10px] font-semibold text-[#1a6b3c] border border-[#b7f0d0] px-2 py-0.5 rounded hover:bg-[#b7f0d0]/30 disabled:opacity-50 transition-colors"
                        >
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
