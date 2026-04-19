import { createAdminClient } from '@/lib/supabase/admin'
import ImportTools from './_components/ImportTools'

async function getPageData() {
  const supabase = createAdminClient()

  const { data: prompts, error: promptsError } = await supabase
    .from('import_prompt')
    .select('slug, label, description, body')

  if (promptsError) {
    if (promptsError.code === '42P01' || promptsError.message?.includes('does not exist') || promptsError.message?.includes('schema cache')) {
      return { prompts: null, catalog: null, horses: [], migrationPending: true }
    }
    throw promptsError
  }

  // Fetch health item type catalog for vet_record prompt injection
  const { data: catalog, error: catalogError } = await supabase
    .from('health_item_type')
    .select('id, name, is_essential, default_interval_days')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')

  if (catalogError) throw catalogError

  // Fetch active horses for the horse picker
  const { data: horses, error: horsesError } = await supabase
    .from('horse')
    .select('id, barn_name')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('barn_name')

  if (horsesError) throw horsesError

  return { prompts, catalog, horses: horses ?? [], migrationPending: false }
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ horse_id?: string }>
}) {
  const { horse_id: initialHorseId = null } = await searchParams
  const { prompts, catalog, horses, migrationPending } = await getPageData()

  if (migrationPending) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="bg-[#ffdad6] text-[#b00020] rounded-lg p-4 text-sm">
          <strong>Migration pending:</strong> The import_prompt table needs to be created in Supabase.
          Run <code className="bg-white/50 px-1 rounded">supabase/migrations/20260415000002_import_prompts.sql</code> in the Supabase SQL Editor to enable import tools.
        </div>
      </div>
    )
  }

  const catalogText = catalog
    ? catalog.map(c => `- ${c.name}${c.is_essential ? ' (essential)' : ''}${c.default_interval_days ? `, every ${c.default_interval_days} days` : ''}`).join('\n')
    : ''

  const resolvedPrompts = prompts?.map(p => ({
    ...p,
    body: p.body.replace('{{CATALOG}}', catalogText),
  })) ?? []

  const cogginsPrompt   = resolvedPrompts.find(p => p.slug === 'coggins')
  const vetRecordPrompt = resolvedPrompts.find(p => p.slug === 'vet_record')

  return (
    <div className="p-6">
      <ImportTools
        cogginsPrompt={cogginsPrompt ?? null}
        vetRecordPrompt={vetRecordPrompt ?? null}
        horses={horses}
        catalog={(catalog ?? []).map(c => ({ id: c.id, name: c.name, is_essential: c.is_essential }))}
        initialHorseId={initialHorseId}
      />
    </div>
  )
}
