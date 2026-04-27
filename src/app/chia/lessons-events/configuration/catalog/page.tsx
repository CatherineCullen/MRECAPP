import { createAdminClient } from '@/lib/supabase/admin'
import PriceCell from './_components/PriceCell'
import AddEventTypeForm from './_components/AddEventTypeForm'
import { updatePricingConfig, updateEventTypePrice, toggleEventTypeActive } from './actions'

export default async function CatalogPage() {
  const supabase = createAdminClient()

  const [{ data: configs }, { data: eventTypes }] = await Promise.all([
    supabase
      .from('pricing_config')
      .select('key, section, label, sort_order, default_price')
      .order('section')
      .order('sort_order'),
    supabase
      .from('event_type')
      .select('code, label, default_duration_minutes, default_price, is_active, sort_order')
      .order('sort_order'),
  ])

  const subscriptions = (configs ?? []).filter(c => c.section === 'subscription')
  const packages      = (configs ?? []).filter(c => c.section === 'lesson_package')

  return (
    <div className="p-6 max-w-2xl space-y-8">

      {/* Subscriptions */}
      <section>
        <h2 className="text-sm font-bold text-[#191c1e] uppercase tracking-wide mb-0.5">Subscription Defaults</h2>
        <p className="text-xs text-[#444650] mb-3">
          Quarterly price pre-filled when creating a new subscription. Private, semi-private, and group are the same price — only duration differs.
        </p>
        <div className="border border-[#c4c6d1]/40 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f2f7] border-b border-[#c4c6d1]/40">
                <th className="px-4 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Type</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Default Price / Quarter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6d1]/30">
              {subscriptions.map(row => (
                <tr key={row.key} className="bg-white hover:bg-[#f7f9fc]">
                  <td className="px-4 py-2.5 text-[#191c1e]">{row.label}</td>
                  <td className="px-4 py-2.5">
                    <PriceCell
                      value={row.default_price != null ? Number(row.default_price) : null}
                      onSave={updatePricingConfig.bind(null, row.key)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* One-off Lesson Packages */}
      <section>
        <h2 className="text-sm font-bold text-[#191c1e] uppercase tracking-wide mb-0.5">One-off Lesson Defaults</h2>
        <p className="text-xs text-[#444650] mb-3">
          Default price pre-filled when creating an evaluation or extra lesson.
        </p>
        <div className="border border-[#c4c6d1]/40 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f2f7] border-b border-[#c4c6d1]/40">
                <th className="px-4 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Product</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Default Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6d1]/30">
              {packages.map(row => (
                <tr key={row.key} className="bg-white hover:bg-[#f7f9fc]">
                  <td className="px-4 py-2.5 text-[#191c1e]">{row.label}</td>
                  <td className="px-4 py-2.5">
                    <PriceCell
                      value={row.default_price != null ? Number(row.default_price) : null}
                      onSave={updatePricingConfig.bind(null, row.key)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Event Types */}
      <section>
        <h2 className="text-sm font-bold text-[#191c1e] uppercase tracking-wide mb-0.5">Event Types</h2>
        <p className="text-xs text-[#444650] mb-3">
          Default price and duration pre-filled when scheduling an event. Both are overridable per event.
        </p>
        <div className="border border-[#c4c6d1]/40 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f2f7] border-b border-[#c4c6d1]/40">
                <th className="px-4 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Event Type</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide w-16">Duration</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Default Price</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6d1]/30">
              {(eventTypes ?? []).map(et => (
                <tr key={et.code} className="bg-white hover:bg-[#f7f9fc]">
                  <td className="px-4 py-2.5 text-[#191c1e]">{et.label}</td>
                  <td className="px-4 py-2.5 text-[#444650] tabular-nums">{et.default_duration_minutes} min</td>
                  <td className="px-4 py-2.5">
                    <PriceCell
                      value={et.default_price != null ? Number(et.default_price) : null}
                      onSave={updateEventTypePrice.bind(null, et.code)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={toggleEventTypeActive.bind(null, et.code, !et.is_active)}>
                      <button
                        type="submit"
                        className={`text-xs font-medium ${et.is_active ? 'text-[#444650] hover:text-[#8a1a1a]' : 'text-[#8c8e98] hover:text-[#002058]'}`}
                      >
                        {et.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddEventTypeForm />
      </section>

    </div>
  )
}
