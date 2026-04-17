import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import LessonActions from './_components/LessonActions'
import RiderHorseAssignment, { type HorseOption } from './_components/RiderHorseAssignment'
import InstructorBadge from '../_components/InstructorBadge'
import MergeSection, { type MergeCandidate } from './_components/MergeSection'
import RiderCancelButton from './_components/RiderCancelButton'
import { effectiveStatus, type RawStatus } from '../_lib/effectiveLessonStatus'
import { displayName } from '@/lib/displayName'

// Terminal raw statuses — horse assignment is locked once the lesson is done.
// Instructors/admin can still revert the lesson via LessonActions if needed.
const TERMINAL_STATUSES = new Set(['completed', 'cancelled_rider', 'cancelled_barn', 'no_show'])

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending:         { label: 'Pending',         cls: 'bg-[#fff4d6] text-[#7a5a00]' },
  scheduled:       { label: 'Scheduled',       cls: 'bg-[#dae2ff] text-[#002058]' },
  completed:       { label: 'Completed',       cls: 'bg-[#b7f0d0] text-[#1a6b3c]' },
  cancelled_rider: { label: 'Cancelled (Rider)', cls: 'bg-[#ffd6d6] text-[#8a1a1a]' },
  cancelled_barn:  { label: 'Cancelled (Barn)',  cls: 'bg-[#ffd6d6] text-[#8a1a1a]' },
  no_show:         { label: 'No-Show',         cls: 'bg-[#fff4d6] text-[#7a5a00]' },
}

