import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notify } from '@/lib/notifications'

// Vercel invokes this route on the cron schedule and passes
// Authorization: Bearer <CRON_SECRET>. The same secret must be set in
// Vercel environment variables. In dev, skip the check so the route
// can be called manually for testing.
function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function formatLessonTime(scheduledAt: string): string {
  const d = new Date(scheduledAt)
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
    hour:    'numeric',
    minute:  '2-digit',
    timeZone: 'America/New_York',
  })
}

function lessonTypeLabel(type: string): string {
  if (type === 'private')      return 'Private lesson'
  if (type === 'semi_private') return 'Semi-private lesson'
  return 'Group lesson'
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Lessons scheduled 23–25 hours from now (2hr window tolerates hourly job drift)
  const now   = new Date()
  const from  = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
  const until = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

  const { data: lessons, error } = await db
    .from('lesson')
    .select(`
      id, scheduled_at, lesson_type, duration_minutes,
      lesson_rider (
        id, cancelled_at,
        rider:person!lesson_rider_rider_id_fkey ( id, first_name, email, phone )
      )
    `)
    .eq('status', 'scheduled')
    .is('deleted_at', null)
    .gte('scheduled_at', from)
    .lte('scheduled_at', until)

  if (error) {
    console.error('[cron/lesson-reminders] DB error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0

  for (const lesson of lessons ?? []) {
    const activeRiders = (lesson.lesson_rider ?? []).filter(r => !r.cancelled_at)
    const timeStr      = formatLessonTime(lesson.scheduled_at)
    const typeLabel    = lessonTypeLabel(lesson.lesson_type)

    for (const lr of activeRiders) {
      const rider = lr.rider as { id: string; first_name: string; email: string | null; phone: string | null } | null
      if (!rider) continue

      await notify({
        personId:    rider.id,
        type:        'lesson_reminder',
        referenceId: lesson.id,
        email:       rider.email,
        phone:       rider.phone,
        vars: {
          first_name:  rider.first_name ?? '',
          lesson_type: typeLabel,
          lesson_time: timeStr,
        },
      })
      sent++
    }
  }

  return NextResponse.json({ sent, lessons: lessons?.length ?? 0 })
}
