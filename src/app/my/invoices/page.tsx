import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getRiderScope } from '../_lib/riderScope'

export const metadata = { title: 'Invoices — Marlboro Ridge Equestrian Center' }

const STATUS_LABEL: Record<string, string> = {
  draft:   'Draft',
  sent:    'Unpaid',
  paid:    'Paid',
  void:    'Void',
}

const STATUS_STYLE: Record<string, string> = {
  draft:   'bg-surface-highest text-on-surface-muted',
  sent:    'bg-warning-container text-warning',
  paid:    'bg-success-container text-success',
  void:    'bg-surface-highest text-on-surface-muted',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function invoiceTotal(lineItems: Array<{
  total: number | null
  unit_price: number
  quantity: number
  is_credit: boolean
  deleted_at: string | null
}>): number {
  return (lineItems ?? [])
    .filter(li => !li.deleted_at)
    .reduce((sum, li) => {
      const amt = li.total ?? li.unit_price * li.quantity
      return li.is_credit ? sum - amt : sum + amt
    }, 0)
}

function formatDollars(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function MyInvoicesPage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()
  const riderIds = await getRiderScope(user.personId)

  const { data: invoices } = await db
    .from('invoice')
    .select(`
      id, status, sent_at, paid_at, due_date, created_at, notes, stripe_invoice_id, hosted_invoice_url,
      invoice_line_item (
        id, description, unit_price, quantity, total, is_credit, deleted_at
      )
    `)
    .in('billed_to_id', riderIds)
    .is('deleted_at', null)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-3">
      <h1 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide px-1">
        Invoices
      </h1>

      {!invoices?.length ? (
        <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
          <p className="text-sm font-semibold text-on-surface">No invoices yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const items = (inv.invoice_line_item ?? []) as any[]
            const total = invoiceTotal(items)
            const date  = inv.paid_at ?? inv.sent_at ?? inv.created_at

            return (
              <div key={inv.id} className="bg-surface-lowest rounded-lg px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
                      {formatDate(date)}
                    </p>
                    <p className="text-base font-bold text-on-surface mt-0.5">
                      {formatDollars(total)}
                    </p>
                    {/* First line item description as summary */}
                    {items.filter(li => !li.deleted_at)[0] && (
                      <p className="text-sm text-on-surface-muted mt-0.5 truncate">
                        {items.filter(li => !li.deleted_at)[0].description}
                        {items.filter(li => !li.deleted_at).length > 1 &&
                          ` +${items.filter(li => !li.deleted_at).length - 1} more`}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${STATUS_STYLE[inv.status] ?? STATUS_STYLE.draft}`}>
                    {STATUS_LABEL[inv.status] ?? inv.status}
                  </span>
                </div>

                {inv.status !== 'voided' && (
                  <div className="mt-2 flex items-center gap-3">
                    {inv.hosted_invoice_url ? (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded"
                      >
                        Pay now →
                      </a>
                    ) : (
                      <p className="text-xs text-on-surface-muted">
                        Check your email for the payment link, or contact the barn to pay in person.
                      </p>
                    )}
                    {inv.due_date && (
                      <span className="text-xs text-warning">
                        Due {formatDate(inv.due_date)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