export default async function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  // Parallel fetch: the lesson itself + the full horse list for the picker.
  // Horse list is small (barn scale) — fetch the lot, group client-side.
  const [{ data: lesson, error }, { data: allHorses }] = await Promise.all([
  supabase
    .from('lesson')
    .select(`
      id, scheduled_at, lesson_type, duration_minutes, status, notes,
      cancellation_reason, cancelled_at, completed_at, is_makeup,
      instructor:person!lesson_instructor_id_fkey ( id, first_name, last_name, preferred_name, calendar_color ),
      lesson_rider (
        id, cancelled_at,
        rider:person!lesson_rider_rider_id_fkey ( id, first_name, last_name, preferred_name ),
        horse:horse                               ( id, barn_name ),
        subscription:lesson_subscription ( id, subscription_type, quarter_id, status )
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle(),
    supabase
      .from('horse')
      .select('id, barn_name, lesson_horse')
      .is('deleted_at', null)
      .order('barn_name'),
  ])

  if (error) throw error
  if (!lesson) notFound()

  // ─────────────────────────────────────────────────────────────
  // Self-heal: lesson_type must match active rider count.
  // Earlier merge bug left some lessons stuck at lesson_type='private'
  // with 2+ riders. We silently repair any such drift on page load —
  // duration_minutes is a DB-generated column, so flipping lesson_type
  // also corrects the duration automatically.
  // ─────────────────────────────────────────────────────────────
  {
    const activeCount = (lesson.lesson_rider ?? []).filter(r => !r.cancelled_at).length
    const expectedType =
      activeCount <= 1 ? 'private' :
      activeCount === 2 ? 'semi_private' :
                          'group'
    if (activeCount > 0 && lesson.lesson_type !== expectedType) {
      await supabase
        .from('lesson')
        .update({ lesson_type: expectedType, updated_at: new Date().toISOString() })
        .eq('id', id)
      // Mutate in-memory copy so the page renders the corrected values
      // without a second round-trip.
      lesson.lesson_type      = expectedType
      lesson.duration_minutes =
        expectedType === 'private' ? 30 :
        expectedType === 'semi_private' ? 45 : 60
    }
  }

  const horseOptions: HorseOption[] = (allHorses ?? []).map(h => ({
    id:          h.id,
    name:        h.barn_name,
    lessonHorse: !!h.lesson_horse,
  }))

  const activeRiders = (lesson.lesson_rider ?? []).filter(r => !r.cancelled_at)
  const hasBoarder   = activeRiders.some(r => r.subscription?.subscription_type === 'boarder')
  const unpaid       = activeRiders.some(r => (r.subscription as { status?: string } | null)?.status === 'pending')

  // Rider-cancel allowance usage: count existing makeup_token rows with
  // reason='rider_cancel' for each (rider, quarter) pair of the active riders.
  // Boarders are exempt from the allowance (unlimited makeups per policy), so
  // we only bother counting for standard subs. The UI uses count >= 2 as the
  // "would be 3rd+" soft-warning threshold (ADR-0003: visibility not compliance).
  const allowanceKey = (riderId: string, quarterId: string) => `${riderId}:${quarterId}`
  const riderCancelCount = new Map<string, number>()

  {
    const pairs = activeRiders
      .filter(r => r.subscription?.subscription_type === 'standard' && r.subscription?.quarter_id && r.rider?.id)
      .map(r => ({ riderId: r.rider!.id, quarterId: r.subscription!.quarter_id as string }))

    if (pairs.length > 0) {
      const riderIds   = Array.from(new Set(pairs.map(p => p.riderId)))
      const quarterIds = Array.from(new Set(pairs.map(p => p.quarterId)))
      const { data: priorTokens } = await supabase
        .from('makeup_token')
        .select('rider_id, quarter_id')
        .eq('reason', 'rider_cancel')
        .in('rider_id', riderIds)
        .in('quarter_id', quarterIds)

      for (const t of priorTokens ?? []) {
        const k = allowanceKey(t.rider_id as string, t.quarter_id as string)
        riderCancelCount.set(k, (riderCancelCount.get(k) ?? 0) + 1)
      }
    }
  }

  // For single-rider lessons LessonActions surfaces the warning, using the one
  // active rider's count. For multi-rider, each RiderCancelButton uses its own.
  const singleRider = activeRiders.length === 1 ? activeRiders[0] : null
  const singleRiderAllowanceUsed =
    singleRider?.subscription?.subscription_type === 'standard' && singleRider.subscription?.quarter_id && singleRider.rider?.id
      ? (riderCancelCount.get(allowanceKey(singleRider.rider.id, singleRider.subscription.quarter_id as string)) ?? 0)
      : 0

  // Display the EFFECTIVE status: past + scheduled is shown as completed,
  // matching the calendar. The raw status is passed to LessonActions so it
  // can distinguish "actually terminal" from "past but still scheduled".
  const rawForDisplay: RawStatus = (lesson.status === 'scheduled' && unpaid)
    ? 'pending'
    : (lesson.status as RawStatus)
  const effStatus  = effectiveStatus({
    status:      rawForDisplay,
    scheduledAt: lesson.scheduled_at,
  })
  const statusMeta = STATUS_STYLE[effStatus] ?? STATUS_STYLE.scheduled

  // Fetch any makeup tokens that originated from this lesson (cancellation audit trail)
  const { data: generatedTokens } = await supabase
    .from('makeup_token')
    .select(`
      id, status, created_at,
      rider:person!makeup_token_rider_id_fkey ( first_name, last_name, preferred_name )
    `)
    .eq('original_lesson_id', id)

  // Merge candidates: other scheduled lessons at the EXACT same slot + instructor
  // (excluding the current lesson). Only shown when this lesson itself is still
  // scheduled — merging a completed/cancelled lesson doesn't make sense.
  let mergeCandidates: MergeCandidate[] = []
  if (lesson.status === 'scheduled' && lesson.instructor?.id) {
    const { data: others } = await supabase
      .from('lesson')
      .select(`
        id, lesson_type,
        lesson_rider (
          id, cancelled_at,
          rider:person!lesson_rider_rider_id_fkey ( first_name, last_name, preferred_name )
        )
      `)
      .eq('scheduled_at', lesson.scheduled_at)
      .eq('instructor_id', lesson.instructor.id)
      .eq('status', 'scheduled')
      .is('deleted_at', null)
      .neq('id', lesson.id)

    mergeCandidates = (others ?? []).map(o => {
      const activeRiders = (o.lesson_rider ?? []).filter(r => !r.cancelled_at)
      return {
        id:         o.id,
        lessonType: o.lesson_type as MergeCandidate['lessonType'],
        riderCount: activeRiders.length,
        riderNames: activeRiders.map(r => displayName(r.rider)).join(', '),
      }
    })
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Calendar
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h2 className="text-lg font-bold text-[#191c1e]">Lesson</h2>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusMeta.cls}`}>
            {statusMeta.label}
          </span>
          {lesson.is_makeup && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#e8d5ff] text-[#4a1a8c]">
              Makeup
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-xs">
          <dt className="text-[#444650] font-semibold">When</dt>
          <dd className="text-[#191c1e]">{formatDateTime(lesson.scheduled_at)} · {lesson.duration_minutes}min</dd>

          <dt className="text-[#444650] font-semibold">Type</dt>
          <dd className="text-[#191c1e] capitalize">{lesson.lesson_type.replace('_', ' ')}</dd>

          <dt className="text-[#444650] font-semibold">Instructor</dt>
          <dd className="text-[#191c1e] flex items-center gap-1.5">
            <InstructorBadge instructor={lesson.instructor} />
            {lesson.instructor?.id ? (
              <Link
                href={`/chia/people/${lesson.instructor.id}`}
                target="_blank"
                rel="noopener"
                className="hover:underline hover:text-[#002058]"
                title="Open profile in new tab"
              >
                {displayName(lesson.instructor)}
              </Link>
            ) : displayName(lesson.instructor)}
          </dd>

          <dt className="text-[#444650] font-semibold">
            {activeRiders.length === 1 ? 'Rider' : 'Riders'}
          </dt>
          <dd className="text-[#191c1e]">
            {activeRiders.length === 0 ? (
              <span className="text-[#c4c6d1]">(none)</span>
            ) : (
              <ul className="space-y-0.5">
                {activeRiders.map(r => (
                  <li key={r.id} className="flex items-center flex-wrap gap-x-1 gap-y-1">
                    {r.rider?.id ? (
                      <Link
                        href={`/chia/people/${r.rider.id}`}
                        target="_blank"
                        rel="noopener"
                        className="hover:underline hover:text-[#002058]"
                        title="Open profile in new tab"
                      >
                        {displayName(r.rider)}
                      </Link>
                    ) : (
                      <span>{displayName(r.rider)}</span>
                    )}
                    <RiderHorseAssignment
                      lessonId={lesson.id}
                      lessonRiderId={r.id}
                      currentHorseId={r.horse?.id ?? null}
                      currentName={r.horse?.barn_name ?? null}
                      horses={horseOptions}
                      readOnly={TERMINAL_STATUSES.has(lesson.status)}
                    />
                    {r.subscription?.subscription_type === 'boarder' && (
                      <span className="text-[10px] bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded font-semibold">
                        Boarder
                      </span>
                    )}
                    {lesson.status === 'scheduled' && activeRiders.length > 1 && (
                      <RiderCancelButton
                        lessonId={lesson.id}
                        lessonRiderId={r.id}
                        scheduledAt={lesson.scheduled_at}
                        hasBoarder={r.subscription?.subscription_type === 'boarder'}
                        hasSubscription={!!r.subscription?.id}
                        riderCancelAllowanceUsed={
                          r.subscription?.subscription_type === 'standard' && r.subscription?.quarter_id && r.rider?.id
                            ? (riderCancelCount.get(allowanceKey(r.rider.id, r.subscription.quarter_id as string)) ?? 0)
                            : 0
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </dd>

          {lesson.notes && (
            <>
              <dt className="text-[#444650] font-semibold">Notes</dt>
              <dd className="text-[#191c1e]">{lesson.notes}</dd>
            </>
          )}

          {lesson.cancellation_reason && (
            <>
              <dt className="text-[#444650] font-semibold">Cancel reason</dt>
              <dd className="text-[#191c1e]">{lesson.cancellation_reason}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Generated tokens from this cancellation */}
      {generatedTokens && generatedTokens.length > 0 && (
        <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
          <h3 className="text-sm font-bold text-[#191c1e] mb-2">Makeup Tokens Generated</h3>
          <ul className="space-y-1 text-xs">
            {generatedTokens.map(t => (
              <li key={t.id} className="flex items-center justify-between">
                <span className="text-[#191c1e]">{displayName(t.rider)}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${
                  t.status === 'available' ? 'bg-[#b7f0d0] text-[#1a6b3c]' :
                  t.status === 'scheduled' ? 'bg-[#dae2ff] text-[#002058]' :
                  t.status === 'used'      ? 'bg-[#e8edf4] text-[#444650]' :
                                             'bg-[#ffd6d6] text-[#8a1a1a]'
                }`}>
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Merge with another lesson at the same slot + instructor */}
      <MergeSection targetLessonId={lesson.id} candidates={mergeCandidates} />

      {/* Actions */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4">
        <h3 className="text-sm font-bold text-[#191c1e] mb-3">Actions</h3>
        <LessonActions
          lessonId={lesson.id}
          status={lesson.status}
          scheduledAt={lesson.scheduled_at}
          hasBoarder={hasBoarder}
          isMultiRider={activeRiders.length > 1}
          riderCancelAllowanceUsed={singleRiderAllowanceUsed}
        />
      </div>
    </div>
  )
}
