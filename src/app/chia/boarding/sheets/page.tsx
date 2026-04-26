import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

export default async function SheetsListPage() {
  const supabase = createAdminClient()
  const today    = new Date().toISOString().slice(0, 10)

  // Active = not soft-deleted, date >= today. Past sheets quietly archive
  // (deep — no past-sheet UI in v1, pull from DB if a question arises).
  const { data: sheets, error } = await supabase
    .from('sign_up_sheet')
    .select(`
      id, title, date, mode, description,
      provider:provider_person_id ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
      service:service_id ( id, name ),
      slots:sign_up_sheet_slot ( id, horse_id )
    `)
    .is('deleted_at', null)
    .gte('date', today)
    .order('date', { ascending: true })

  if (error) throw error

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-[#444650]">
            Shared sign-up sheets for visiting providers (chiro days, vaccine clinics, sheath cleaning).
            Past sheets archive automatically.
          </p>
        </div>
        <Link
          href="/chia/boarding/sheets/new"
          className="px-3 py-1.5 bg-[#002058] text-white text-sm font-semibold rounded hover:bg-[#001742]"
        >
          + New Sheet
        </Link>
      </div>

      {(sheets ?? []).length === 0 ? (
        <div className="bg-white rounded-lg p-10 text-center">
          <p className="text-[#444650] text-sm">No active sign-up sheets. Create one to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f2f4f7]">
              <tr className="text-left text-[10px] font-semibold text-[#444650] uppercase tracking-wider">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2">Slots</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(sheets ?? []).map(s => {
                const total  = (s.slots as any[]).length
                const filled = (s.slots as any[]).filter(x => x.horse_id).length
                const dt = new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                return (
                  <tr key={s.id} className="border-t border-[#e7e8ed] hover:bg-[#f9fafc]">
                    <td className="px-4 py-2 text-[#191c1e]">{dt}</td>
                    <td className="px-4 py-2 text-[#191c1e] font-semibold">{s.title}</td>
                    <td className="px-4 py-2 text-[#444650]">
                      {displayName(s.provider as any)}
                      {s.service ? <span className="text-[#9095a3]"> · {(s.service as any).name}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-[#444650] capitalize">{s.mode}</td>
                    <td className="px-4 py-2 text-[#444650]">{filled} / {total}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/chia/boarding/sheets/${s.id}`} className="text-[#056380] text-sm hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
