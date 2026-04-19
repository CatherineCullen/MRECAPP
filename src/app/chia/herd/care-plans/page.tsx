import { createAdminClient } from '@/lib/supabase/admin'
import { ActivePlanCard, type CarePlan } from '../_components/CarePlanCard'

// Herd view shows active temporary care plans across every horse, each card
// carrying the same edit + resolve powers as the per-horse view — so admin
// can triage without bouncing between pages.
export default async function HerdCarePlansPage() {
  const supabase = createAdminClient()

  // Auto-resolve any plan whose explicit ends_on has already passed — same
  // semantics as the per-horse page, but applied herd-wide. This keeps the
  // list focused on genuinely-open plans without requiring admin to tick
  // each one off by hand.
  const today = new Date().toISOString().slice(0, 10)
  await supabase
    .from('care_plan')
    .update({
      is_active:       false,
      resolved_at:     new Date().toISOString(),
      resolution_note: 'Automatically resolved — end date passed.',
    })
    .eq('is_active', true)
    .not('ends_on', 'is', null)
    .lt('ends_on', today)
    .is('deleted_at', null)

  const { data: plans, error } = await supabase
    .from('care_plan')
    .select(`
      id, content, starts_on, ends_on, source_quote, resolved_at, resolution_note,
      horse!care_plan_horse_id_fkey (id, barn_name),
      person:person!care_plan_created_by_fkey (first_name, last_name),
      resolved_by_person:person!care_plan_resolved_by_fkey (first_name, last_name)
    `)
    .eq('is_active', true)
    .is('resolved_at', null)
    .is('deleted_at', null)
    .order('starts_on', { ascending: false })

  if (error) throw error

  if (!plans || plans.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg p-10 text-center">
          <p className="text-sm text-[#444650]">No active temporary care plans across the herd.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="space-y-2">
        {plans.map((row) => {
          const horse = row.horse as unknown as { id: string; barn_name: string } | null
          if (!horse) return null

          // Reshape the row to the CarePlan type the shared card expects.
          const plan: CarePlan = {
            id:              row.id,
            content:         row.content,
            starts_on:       row.starts_on,
            ends_on:         row.ends_on,
            resolved_at:     row.resolved_at,
            resolution_note: row.resolution_note,
            source_quote:    row.source_quote,
            person:          (row.person as unknown as { first_name: string; last_name: string } | null),
            resolved_by_person: (row.resolved_by_person as unknown as { first_name: string; last_name: string } | null) ?? null,
          }

          return (
            <ActivePlanCard
              key={plan.id}
              plan={plan}
              horseId={horse.id}
              horseLabel={{ id: horse.id, barn_name: horse.barn_name }}
            />
          )
        })}
      </div>

      <div className="mt-3 text-xs text-[#444650]">
        {plans.length} active temporary care plan{plans.length !== 1 ? 's' : ''} across the herd
      </div>
    </div>
  )
}
