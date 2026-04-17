import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export default async function HerdCarePlansPage() {
  const supabase = createAdminClient()

  const { data: plans, error } = await supabase
    .from('care_plan')
    .select(`
      id, content, starts_on, ends_on, source_quote,
      horse!care_plan_horse_id_fkey (id, barn_name),
      person!care_plan_created_by_fkey (first_name, last_name)
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
        {plans.map((plan) => {
          const horse     = plan.horse as any
          const addedBy   = plan.person as any
          const startsOn  = plan.starts_on  ? new Date((plan.starts_on as string)  + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
          const endsOn    = plan.ends_on    ? new Date((plan.ends_on   as string)   + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

          return (
            <div key={plan.id} className="bg-white rounded-lg p-4 border-l-4 border-[#ffddb3]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {horse && (
                    <Link
                      href={`/chia/herd/horses/${horse.id}`}
                      className="text-xs font-bold text-[#056380] hover:text-[#002058] uppercase tracking-wider"
                    >
                      {horse.barn_name}
                    </Link>
                  )}
                  <div className="mt-1 text-sm text-[#191c1e] whitespace-pre-wrap">{plan.content}</div>
                  {plan.source_quote && (
                    <div className="mt-1 text-xs text-[#444650] italic">"{plan.source_quote}"</div>
                  )}
                  <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-[#444650]">
                    {startsOn && <span>Started {startsOn}</span>}
                    {endsOn   && <span className="text-[#7c4b00]">Ends {endsOn}</span>}
                    {addedBy  && <span>Added by {addedBy.first_name} {addedBy.last_name}</span>}
                  </div>
                </div>
                <Link
                  href={`/chia/herd/horses/${horse?.id}`}
                  className="shrink-0 text-xs font-semibold text-[#056380] hover:text-[#002058]"
                >
                  View horse →
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 text-xs text-[#444650]">
        {plans.length} active temporary care plan{plans.length !== 1 ? 's' : ''} across the herd
      </div>
    </div>
  )
}
