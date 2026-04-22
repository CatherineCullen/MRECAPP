import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminAvailabilityEditor, { type AvailabilityWindow } from './_components/AdminAvailabilityEditor'

// Admin editor for instructor availability windows. Picks an instructor
// from the left column; renders the same 7-day editor the instructors use on
// their own /my/teaching page — admin just gets to drive it on anyone's
// behalf. All edits surface in the instructor's own view too.

export default async function InstructorAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ instructor?: string }>
}) {
  const sp = await searchParams
  const db = createAdminClient()

  // All active instructors.
  const { data: roleRows } = await db
    .from('person_role')
    .select('person:person!person_id(id, first_name, last_name, preferred_name, deleted_at)')
    .eq('role', 'instructor')
    .is('deleted_at', null)

  const instructors = (roleRows ?? [])
    .map(r => (Array.isArray(r.person) ? r.person[0] : r.person) as {
      id: string
      first_name: string
      last_name: string
      preferred_name: string | null
      deleted_at: string | null
    } | null)
    .filter((p): p is NonNullable<typeof p> => !!p && !p.deleted_at)
    .sort((a, b) =>
      (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name),
    )

  const selectedId = sp.instructor ?? instructors[0]?.id ?? null
  const selected = instructors.find(p => p.id === selectedId) ?? null

  // Load windows for the selected instructor.
  let windows: AvailabilityWindow[] = []
  if (selected) {
    const { data } = await db
      .from('instructor_availability')
      .select('id, day_of_week, start_time, end_time')
      .eq('person_id', selected.id)
      .is('deleted_at', null)
      .order('day_of_week')
      .order('start_time')
    windows = (data ?? []).map(r => ({
      id:        r.id as string,
      day:       r.day_of_week as AvailabilityWindow['day'],
      startTime: (r.start_time as string).slice(0, 5),
      endTime:   (r.end_time as string).slice(0, 5),
    }))
  }

  const displayName = (p: typeof instructors[number]) =>
    `${p.first_name} ${p.last_name}`

  return (
    <div className="p-6 max-w-5xl">
      <div className="grid grid-cols-[220px_1fr] gap-6">
        {/* Instructor list */}
        <aside>
          <h2 className="text-xs font-bold text-[#444650] uppercase tracking-wide mb-2">
            Instructors
          </h2>
          {instructors.length === 0 ? (
            <p className="text-xs text-[#444650] italic">No instructors on record.</p>
          ) : (
            <ul className="space-y-0.5">
              {instructors.map(p => {
                const active = p.id === selectedId
                return (
                  <li key={p.id}>
                    <Link
                      href={`/chia/lessons-events/configuration/availability?instructor=${p.id}`}
                      className={`
                        block px-3 py-1.5 rounded text-sm transition-colors
                        ${active
                          ? 'bg-[#002058] text-white font-semibold'
                          : 'text-[#191c1e] hover:bg-[#f0f2f7]'
                        }
                      `}
                    >
                      {displayName(p)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* Editor */}
        <div>
          {selected ? (
            <>
              <h1 className="text-lg font-bold text-[#191c1e] mb-3">
                {displayName(selected)}
              </h1>
              <AdminAvailabilityEditor
                instructorPersonId={selected.id}
                windows={windows}
              />
            </>
          ) : (
            <p className="text-sm text-[#444650]">
              Pick an instructor from the list to edit their availability.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
