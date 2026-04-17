import { createAdminClient } from '@/lib/supabase/admin'
import MonthlyBoardCard from './_components/MonthlyBoardCard'
import ServiceRow, { type ServiceRowData } from './_components/ServiceRow'
import NewServiceRow from './_components/NewServiceRow'

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

  return (
    <div className="p-6 max-w-4xl">
      {monthly && (
        <MonthlyBoardCard id={monthly.id} unitPrice={monthly.unit_price} />
      )}

      {/* Billable a la carte services */}
      <section className="bg-white rounded-lg border border-[#c4c6d1]/40 mb-6 overflow-hidden">
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

      {/* Non-billable provider services */}
      <section className="bg-white rounded-lg border border-[#c4c6d1]/40 overflow-hidden">
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
