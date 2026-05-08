'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { sendPackageInvoice, exportPackageInvoice, updatePackagePrice, updateEventPrice, skipBilling, unskipBilling } from '../actions'
import { BARN_TZ } from '@/lib/datetime'

export type UnbilledItemKind = 'package' | 'event' | 'subscription'

/**
 * A row in the Unbilled Products list. Two flavors:
 *
 *  - `kind: 'package'` — a lesson_package (evaluation, extra lesson). Price
 *    edit calls updatePackagePrice.
 *  - `kind: 'event'` — an event (birthday party, clinic, therapy, other).
 *    Price edit calls updateEventPrice. Visually distinguished by a colored
 *    type badge (from event_type.calendar_badge/calendar_color).
 */
export type UnbilledItem = {
  kind:       UnbilledItemKind
  id:         string
  title:      string           // "Evaluation" / "Birthday Party"
  subtitle:   string           // rider name / event title
  price:      number
  dateLabel:  string           // "Purchased Apr 17" or "Scheduled Apr 18"
  notes:      string | null
  badgeText:  string | null    // null for packages, calendar_badge for events
  badgeColor: string | null    // null for packages, calendar_color for events
}

export type UnbilledGroup = {
  billedToId:   string
  billedToName: string
  items:        UnbilledItem[]
  total:        number
}

/**
 * A skipped (don't-bill) row. Stop-gap home: eventually these belong on the
 * person profile page alongside their invoiced + pending items. For now they
 * live at the bottom of Unbilled Products in a collapsible section, so an
 * admin can find and un-skip if they need to.
 */
export type SkippedItem = {
  kind:          UnbilledItemKind
  id:            string
  billedToId:    string
  billedToName:  string
  title:         string
  subtitle:      string
  price:         number
  dateLabel:     string
  skippedAt:     string        // ISO timestamp
  skippedReason: string | null
  badgeText:     string | null
  badgeColor:    string | null
}

/**
 * Admin view: unbilled lesson products + events, grouped by billed-to person.
 * One "Send invoice" button per group bundles ALL that person's unbilled items
 * (packages + events) into one Stripe invoice.
 */
export default function UnbilledPackagesList({
  groups:  initialGroups,
  skipped: initialSkipped,
}: {
  groups:  UnbilledGroup[]
  skipped: SkippedItem[]
}) {
  const [groups, setGroups]   = useState(initialGroups)
  const [skipped, setSkipped] = useState(initialSkipped)

  function handlePriceChange(billedToId: string, itemKind: UnbilledItemKind, itemId: string, newPrice: number) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.billedToId !== billedToId) return g
        const items = g.items.map((i) =>
          i.kind === itemKind && i.id === itemId ? { ...i, price: newPrice } : i
        )
        const total = items.reduce((sum, i) => sum + i.price, 0)
        return { ...g, items, total }
      })
    )
  }

  // After skipBilling succeeds: drop the row from its group (drop the group
  // if it was the last item — otherwise we'd render an empty "Send invoice"
  // card) and move it into the Skipped list so it's still discoverable +
  // un-skippable without a page refresh.
  function handleItemSkipped(billedToId: string, itemKind: UnbilledItemKind, itemId: string, reason: string | null) {
    const group = groups.find((g) => g.billedToId === billedToId)
    const item  = group?.items.find((i) => i.kind === itemKind && i.id === itemId)

    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.billedToId !== billedToId) return g
          const items = g.items.filter((i) => !(i.kind === itemKind && i.id === itemId))
          const total = items.reduce((sum, i) => sum + i.price, 0)
          return { ...g, items, total }
        })
        .filter((g) => g.items.length > 0)
    )

    if (group && item) {
      setSkipped((prev) => [
        {
          kind:          item.kind,
          id:            item.id,
          billedToId:    group.billedToId,
          billedToName:  group.billedToName,
          title:         item.title,
          subtitle:      item.subtitle,
          price:         item.price,
          dateLabel:     item.dateLabel,
          skippedAt:     new Date().toISOString(),
          skippedReason: reason,
          badgeText:     item.badgeText,
          badgeColor:    item.badgeColor,
        },
        ...prev,
      ])
    }
  }

  // After unskipBilling succeeds: drop from skipped list. We don't try to
  // re-insert into groups here — a full refresh/revalidate brings the row
  // back into the correct group with fresh stripe-customer state.
  function handleItemUnskipped(itemKind: UnbilledItemKind, itemId: string) {
    setSkipped((prev) => prev.filter((s) => !(s.kind === itemKind && s.id === itemId)))
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <GroupCard
          key={group.billedToId}
          group={group}
          onSent={() => setGroups((prev) => prev.filter((g) => g.billedToId !== group.billedToId))}
          onPriceChange={(kind, id, newPrice) => handlePriceChange(group.billedToId, kind, id, newPrice)}
          onItemSkipped={(kind, id, reason) => handleItemSkipped(group.billedToId, kind, id, reason)}
        />
      ))}

      {skipped.length > 0 && (
        <SkippedSection skipped={skipped} onUnskipped={handleItemUnskipped} />
      )}
    </div>
  )
}

