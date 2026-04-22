// Seed script: test lessons for instructor view development
// Catherine (instructor) + Gilda (rider) + Jasper (some lessons)
// All billing skipped. Hard-delete via delete-test-lessons.mjs when done.

import { supabaseAdmin } from './_env.mjs'
const supabase = supabaseAdmin()

const CATHERINE_ID = 'faf14e5d-53b6-4b1c-9b4a-479eba3ddd39'
const GILDA_ID     = '80b9539a-3873-41b5-930a-d6c414ef4623'
const JASPER_ID    = '692f8354-7a70-4121-8fb9-cfe44754df67'
const TEST_TAG     = 'TEST_INSTRUCTOR_DEV'

// 8 lessons over the next ~3 weeks. Mix of Jasper and no horse.
const lessons = [
  { at: '2026-04-23T15:00:00',  horse: JASPER_ID },
  { at: '2026-04-25T16:00:00',  horse: null       },
  { at: '2026-04-28T15:00:00',  horse: JASPER_ID },
  { at: '2026-04-30T16:00:00',  horse: null       },
  { at: '2026-05-02T10:00:00',  horse: JASPER_ID },
  { at: '2026-05-06T15:30:00',  horse: null       },
  { at: '2026-05-09T16:00:00',  horse: JASPER_ID },
  { at: '2026-05-13T15:30:00',  horse: JASPER_ID },
]

async function run() {
  // 1. Create a lesson_package for Gilda (billing skipped)
  const { data: pkg, error: pkgErr } = await supabase
    .from('lesson_package')
    .insert({
      person_id:             GILDA_ID,
      billed_to_id:          GILDA_ID,
      product_type:          'Other',
      package_size:          lessons.length,
      package_price:         0,
      purchased_at:          '2026-04-21',
      billing_skipped_at:    new Date().toISOString(),
      billing_skipped_reason: TEST_TAG,
      notes:                 'Test data for instructor view development. Safe to hard-delete.',
      created_by:            CATHERINE_ID,
    })
    .select('id')
    .single()

  if (pkgErr) { console.error('Package error:', pkgErr); process.exit(1) }
  console.log('Created package:', pkg.id)

  // 2. Create lessons + lesson_riders
  for (const l of lessons) {
    const { data: lesson, error: lessonErr } = await supabase
      .from('lesson')
      .insert({
        instructor_id:  CATHERINE_ID,
        lesson_type:    'private',
        scheduled_at:   l.at,
        status:         'scheduled',
        created_by:     CATHERINE_ID,
      })
      .select('id')
      .single()

    if (lessonErr) { console.error('Lesson error:', lessonErr); process.exit(1) }

    const { error: riderErr } = await supabase
      .from('lesson_rider')
      .insert({
        lesson_id:  lesson.id,
        rider_id:   GILDA_ID,
        horse_id:   l.horse,
        package_id: pkg.id,
      })

    if (riderErr) { console.error('Rider error:', riderErr); process.exit(1) }

    const horseLabel = l.horse ? 'Jasper' : 'no horse'
    console.log(`  Lesson ${l.at} — ${horseLabel} ✓`)
  }

  console.log('\nDone. 8 test lessons created.')
  console.log('Run delete-test-lessons.mjs to remove all of them cleanly.')
}

run()
