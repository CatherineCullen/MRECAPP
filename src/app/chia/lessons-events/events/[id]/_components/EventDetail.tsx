'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SearchPicker from '@/components/SearchPicker'
import { updateEvent, cancelEvent, deleteEvent } from '../actions'
import { skipBilling, unskipBilling } from '@/app/chia/lessons-events/unbilled/actions'

type Option = { id: string; name: string }

type Props = {
  eventId:           string
  eventTypeLabel:    string
  scheduledAt:       string             // naive 'YYYY-MM-DDTHH:MM:SS'
  durationMinutes:   number
  title:             string
  notes:             string | null
  status:            'scheduled' | 'completed' | 'cancelled'
  price:             number
  partySize:         number | null
  instructorId:      string | null
  instructorName:    string | null
  hostId:            string
  hostName:          string
  isBilled:          boolean             // true once event.invoice_id is set
  invoiceId:         string | null
  invoiceStatus:     string | null
  stripeInvoiceId:   string | null
  billingSkippedAt:  string | null
  billingSkippedReason: string | null
  instructorOptions: Option[]
}

/**
 * Event detail view + inline edit. Uses `isEditing` to toggle between a read
 * card and an editable form so the default experience is "read, then click
 * Edit to change." Saves call updateEvent server action.
 *
 * Price is locked once the event is billed — mirrors the same rule on the
 * Unbilled Products page so the invoice_line_item.unit_price snapshot never
 * diverges from event.price.
 */
