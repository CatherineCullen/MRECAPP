import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import TokenDetailActions from './_components/TokenDetailActions'
import NotesEditor from './_components/NotesEditor'

// Human-readable day of week for subscription slot
const DAY_LABEL: Record<string, string> = {
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}

const REASON_LABEL = {
  rider_cancel: 'Rider cancel',
  barn_cancel:  'Barn cancel',
  admin_grant:  'Admin grant',
} as const

const REASON_COLOR = {
  rider_cancel: 'bg-[#fff4d6] text-[#7a5a00]',
  barn_cancel:  'bg-[#ffd6d6] text-[#8a1a1a]',
  admin_grant:  'bg-[#e8d5ff] text-[#4a1a8c]',
} as const

const STATUS_COLOR = {
  available: 'bg-[#b7f0d0] text-[#1a6b3c]',
  scheduled: 'bg-[#dae2ff] text-[#002058]',
  used:      'bg-[#e8edf4] text-[#444650]',
  expired:   'bg-[#ffd6d6] text-[#8a1a1a]',
} as const

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null
  // Date-only strings (yyyy-mm-dd) must not be run through Date() without TZ.
  const parts = iso.slice(0, 10).split('-').map(Number)
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(hhmm: string) {
  // '16:00' -> '4:00 PM'
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default async function TokenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: token, error } = await supabase
    .from('makeup_token')
    .select(`
      id, status, reason, grant_reason, notes,
      created_at, updated_at, status_changed_at, official_expires_at,
      original_lesson_id, scheduled_lesson_id,
      rider:person!makeup_token_rider_id_fkey
        ( id, first_name, last_name, preferred_name ),
      creator:person!makeup_token_created_by_fkey
        ( id, first_name, last_name, preferred_name ),
      quarter:quarter ( id, label, end_date ),
      subscription:lesson_subscription
        (
          id, lesson_day, lesson_time, subscription_type,
          instructor:person!lesson_subscription_instructor_id_fkey
            ( id, first_name, last_name, preferred_name )
        ),
      origin:lesson!makeup_token_original_lesson_id_fkey
        (
          id, scheduled_at, cancellation_reason, cancelled_at,
          canceller:person!lesson_cancelled_by_id_fkey
            ( id, first_name, last_name, preferred_name ),
          instructor:person!lesson_instructor_id_fkey
            ( id, first_name, last_name, preferred_name )
        ),
      scheduled_lesson:lesson!makeup_token_scheduled_lesson_id_fkey
        (
          id, scheduled_at, status,
          instructor:person!lesson_instructor_id_fkey
            ( id, first_name, last_name, preferred_name )
        )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!token) notFound()

  const today    = new Date().toISOString().slice(0, 10)
  const pastDue  = token.status === 'available' && token.official_expires_at < today

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events/tokens" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← All tokens
        </Link>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h2 className="text-lg font-bold text-[#191c1e]">Makeup Token</h2>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${STATUS_COLOR[token.status as keyof typeof STATUS_COLOR]}`}>
            {token.status}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${REASON_COLOR[token.reason as keyof typeof REASON_COLOR]}`}>
            {REASON_LABEL[token.reason as keyof typeof REASON_LABEL]}
          </span>
          {pastDue && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#ffd6d6] text-[#8a1a1a]">
              Past due
            </span>
          )}
        </div>
      </div>

      {/* Summary card: rider, quarter, expiration, issued */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
          <dt className="text-[#444650] font-semibold">Rider</dt>
          <dd className="text-[#191c1e]">
            {token.rider?.id ? (
              <Link
                href={`/chia/people/${token.rider.id}`}
                target="_blank"
                rel="noopener"
                className="hover:underline hover:text-[#002058]"
                title="Open profile in new tab"
              >
                {displayName(token.rider)}
              </Link>
            ) : displayName(token.rider)}
          </dd>

          <dt className="text-[#444650] font-semibold">Quarter</dt>
          <dd className="text-[#191c1e]">{token.quarter?.label ?? '—'}</dd>

          <dt className="text-[#444650] font-semibold">Issued</dt>
          <dd className="text-[#191c1e]">
            {fmtDateTime(token.created_at)}
            {token.creator && (
              <span className="text-[#444650]"> by {displayName(token.creator)}</span>
            )}
          </dd>

          <dt className="text-[#444650] font-semibold">Expires</dt>
          <dd className={pastDue ? 'text-[#8a1a1a] font-semibold' : 'text-[#191c1e]'}>
            {fmtDate(token.official_expires_at)}
            {pastDue && <span className="ml-1 text-[10px]">past due</span>}
          </dd>

          {token.status_changed_at && token.status !== 'available' && (
            <>
              <dt className="text-[#444650] font-semibold">Status changed</dt>
              <dd className="text-[#191c1e]">{fmtDateTime(token.status_changed_at)}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Origin story — the whole reason this token exists */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <h3 className="text-sm font-bold text-[#191c1e] mb-2">Origin</h3>

        {token.reason === 'admin_grant' ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
            <dt className="text-[#444650] font-semibold">Type</dt>
            <dd className="text-[#191c1e]">Goodwill grant (no source lesson)</dd>

            <dt className="text-[#444650] font-semibold">Granted by</dt>
            <dd className="text-[#191c1e]">{displayName(token.creator) || <span className="text-[#c4c6d1]">—</span>}</dd>

            <dt className="text-[#444650] font-semibold self-start">Reason</dt>
            <dd className="text-[#191c1e] whitespace-pre-wrap">
              {token.grant_reason || <span className="text-[#c4c6d1]">(no reason given)</span>}
            </dd>
          </dl>
        ) : token.origin ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
            <dt className="text-[#444650] font-semibold">From lesson</dt>
            <dd className="text-[#191c1e]">
              <Link
                href={`/chia/lessons-events/${token.origin.id}`}
                className="hover:underline hover:text-[#002058]"
              >
                {fmtDateTime(token.origin.scheduled_at)}
              </Link>
              {token.origin.instructor && (
                <span className="text-[#444650]"> · with {displayName(token.origin.instructor)}</span>
              )}
            </dd>

            <dt className="text-[#444650] font-semibold">Cancelled</dt>
            <dd className="text-[#191c1e]">
              {fmtDateTime(token.origin.cancelled_at) ?? <span className="text-[#c4c6d1]">—</span>}
              {token.origin.canceller && (
                <span className="text-[#444650]"> by {displayName(token.origin.canceller)}</span>
              )}
            </dd>

            <dt className="text-[#444650] font-semibold self-start">Cancel reason</dt>
            <dd className="text-[#191c1e] whitespace-pre-wrap">
              {token.origin.cancellation_reason || <span className="text-[#c4c6d1]">(no reason given)</span>}
            </dd>
          </dl>
        ) : (
          <p className="text-xs text-[#444650]">
            Original lesson record is no longer available.
          </p>
        )}
      </div>

      {/* Subscription context */}
      {token.subscription && (
        <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
          <h3 className="text-sm font-bold text-[#191c1e] mb-2">Subscription</h3>
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
            <dt className="text-[#444650] font-semibold">Slot</dt>
            <dd className="text-[#191c1e]">
              {DAY_LABEL[token.subscription.lesson_day] ?? token.subscription.lesson_day}
              {' '}@ {fmtTime(token.subscription.lesson_time)}
              {token.subscription.instructor && (
                <span className="text-[#444650]"> · {displayName(token.subscription.instructor)}</span>
              )}
              {token.subscription.subscription_type === 'boarder' && (
                <span className="ml-2 text-[10px] bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded font-semibold">
                  Boarder
                </span>
              )}
            </dd>

            <dt className="text-[#444650] font-semibold">Link</dt>
            <dd className="text-[#191c1e]">
              <Link
                href={`/chia/lessons-events/subscriptions/${token.subscription.id}/edit`}
                className="text-[#002058] hover:underline"
              >
                View subscription →
              </Link>
            </dd>
          </dl>
        </div>
      )}

      {/* Usage: where did this token land? */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <h3 className="text-sm font-bold text-[#191c1e] mb-2">Usage</h3>
        {token.scheduled_lesson ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
            <dt className="text-[#444650] font-semibold">
              {token.status === 'used' ? 'Used on' : 'Scheduled for'}
            </dt>
            <dd className="text-[#191c1e]">
              <Link
                href={`/chia/lessons-events/${token.scheduled_lesson.id}`}
                className="hover:underline hover:text-[#002058]"
              >
                {fmtDateTime(token.scheduled_lesson.scheduled_at)}
              </Link>
              {token.scheduled_lesson.instructor && (
                <span className="text-[#444650]"> · with {displayName(token.scheduled_lesson.instructor)}</span>
              )}
            </dd>
          </dl>
        ) : token.status === 'expired' ? (
          <p className="text-xs text-[#444650]">Expired unused.</p>
        ) : token.status === 'available' ? (
          <p className="text-xs text-[#444650]">Not yet scheduled.</p>
        ) : (
          <p className="text-xs text-[#444650]">—</p>
        )}
      </div>

      {/* Notes — editable */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <h3 className="text-sm font-bold text-[#191c1e] mb-2">Notes</h3>
        <NotesEditor tokenId={token.id} initial={token.notes ?? ''} canEdit={token.status === 'available'} />
      </div>

      {/* Actions */}
      <TokenDetailActions tokenId={token.id} status={token.status as 'available' | 'scheduled' | 'used' | 'expired'} />
    </div>
  )
}