function GroupCard({
  group,
  onSent,
  onPriceChange,
  onItemSkipped,
}: {
  group: UnbilledGroup
  onSent: () => void
  onPriceChange: (kind: UnbilledItemKind, id: string, newPrice: number) => void
  onItemSkipped: (kind: UnbilledItemKind, id: string, reason: string | null) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sentNmiId, setSentNmiId] = useState<string | null>(null)
  const [exported, setExported]   = useState<{ filename: string; chiaInvoiceId: string } | null>(null)

  // Fork modal state — mirrors SendInvoicesButton on Monthly Subscriptions.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [path, setPath]             = useState<'nmi' | 'export'>('nmi')

  function handleConfirm() {
    setError(null)
    setSentNmiId(null)
    setExported(null)
    const args = {
      billedToId: group.billedToId,
      packageIds: group.items.filter((i) => i.kind === 'package').map((i) => i.id),
      eventIds:   group.items.filter((i) => i.kind === 'event').map((i) => i.id),
    }
    startTransition(async () => {
      if (path === 'nmi') {
        const result = await sendPackageInvoice(args)
        if (result.error) { setError(result.error); return }
        setSentNmiId(result.nmiInvoiceId ?? null)
        setPickerOpen(false)
        setTimeout(onSent, 1500)
      } else {
        const result = await exportPackageInvoice(args)
        if (result.error || !result.data) { setError(result.error ?? 'Export failed'); return }
        // Trigger browser download of the CSV.
        const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = result.data.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setExported({ filename: result.data.filename, chiaInvoiceId: result.data.chiaInvoiceId })
        setPickerOpen(false)
        setTimeout(onSent, 1500)
      }
    })
  }

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <header className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between gap-3">
        <div>
          <Link
            href={`/chia/people/${group.billedToId}`}
            className="text-sm font-bold text-[#191c1e] hover:text-[#002058]"
          >
            {group.billedToName}
          </Link>
          <div className="text-xs text-[#444650] mt-0.5">
            {group.items.length} {group.items.length === 1 ? 'product' : 'products'} · $
            {group.total.toFixed(2)}
          </div>
        </div>
        <button
          onClick={() => { setError(null); setSentNmiId(null); setExported(null); setPath('nmi'); setPickerOpen(true) }}
          disabled={isPending}
          className="text-xs font-semibold bg-[#002058] text-white px-3 py-1.5 rounded hover:bg-[#001845] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title="Send via NMI or export CSV for external billing"
        >
          Send invoice
        </button>
      </header>

      <div className="divide-y divide-[#e8edf4]">
        {group.items.map((item) => (
          <ItemRow
            key={`${item.kind}-${item.id}`}
            item={item}
            onPriceChange={(newPrice) => onPriceChange(item.kind, item.id, newPrice)}
            onSkipped={(reason) => onItemSkipped(item.kind, item.id, reason)}
          />
        ))}
      </div>

      {(error || sentNmiId || exported) && (
        <div className="px-4 py-2 border-t border-[#e8edf4]">
          {error && <div className="text-xs text-[#b02020]">{error}</div>}
          {sentNmiId && (
            <div className="text-xs text-[#0a6b2a]">
              Invoice sent. NMI ID <span className="font-mono">{sentNmiId}</span>.
            </div>
          )}
          {exported && (
            <div className="text-xs text-[#0a6b2a]">
              Exported as <span className="font-mono">{exported.filename}</span>. Bill externally, then{' '}
              <Link href={`/chia/invoices/${exported.chiaInvoiceId}`} target="_blank" className="underline font-semibold">
                Mark Paid
              </Link>{' '}when payment lands.
            </div>
          )}
        </div>
      )}

      {pickerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && !isPending && setPickerOpen(false)}
        >
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl">
            <h3 className="text-base font-bold text-[#191c1e] mb-1">
              Send invoice — {group.billedToName}
            </h3>
            <p className="text-xs text-[#444650] mb-4">
              {group.items.length} {group.items.length === 1 ? 'product' : 'products'} ·{' '}
              <span className="font-semibold text-[#191c1e]">${group.total.toFixed(2)}</span> total.
            </p>

            <fieldset className="mb-4 space-y-2">
              <legend className="text-xs font-semibold text-[#191c1e] mb-1.5">How to send</legend>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="unbilled-send-path"
                  value="nmi"
                  checked={path === 'nmi'}
                  onChange={() => setPath('nmi')}
                  className="mt-0.5 accent-[#002058]"
                />
                <span>
                  <span className="font-semibold text-[#191c1e]">NMI</span>
                  <span className="block text-[11px] text-[#444650]">
                    Hosted pay-link emails to the recipient. Webhook reconciles paid status.
                    Gated by <code className="text-[#191c1e]">OUTBOUND_ENABLED</code>.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="unbilled-send-path"
                  value="export"
                  checked={path === 'export'}
                  onChange={() => setPath('export')}
                  className="mt-0.5 accent-[#002058]"
                />
                <span>
                  <span className="font-semibold text-[#191c1e]">Export CSV</span>
                  <span className="block text-[11px] text-[#444650]">
                    Downloads a CSV with one row per line item. Bill externally, then use Mark Paid
                    on the invoice once payment lands.
                  </span>
                </span>
              </label>
            </fieldset>

            {error && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                disabled={isPending}
                className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
              >
                {isPending
                  ? (path === 'nmi' ? 'Sending…' : 'Exporting…')
                  : (path === 'nmi' ? 'Send via NMI' : 'Export CSV')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Single row — handles both packages and events. Inline price editor.
 */
function ItemRow({
  item,
  onPriceChange,
  onSkipped,
}: {
  item: UnbilledItem
  onPriceChange: (newPrice: number) => void
  onSkipped: (reason: string | null) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(item.price > 0 ? item.price.toFixed(2) : '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Skip-billing inline prompt (can't use window.prompt — blocked in previews).
  const [isSkipping, setIsSkipping]   = useState(false)
  const [skipReason, setSkipReason] = useState('')

  function confirmSkip() {
    const reason = skipReason.trim()
    setError(null)
    startTransition(async () => {
      // Subscriptions don't support skip (that's "cancel subscription"
      // territory, not a billing-skip); UI hides the skip button for them,
      // so this branch only ever runs with package/event.
      if (item.kind === 'subscription') { setError('Subscriptions can\'t be skipped — cancel the subscription instead.'); return }
      const result = await skipBilling({
        source: item.kind,
        id:     item.id,
        reason: reason || undefined,
      })
      if (result.error) { setError(result.error); return }
      onSkipped(reason || null)
    })
  }

  const needsPrice = item.price <= 0

  function startEdit() {
    setDraft(item.price > 0 ? item.price.toFixed(2) : '')
    setError(null)
    setIsEditing(true)
  }

  function cancel() {
    setIsEditing(false)
    setError(null)
  }

  function save() {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a price greater than $0')
      return
    }
    setError(null)
    startTransition(async () => {
      // Subscription price edits happen on the Subscription detail page
      // (pricing logic there understands prorated vs full). No inline edit here.
      if (item.kind === 'subscription') {
        setError('Edit subscription price on the subscription detail page.')
        return
      }
      const result = item.kind === 'package'
        ? await updatePackagePrice({ packageId: item.id, newPrice: parsed })
        : await updateEventPrice({ eventId: item.id, newPrice: parsed })
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.newPrice !== undefined) onPriceChange(result.newPrice)
      setIsEditing(false)
    })
  }

  const detailHref = item.kind === 'package'
    ? null  // no standalone package detail page; edit lives here
    : item.kind === 'subscription'
      ? `/chia/lessons-events/subscriptions/${item.id}`
      : `/chia/lessons-events/events/${item.id}`

  return (
    <div className="px-4 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[#191c1e] flex items-center flex-wrap gap-1">
            {item.badgeText && (
              <span
                className="text-[9px] font-bold text-white px-1 py-0.5 rounded uppercase"
                style={{ backgroundColor: item.badgeColor ?? '#8c8e98' }}
              >
                {item.badgeText}
              </span>
            )}
            <span className="font-semibold">{item.title}</span>
            <span className="text-[#444650]"> — {item.subtitle}</span>
            {detailHref && (
              <Link
                href={detailHref}
                className="text-[10px] text-[#002058] font-semibold hover:underline ml-1"
              >
                Open ↗
              </Link>
            )}
          </div>
          <div className="text-xs text-[#8c8e98] mt-0.5">
            {item.dateLabel}
            {item.notes && ` · ${item.notes.split('\n')[0]}`}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {isEditing ? (
            <>
              <span className="text-[#444650] text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') cancel()
                }}
                className="w-24 text-sm tabular-nums bg-white border border-[#002058] rounded px-1.5 py-0.5 focus:outline-none"
              />
              <button
                onClick={save}
                disabled={isPending}
                className="text-xs font-semibold bg-[#002058] text-white px-2 py-0.5 rounded hover:bg-[#001845] disabled:opacity-50"
              >
                {isPending ? '…' : 'Save'}
              </button>
              <button
                onClick={cancel}
                disabled={isPending}
                className="text-xs font-semibold text-[#444650] px-2 py-0.5 rounded hover:bg-[#e8edf4]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className={`text-sm tabular-nums px-1.5 py-0.5 rounded border border-transparent hover:border-[#c4c6d1] ${
                  needsPrice ? 'text-[#b02020] font-semibold' : 'text-[#191c1e]'
                }`}
                title="Click to edit price"
              >
                {needsPrice ? 'Set price' : `$${item.price.toFixed(2)}`}
              </button>
              <button
                onClick={() => { setSkipReason(''); setIsSkipping(true); setError(null) }}
                disabled={isPending}
                className="text-[10px] text-[#444650] font-semibold px-1.5 py-0.5 rounded hover:bg-[#e8edf4] hover:text-[#191c1e] disabled:opacity-50"
                title="Skip billing — comp, cash-paid, or traded. Removes from this list but keeps the record."
              >
                Skip
              </button>
            </>
          )}
        </div>
      </div>
      {isSkipping && (
        <div className="mt-2 bg-[#f7f9fc] border border-[#c4c6d1] rounded p-2 flex items-center gap-2 text-xs">
          <span className="text-[#444650] font-semibold whitespace-nowrap">Don&apos;t bill — reason:</span>
          <input
            type="text"
            autoFocus
            value={skipReason}
            onChange={e => setSkipReason(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  confirmSkip()
              if (e.key === 'Escape') { setIsSkipping(false); setSkipReason('') }
            }}
            placeholder="comp, cash, trade, etc. (optional)"
            className="flex-1 min-w-0 border border-[#c4c6d1] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#002058] bg-white"
          />
          <button
            onClick={confirmSkip}
            disabled={isPending}
            className="text-xs font-semibold bg-[#002058] text-white px-2 py-1 rounded hover:bg-[#001845] disabled:opacity-50"
          >
            {isPending ? '…' : 'Skip'}
          </button>
          <button
            onClick={() => { setIsSkipping(false); setSkipReason('') }}
            disabled={isPending}
            className="text-xs font-semibold text-[#444650] px-2 py-1 rounded hover:bg-[#e8edf4] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <div className="text-xs text-[#b02020] mt-1">{error}</div>}
    </div>
  )
}

/**
 * Collapsible "Skipped" footer. Lists every row that was marked don't-bill so
 * admin can see what was set aside and un-skip if needed.
 *
 * TODO: once the person profile page exists, skipped items should live there
 * alongside each person's invoiced + pending rows. At that point, delete this
 * section and keep Unbilled Products focused on "what needs billing now."
 */
function SkippedSection({
  skipped,
  onUnskipped,
}: {
  skipped:     SkippedItem[]
  onUnskipped: (kind: UnbilledItemKind, id: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 bg-[#f2f4f7] flex items-center justify-between gap-3 hover:bg-[#e8edf4]"
      >
        <div className="text-left">
          <div className="text-sm font-bold text-[#191c1e]">
            Skipped <span className="text-[#8c8e98] font-normal">({skipped.length})</span>
          </div>
          <div className="text-xs text-[#444650] mt-0.5">
            Marked don&apos;t-bill. Still on the calendar / person record — just out of the billing queue.
          </div>
        </div>
        <span className="text-xs font-semibold text-[#002058] shrink-0">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="divide-y divide-[#e8edf4]">
          {skipped.map((s) => (
            <SkippedRow
              key={`${s.kind}-${s.id}`}
              item={s}
              onUnskipped={() => onUnskipped(s.kind, s.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SkippedRow({
  item,
  onUnskipped,
}: {
  item:        SkippedItem
  onUnskipped: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleUnskip() {
    setError(null)
    startTransition(async () => {
      if (item.kind === 'subscription') { setError('Subscriptions can\'t be skipped.'); return }
      const result = await unskipBilling({ source: item.kind, id: item.id })
      if (result.error) { setError(result.error); return }
      onUnskipped()
    })
  }

  const detailHref = item.kind === 'event'
    ? `/chia/lessons-events/events/${item.id}`
    : null

  return (
    <div className="px-4 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[#191c1e] flex items-center flex-wrap gap-1">
            {item.badgeText && (
              <span
                className="text-[9px] font-bold text-white px-1 py-0.5 rounded uppercase"
                style={{ backgroundColor: item.badgeColor ?? '#8c8e98' }}
              >
                {item.badgeText}
              </span>
            )}
            <span className="font-semibold">{item.title}</span>
            <span className="text-[#444650]"> — {item.subtitle}</span>
            <span className="text-[#8c8e98] text-xs">· {item.billedToName}</span>
            {detailHref && (
              <Link
                href={detailHref}
                className="text-[10px] text-[#002058] font-semibold hover:underline ml-1"
              >
                Open ↗
              </Link>
            )}
          </div>
          <div className="text-xs text-[#8c8e98] mt-0.5">
            {item.dateLabel} · ${item.price.toFixed(2)} · Skipped {new Date(item.skippedAt).toLocaleDateString('en-US', { timeZone: BARN_TZ })}
            {item.skippedReason && (
              <> · <span className="italic">{item.skippedReason}</span></>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <button
            onClick={handleUnskip}
            disabled={isPending}
            className="text-xs font-semibold text-[#002058] px-2 py-1 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] disabled:opacity-50"
            title="Put this back in the billing queue"
          >
            {isPending ? '…' : 'Un-skip'}
          </button>
        </div>
      </div>
      {error && <div className="text-xs text-[#b02020] mt-1">{error}</div>}
    </div>
  )
}