export default function EventDetail(p: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Inline prompts — browser-native prompt()/confirm() are blocked in
  // iframe previews, so we do it in-page.
  const [skipMode, setSkipMode]           = useState(false)
  const [skipReason, setSkipReason]       = useState('')
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null)

  // Split scheduled_at into date + time for the inputs
  const [datePart, timePart] = splitScheduled(p.scheduledAt)

  const [date, setDate]         = useState(datePart)
  const [time, setTime]         = useState(timePart)
  const [duration, setDuration] = useState(String(p.durationMinutes))
  const [title, setTitle]       = useState(p.title)
  const [price, setPrice]       = useState(String(p.price))
  const [partySize, setPartySize] = useState(p.partySize !== null ? String(p.partySize) : '')
  const [notes, setNotes]       = useState(p.notes ?? '')
  const [instructorId, setInstructorId] = useState(p.instructorId ?? '')

  const priceLocked = p.isBilled

  function handleSave() {
    const parsedDuration = Number(duration)
    const parsedPrice    = Number(price)
    if (!title.trim()) { setError('Title is required.'); return }
    if (!date || !time) { setError('Set date and time.'); return }
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) { setError('Duration must be positive.'); return }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) { setError('Price must be > $0.'); return }
    if (partySize !== '' && (!Number.isFinite(Number(partySize)) || Number(partySize) <= 0)) {
      setError('Party size must be a positive number or blank.'); return
    }
    setError(null)

    startTransition(async () => {
      const result = await updateEvent({
        eventId:         p.eventId,
        scheduledAt:     `${date}T${time}:00`,
        durationMinutes: parsedDuration,
        instructorId:    instructorId || null,
        title:           title.trim(),
        price:           parsedPrice,
        partySize:       partySize === '' ? null : Number(partySize),
        notes:           notes.trim() || null,
      })
      if (result.error) { setError(result.error); return }
      setIsEditing(false)
      router.refresh()
    })
  }

  function handleCancel() { setConfirmAction('cancel'); setError(null) }
  function handleDelete() { setConfirmAction('delete'); setError(null) }
  function handleSkip()   { setSkipReason(''); setSkipMode(true); setError(null) }

  function confirmCancelEvent() {
    startTransition(async () => {
      const result = await cancelEvent({ eventId: p.eventId })
      if (result.error) { setError(result.error); return }
      setConfirmAction(null)
      router.refresh()
    })
  }

  function confirmDeleteEvent() {
    startTransition(async () => {
      const result = await deleteEvent({ eventId: p.eventId })
      if (result.error) { setError(result.error); setConfirmAction(null); return }
      // deleteEvent redirects server-side on success
    })
  }

  function confirmSkip() {
    const reason = skipReason.trim()
    startTransition(async () => {
      const result = await skipBilling({ source: 'event', id: p.eventId, reason: reason || undefined })
      if (result.error) { setError(result.error); return }
      setSkipMode(false)
      setSkipReason('')
      router.refresh()
    })
  }

  function handleUnskip() {
    startTransition(async () => {
      const result = await unskipBilling({ source: 'event', id: p.eventId })
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  const labelCls = 'block text-xs font-semibold text-[#191c1e] mb-1'
  const inputCls = 'w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white'

  return (
    <div>
      {!isEditing ? (
        <ReadView
          p={p}
          onEdit={() => setIsEditing(true)}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onSkip={handleSkip}
          onUnskip={handleUnskip}
          pending={pending}
          error={error}
          skipMode={skipMode}
          skipReason={skipReason}
          setSkipReason={setSkipReason}
          onSkipConfirm={confirmSkip}
          onSkipAbort={() => { setSkipMode(false); setSkipReason('') }}
          confirmAction={confirmAction}
          onConfirmYes={confirmAction === 'cancel' ? confirmCancelEvent : confirmDeleteEvent}
          onConfirmNo={() => setConfirmAction(null)}
        />
      ) : (
        <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2">
              <label className={labelCls}>{p.eventTypeLabel} · Title</label>
              <input type="text" className={inputCls} value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Host</label>
              <div className="px-2 py-1.5 text-sm bg-[#f7f9fc] border border-[#c4c6d1]/50 rounded text-[#191c1e]">
                {p.hostName}
                <span className="text-[10px] text-[#444650] ml-1">(delete + recreate to change)</span>
              </div>
            </div>

            <div>
              <label className={labelCls}>Instructor (optional)</label>
              <SearchPicker
                name="_picker_instructor"
                placeholder="Type to search instructors…"
                options={p.instructorOptions.map(i => ({ id: i.id, label: i.name }))}
                initialValue={instructorId ? { id: instructorId, label: p.instructorOptions.find(i => i.id === instructorId)?.name ?? p.instructorName ?? '' } : null}
                onSelect={opt => setInstructorId(opt?.id ?? '')}
                key={`ins-${instructorId}`}
              />
            </div>

            <div>
              <label className={labelCls}>Date</label>
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Time</label>
              <input type="time" className={inputCls} value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Duration (minutes)</label>
              <input type="number" min={1} step={5} className={inputCls} value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>
                Price ($) {priceLocked && <span className="text-[10px] text-[#7c4b00] ml-1">locked — already invoiced</span>}
              </label>
              <input
                type="number" min={0} step="0.01"
                className={inputCls}
                value={price}
                onChange={e => setPrice(e.target.value)}
                disabled={priceLocked}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Party size (optional)</label>
              <input
                type="number" min={1} step={1}
                className={inputCls}
                value={partySize}
                onChange={e => setPartySize(e.target.value)}
                placeholder="Leave blank if not applicable"
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea rows={2} className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {error && (
            <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
            >
              {pending ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => { setIsEditing(false); setError(null) }}
              disabled={pending}
              className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReadView({
  p, onEdit, onCancel, onDelete, onSkip, onUnskip, pending, error,
  skipMode, skipReason, setSkipReason, onSkipConfirm, onSkipAbort,
  confirmAction, onConfirmYes, onConfirmNo,
}: {
  p: Props
  onEdit: () => void
  onCancel: () => void
  onDelete: () => void
  onSkip: () => void
  onUnskip: () => void
  pending: boolean
  error: string | null
  skipMode: boolean
  skipReason: string
  setSkipReason: (r: string) => void
  onSkipConfirm: () => void
  onSkipAbort: () => void
  confirmAction: 'cancel' | 'delete' | null
  onConfirmYes: () => void
  onConfirmNo: () => void
}) {
  const isSkipped = Boolean(p.billingSkippedAt)
  return (
    <>
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-xs">
          <dt className="text-[#444650] font-semibold">Type</dt>
          <dd className="text-[#191c1e]">{p.eventTypeLabel}</dd>

          <dt className="text-[#444650] font-semibold">Title</dt>
          <dd className="text-[#191c1e] font-semibold">{p.title}</dd>

          <dt className="text-[#444650] font-semibold">When</dt>
          <dd className="text-[#191c1e]">{formatDateTime(p.scheduledAt)} · {p.durationMinutes}min</dd>

          <dt className="text-[#444650] font-semibold">Host</dt>
          <dd className="text-[#191c1e]">
            <Link href={`/chia/people/${p.hostId}`} target="_blank" rel="noopener" className="hover:underline hover:text-[#002058]">
              {p.hostName}
            </Link>
            <span className="text-[10px] text-[#444650] ml-1">(billed)</span>
          </dd>

          <dt className="text-[#444650] font-semibold">Instructor</dt>
          <dd className="text-[#191c1e]">{p.instructorName ?? <span className="text-[#8c8e98]">(none)</span>}</dd>

          <dt className="text-[#444650] font-semibold">Price</dt>
          <dd className="text-[#191c1e] tabular-nums">${p.price.toFixed(2)}</dd>

          {p.partySize !== null && (
            <>
              <dt className="text-[#444650] font-semibold">Party size</dt>
              <dd className="text-[#191c1e]">{p.partySize}</dd>
            </>
          )}

          {p.notes && (
            <>
              <dt className="text-[#444650] font-semibold">Notes</dt>
              <dd className="text-[#191c1e] whitespace-pre-line">{p.notes}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Billing status */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <h3 className="text-sm font-bold text-[#191c1e] mb-2">Billing</h3>
        {p.isBilled ? (
          <div className="text-xs text-[#191c1e] flex items-center gap-2 flex-wrap">
            <span className="bg-[#b7f0d0] text-[#1a6b3c] font-semibold px-2 py-0.5 rounded">
              Invoiced
            </span>
            {p.invoiceStatus && (
              <span className="text-[#444650]">Status: <span className="font-semibold capitalize">{p.invoiceStatus}</span></span>
            )}
            {p.invoiceId && (
              <Link
                href={`/chia/invoices/${p.invoiceId}`}
                className="text-[#056380] font-semibold hover:text-[#002058] hover:underline"
              >
                Details ↗
              </Link>
            )}
            {p.stripeInvoiceId && (
              <a
                href={`https://dashboard.stripe.com/invoices/${p.stripeInvoiceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#056380] font-mono hover:underline"
              >
                {p.stripeInvoiceId} ↗
              </a>
            )}
          </div>
        ) : isSkipped ? (
          <div className="text-xs text-[#191c1e]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-[#e8edf4] text-[#444650] font-semibold px-2 py-0.5 rounded">
                Billing skipped
              </span>
              <span className="text-[#444650]">
                {new Date(p.billingSkippedAt!).toLocaleDateString()}
              </span>
              <button
                type="button"
                onClick={onUnskip}
                disabled={pending}
                className="text-[10px] text-[#002058] font-semibold hover:underline ml-auto disabled:opacity-50"
              >
                Un-skip
              </button>
            </div>
            {p.billingSkippedReason && (
              <div className="text-[#444650] mt-1">
                Reason: <span className="italic">{p.billingSkippedReason}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-[#191c1e] flex items-center gap-2 flex-wrap">
            <span className="bg-[#fff4d6] text-[#7a5a00] font-semibold px-2 py-0.5 rounded">Unbilled</span>
            <Link
              href="/chia/lessons-events/unbilled"
              className="text-[#002058] font-semibold hover:underline"
            >
              Go to Unbilled Products →
            </Link>
            <button
              type="button"
              onClick={onSkip}
              disabled={pending}
              className="text-[10px] text-[#444650] font-semibold hover:underline ml-auto disabled:opacity-50"
              title="Mark as comp / cash-paid / traded — removes from Unbilled Products but keeps the record."
            >
              Skip billing
            </button>
          </div>
        )}
        {skipMode && (
          <div className="mt-2 bg-[#f7f9fc] border border-[#c4c6d1] rounded p-2 flex items-center gap-2 text-xs">
            <span className="text-[#444650] font-semibold whitespace-nowrap">Don&apos;t bill — reason:</span>
            <input
              type="text"
              autoFocus
              value={skipReason}
              onChange={e => setSkipReason(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  onSkipConfirm()
                if (e.key === 'Escape') onSkipAbort()
              }}
              placeholder="comp, cash, trade, etc. (optional)"
              className="flex-1 min-w-0 border border-[#c4c6d1] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#002058] bg-white"
            />
            <button
              onClick={onSkipConfirm}
              disabled={pending}
              className="text-xs font-semibold bg-[#002058] text-white px-2 py-1 rounded hover:bg-[#001845] disabled:opacity-50"
            >
              {pending ? '…' : 'Skip'}
            </button>
            <button
              onClick={onSkipAbort}
              disabled={pending}
              className="text-xs font-semibold text-[#444650] px-2 py-1 rounded hover:bg-[#e8edf4] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4">
        <h3 className="text-sm font-bold text-[#191c1e] mb-3">Actions</h3>
        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}
        {confirmAction && (
          <div className="mb-3 px-3 py-2 bg-[#fff3d8] border border-[#ffddb3] rounded text-xs">
            <div className="text-[#7c4b00] font-semibold mb-1">
              {confirmAction === 'cancel'
                ? 'Cancel this event?'
                : 'Delete this event permanently?'}
            </div>
            <div className="text-[#7c4b00] mb-2">
              {confirmAction === 'cancel'
                ? 'The calendar card dims + strikes through. If already invoiced, refunds are handled manually in Stripe.'
                : 'This cannot be undone. (Tip: cancel instead if you want to preserve a record.)'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onConfirmYes}
                disabled={pending}
                className={`text-xs font-semibold px-3 py-1.5 rounded text-white disabled:opacity-50 ${
                  confirmAction === 'delete' ? 'bg-[#8a1a1a] hover:bg-[#6a1414]' : 'bg-[#002058] hover:bg-[#003099]'
                }`}
              >
                {pending ? '…' : confirmAction === 'cancel' ? 'Yes, cancel event' : 'Yes, delete permanently'}
              </button>
              <button
                type="button"
                onClick={onConfirmNo}
                disabled={pending}
                className="text-xs font-semibold text-[#444650] px-3 py-1.5 rounded hover:bg-[#e8edf4] disabled:opacity-50"
              >
                Nevermind
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
          >
            Edit
          </button>
          {p.status === 'scheduled' && (
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="text-xs font-semibold border border-[#c4c6d1] bg-white text-[#8a1a1a] px-3 py-1.5 rounded hover:border-[#8a1a1a] disabled:opacity-50 transition-colors"
            >
              Cancel event
            </button>
          )}
          {!p.isBilled && (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="text-xs font-semibold text-[#8a1a1a] px-3 py-1.5 rounded hover:bg-[#ffd6d6]/40 disabled:opacity-50 transition-colors ml-auto"
              title="Permanently delete. Use 'Cancel' if you want to keep a record."
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ---------- helpers ----------

function splitScheduled(iso: string): [string, string] {
  // Expect 'YYYY-MM-DDTHH:MM:SS' naive wall-clock
  const [d, t] = iso.split('T')
  return [d ?? '', (t ?? '00:00:00').slice(0, 5)]
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
