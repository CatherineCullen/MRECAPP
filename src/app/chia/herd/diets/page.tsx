import { createAdminClient } from '@/lib/supabase/admin'
import { barnToday } from '@/lib/datetime'
import DietTable from './_components/DietTable'

export const dynamic = 'force-dynamic'

export default async function DietsPage() {
  const supabase = createAdminClient()
  const today = barnToday()

  const [horsesRes, plansRes] = await Promise.all([
    supabase
      .from('horse')
      .select(`
        id, barn_name, status,
        diet_record!diet_record_horse_id_fkey (
          id, am_feed, am_supplements, am_hay,
          pm_feed, pm_supplements, pm_hay,
          notes, version, deleted_at
        )
      `)
      .is('deleted_at', null)
      .in('status', ['active', 'pending'])
      .order('barn_name'),

    // Active Feed Room medications across the herd. Filter:
    //   is_feedroom_medication, is_active, not deleted, not resolved,
    //   started already (or starts_on null), and not yet ended (or
    //   ends_on null/today-or-later). Date arithmetic is barn-local
    //   (today is YYYY-MM-DD in America/New_York).
    supabase
      .from('care_plan')
      .select('id, horse_id, content, am_instruction, pm_instruction, starts_on, ends_on')
      .eq('is_feedroom_medication', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .is('resolved_at', null),
  ])

  // The feed crew mixes one feeding ahead, so a med starting tomorrow
  // needs to appear on today's sheet. Filter: include past, today, and
  // exactly-tomorrow start dates; exclude further-future starts; exclude
  // past-ended TCPs.
  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })()
  const allPlans = (plansRes.data ?? []).filter(p => {
    if (p.starts_on && p.starts_on > tomorrow) return false
    if (p.ends_on   && p.ends_on   < today)    return false
    return true
  })

  const plansByHorse = new Map<string, Array<{
    id:        string
    content:   string
    am:        string | null
    pm:        string | null
    starts_on: string | null
    ends_on:   string | null
  }>>()
  for (const p of allPlans) {
    const arr = plansByHorse.get(p.horse_id) ?? []
    arr.push({
      id:        p.id,
      content:   p.content,
      am:        p.am_instruction,
      pm:        p.pm_instruction,
      starts_on: p.starts_on,
      ends_on:   p.ends_on,
    })
    plansByHorse.set(p.horse_id, arr)
  }

  const rows = (horsesRes.data ?? []).map((h: any) => {
    const diet = (h.diet_record as any[])?.find((d: any) => !d.deleted_at) ?? null
    return {
      id:        h.id,
      barn_name: h.barn_name,
      status:    h.status,
      diet,
      meds:      plansByHorse.get(h.id) ?? [],
    }
  })

  return (
    <div className="p-6">
      <DietTable rows={rows} />
    </div>
  )
}
