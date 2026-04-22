// Cleanup script: hard-deletes all test lessons created by seed-test-lessons.mjs
// Removes lesson_riders, lessons, and the lesson_package tagged TEST_INSTRUCTOR_DEV

import { supabaseAdmin } from './_env.mjs'
const supabase = supabaseAdmin()

const TEST_TAG = 'TEST_INSTRUCTOR_DEV'

async function run() {
  // Find the test package(s)
  const { data: pkgs, error: pkgErr } = await supabase
    .from('lesson_package')
    .select('id')
    .eq('billing_skipped_reason', TEST_TAG)

  if (pkgErr) { console.error(pkgErr); process.exit(1) }
  if (!pkgs.length) { console.log('No test packages found.'); return }

  const pkgIds = pkgs.map(p => p.id)
  console.log(`Found ${pkgIds.length} test package(s):`, pkgIds)

  // Find lesson_riders attached to these packages
  const { data: riders, error: ridersErr } = await supabase
    .from('lesson_rider')
    .select('id, lesson_id')
    .in('package_id', pkgIds)

  if (ridersErr) { console.error(ridersErr); process.exit(1) }

  const lessonIds = [...new Set(riders.map(r => r.lesson_id))]
  const riderIds  = riders.map(r => r.id)

  console.log(`Found ${riderIds.length} lesson_rider rows and ${lessonIds.length} lessons`)

  // Delete lesson_riders
  if (riderIds.length) {
    const { error } = await supabase.from('lesson_rider').delete().in('id', riderIds)
    if (error) { console.error('lesson_rider delete error:', error); process.exit(1) }
    console.log('Deleted lesson_riders ✓')
  }

  // Delete lessons
  if (lessonIds.length) {
    const { error } = await supabase.from('lesson').delete().in('id', lessonIds)
    if (error) { console.error('lesson delete error:', error); process.exit(1) }
    console.log('Deleted lessons ✓')
  }

  // Delete packages
  const { error } = await supabase.from('lesson_package').delete().in('id', pkgIds)
  if (error) { console.error('lesson_package delete error:', error); process.exit(1) }
  console.log('Deleted lesson_packages ✓')

  console.log('\nAll test data removed cleanly.')
}

run()
