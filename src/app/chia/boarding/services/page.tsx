import { createAdminClient } from '@/lib/supabase/admin'
import MonthlyBoardCard from './_components/MonthlyBoardCard'
import ServiceRow, { type ServiceRowData } from './_components/ServiceRow'
import NewServiceRow from './_components/NewServiceRow'
import TrainingRideProviderRow, { type ProviderRowData } from './_components/TrainingRideProviderRow'
import { displayName } from '@/lib/displayName'

const TRAINING_RIDE_WINDOW_DAYS = 60

export default async function ServiceCatalogPage() {
  const supabase = createAdminClient()

  const { data: services, error } = await supabase
    .from('board_service')
    .select('id, name, description, is_billable, is_recurring_monthly, unit_price, is_active')
    .is('deleted_at', null)
    .order('is_active', { ascending: false })
    .order('name')

  if (error) throw error

  const monthly   = services?.find(s => s.is_recurring_monthly) ?? null
  const billable  = (services ?? []).filter(s =>  s.is_billable && !s.is_recurring_monthly) as ServiceRowData[]
  const provider  = (services ?? []).filter(s => !s.is_billable)                             as ServiceRowData[]

  // Training ride providers live on `person`, not `board_service`, but admin
  // thinks of rates per-provider the same way they think of a service price —
  // so we surface them in this catalog with inline rate editing. Creating
  // providers still happens in People (flag `is_training_ride_provider`).
  const { data: provRaw } = await supabase
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name, default_training_ride_rate')
    .eq('is_training_ride_provider', true)
    .is('deleted_at', null)

  const providerIds = (provRaw ?? []).map(p => p.id)
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - TRAINING_RIDE_WINDOW_DAYS)
  const windowStartIso = windowStart.toISOString().slice(0, 10)

  const { data: recentRides } = providerIds.length > 0
    ? await supabase
        .from('training_ride')
        .select('rider_id')
        .in('rider_id', providerIds)
        .gte('ride_date', windowStartIso)
        .is('deleted_at', null)
    : { data: [] }

  const recentByProvider = new Map<string, number>()
  for (const r of recentRides ?? []) {
    recentByProvider.set(r.rider_id, (recentByProvider.get(r.rider_id) ?? 0) + 1)
  }

  const trainingProviders: ProviderRowData[] = (provRaw ?? [])
    .map(p => ({
      id:        p.id,
      name:      displayName(p),
      rate:      Number(p.default_training_ride_rate ?? 0),
      recent60d: recentByProvider.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.recent60d - a.recent60d || a.name.localeCompare(b.name))

  return (
    <div className="p-6 max-w-4xl">
      {monthly && (
        <MonthlyBoardCard id={monthly.id} unitPrice={monthly.unit_price} />
      )}

      {/* Billable a la carte services */}
      <section className="bg-white rounded-lg border border-[#c4c6d1]/40 mb-6 overflow-x-auto">
        <div className="px-4 py-2.5 bg-[#f2f4f7] border-b border-[#c4c6d1]/30">
          <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
            A la carte — billable
          </h2>
          <p className="text-[11px] text-[#444650] mt-0.5">
            Services logged by barn workers, reviewed by admin before invoicing.
          </p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-40">Name</th>
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase">Description</th>
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-24">Price</th>
              <th className="py-1.5 px-3" />
            </tr>
          </thead>
          <tbody>
            {billable.length === 0 && (
              <tr><td colSpan={4} className="py-4 px-3 text-xs text-[#c4c6d1] italic">No billable services yet.</td></tr>
            )}
            {billable.map(s => <ServiceRow key={s.id} service={s} />)}
            <NewServiceRow isBillable />
          </tbody>
        </table>
      </section>

      {/* Training ride providers — per-provider rates on person.default_training_ride_rate */}
      <section className="bg-white rounded-lg border border-[#c4c6d1]/40 mb-6 overflow-x-auto">
        <div className="px-4 py-2.5 bg-[#f2f4f7] border-b border-[#c4c6d1]/30">
          <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
            Training ride providers
          </h2>
          <p className="text-[11px] text-[#444650] mt-0.5">
            Per-provider rate for training rides on boarder horses. Rate changes
            apply to rides scheduled after the change — existing scheduled and
            logged rides keep their original price. Add new providers by flagging
            a person with <span className="font-semibold">is_training_ride_provider</span>.
          </p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-48">Provider</th>
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase">Activity</th>
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-32">Rate</th>
              <th className="py-1.5 px-3" />
            </tr>
          </thead>
          <tbody>
            {trainingProviders.length === 0 && (
              <tr><td colSpan={4} className="py-4 px-3 text-xs text-[#c4c6d1] italic">No training ride providers yet.</td></tr>
            )}
            {trainingProviders.map(p => (
              <TrainingRideProviderRow key={p.id} provider={p} />
            ))}
          </tbody>
        </table>
      </section>

      {/* Non-billable provider services */}
      <section className="bg-white rounded-lg border border-[#c4c6d1]/40 overflow-x-auto">
        <div className="px-4 py-2.5 bg-[#f2f4f7] border-b border-[#c4c6d1]/30">
          <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
            Non-billable providers
          </h2>
          <p className="text-[11px] text-[#444650] mt-0.5">
            External providers (farrier, massage, dental) log visits for the horse record only. The barn does not invoice these.
          </p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-40">Name</th>
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase">Description</th>
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-24">Price</th>
              <th className="py-1.5 px-3" />
            </tr>
          </thead>
          <tbody>
            {provider.length === 0 && (
              <tr><td colSpan={4} className="py-4 px-3 text-xs text-[#c4c6d1] italic">No provider service types yet.</td></tr>
            )}
            {provider.map(s => <ServiceRow key={s.id} service={s} />)}
            <NewServiceRow isBillable={false} />
          </tbody>
        </table>
      </section>
    </div>
  )
}
