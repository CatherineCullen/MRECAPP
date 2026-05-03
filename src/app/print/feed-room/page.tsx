import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { barnToday, formatBarnDate } from '@/lib/datetime'
import AutoPrint from './_components/AutoPrint'
import './print.css'

export const metadata = { title: 'Feed Room — Print' }
export const dynamic = 'force-dynamic'

type FeedroomMed = {
  id:        string
  content:   string
  am:        string | null
  pm:        string | null
  starts_on: string | null
  ends_on:   string | null
}

function fmtRange(starts: string | null, ends: string | null): string {
  function d(iso: string) {
    const [, m, day] = iso.split('-').map(Number)
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${day}`
  }
  if (starts && ends) return `${d(starts)}–${d(ends)}`
  if (ends)           return `until ${d(ends)}`
  if (starts)         return `from ${d(starts)}`
  return 'open-ended'
}

export default async function FeedRoomPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ horses?: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.isAdmin && !user?.isStaff) redirect('/sign-in')

  const supabase = createAdminClient()
  const today = barnToday()
  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })()

  const { horses: horsesParam } = await searchParams
  const selectedIds = horsesParam ? horsesParam.split(',').filter(Boolean) : null

  const horsesQuery = supabase
    .from('horse')
    .select(`
      id, barn_name, status,
      diet_record!diet_record_horse_id_fkey (
        id, am_feed, am_supplements, am_hay,
        pm_feed, pm_supplements, pm_hay,
        notes, deleted_at
      )
    `)
    .is('deleted_at', null)
    .in('status', ['active', 'pending'])
    .order('barn_name')

  const [horsesRes, plansRes] = await Promise.all([
    selectedIds && selectedIds.length > 0
      ? horsesQuery.in('id', selectedIds)
      : horsesQuery,
    supabase
      .from('care_plan')
      .select('id, horse_id, content, am_instruction, pm_instruction, starts_on, ends_on')
      .eq('is_feedroom_medication', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .is('resolved_at', null),
  ])

  const allPlans = (plansRes.data ?? []).filter(p => {
    if (p.starts_on && p.starts_on > tomorrow) return false
    if (p.ends_on   && p.ends_on   < today)    return false
    return true
  })

  const plansByHorse = new Map<string, FeedroomMed[]>()
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
      diet,
      meds:      plansByHorse.get(h.id) ?? [],
    }
  })

  const dateLabel = formatBarnDate(new Date())

  function MedBlock({ side, meds }: { side: 'am' | 'pm'; meds: FeedroomMed[] }) {
    const present = meds.filter(m => (side === 'am' ? m.am : m.pm))
    if (present.length === 0) return <>—</>
    return (
      <>
        {present.map((m, i) => (
          <div key={m.id} className={i > 0 ? 'mt-1' : ''}>
            <div>{side === 'am' ? m.am : m.pm}</div>
            <div className="muted small">({fmtRange(m.starts_on, m.ends_on)})</div>
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="print-root">
      <AutoPrint />

      <header className="print-header">
        <div className="title">Marlboro Ridge Equestrian Center — Feed Room</div>
        <div className="meta">
          {dateLabel}{selectedIds && selectedIds.length > 0 && rows.length > 0 ? ` · ${rows.length} of selected horses` : ''}
        </div>
      </header>

      <table className="feed-table">
        <thead>
          <tr>
            <th rowSpan={2}>Horse</th>
            <th colSpan={4} className="am-group">AM</th>
            <th colSpan={4} className="pm-group">PM</th>
            <th rowSpan={2}>Notes</th>
          </tr>
          <tr>
            <th>Feed</th>
            <th>Supps</th>
            <th>Hay</th>
            <th className="meds">Meds</th>
            <th className="pm-edge">Feed</th>
            <th>Supps</th>
            <th>Hay</th>
            <th className="meds">Meds</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10} className="empty">No horses to print.</td></tr>
          ) : (
            rows.map(r => {
              const d = r.diet
              return (
                <tr key={r.id}>
                  <td className="horse">{r.barn_name}</td>
                  <td>{d?.am_feed        ?? ''}</td>
                  <td>{d?.am_supplements ?? ''}</td>
                  <td>{d?.am_hay         ?? ''}</td>
                  <td className="meds"><MedBlock side="am" meds={r.meds} /></td>
                  <td className="pm-edge">{d?.pm_feed        ?? ''}</td>
                  <td>{d?.pm_supplements ?? ''}</td>
                  <td>{d?.pm_hay         ?? ''}</td>
                  <td className="meds"><MedBlock side="pm" meds={r.meds} /></td>
                  <td>{d?.notes          ?? ''}</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
