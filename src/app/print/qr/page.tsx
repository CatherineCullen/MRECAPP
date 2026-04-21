import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppOrigin } from '@/lib/appUrl'
import { displayName } from '@/lib/displayName'
import PrintTriggerBar from './_components/PrintTriggerBar'

type ParsedKey =
  | { kind: 's'; id: string }
  | { kind: 'p'; id: string }
  | { kind: 't'; id: string }

function parseKeys(keysParam: string | undefined): ParsedKey[] {
  if (!keysParam) return []
  return keysParam
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
    .map(k => {
      const [kind, id] = k.split(':')
      if ((kind === 's' || kind === 'p' || kind === 't') && id) return { kind, id }
      return null
    })
    .filter((x): x is ParsedKey => x !== null)
}

/**
 * Build one card definition per parsed key. Order is preserved from the
 * admin's selection so they get the layout they intended.
 */
type Card = {
  heading:  string          // large label under the QR
  subtitle: string | null   // smaller label (service name for provider codes)
  url:      string
  qrSvg:    string
}

export default async function QrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ keys?: string; title?: string }>
}) {
  const { keys, title } = await searchParams
  const parsed   = parseKeys(keys)
  const pageTitle = title?.trim() || null
  const supabase = createAdminClient()
  const origin   = await getAppOrigin()

  // Fetch the underlying rows in parallel. Only include active codes — we
  // silently drop deactivated ones (and the selection UI blocks them from
  // being picked, so this is belt-and-suspenders).
  const serviceIds  = parsed.filter(p => p.kind === 's').map(p => p.id)
  const providerIds = parsed.filter(p => p.kind === 'p').map(p => p.id)
  const trainingIds = parsed.filter(p => p.kind === 't').map(p => p.id)

  const [{ data: services }, { data: pqrs }, { data: trqs }] = await Promise.all([
    serviceIds.length
      ? supabase
          .from('board_service')
          .select('id, name, is_billable')
          .in('id', serviceIds)
          .eq('is_active', true)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as { id: string; name: string; is_billable: boolean }[] }),
    providerIds.length
      ? supabase
          .from('provider_qr_code')
          .select(`
            id, token, is_active,
            person:person!provider_qr_code_provider_person_id_fkey ( id, first_name, last_name, preferred_name ),
            service:board_service!provider_qr_code_service_id_fkey ( id, name )
          `)
          .in('id', providerIds)
          .eq('is_active', true)
      : Promise.resolve({ data: [] }),
    trainingIds.length
      ? supabase
          .from('training_ride_provider_qr')
          .select(`
            id, token, is_active,
            person:person!training_ride_provider_qr_provider_person_id_fkey
              ( id, first_name, last_name, preferred_name, is_organization, organization_name )
          `)
          .in('id', trainingIds)
          .eq('is_active', true)
      : Promise.resolve({ data: [] }),
  ])

  const serviceById = new Map((services ?? []).map(s => [s.id, s]))
  const pqrById     = new Map((pqrs     ?? []).map(q => [q.id, q]))
  const trqById     = new Map((trqs     ?? []).map(q => [q.id, q]))

  // Build cards in the order the admin selected them
  const cards: Card[] = []
  for (const p of parsed) {
    if (p.kind === 's') {
      const s = serviceById.get(p.id)
      if (!s) continue
      const url = `${origin}/s/${s.id}`
      cards.push({
        heading:  s.name,
        subtitle: s.is_billable ? 'Barn worker logging' : 'Non-billable',
        url,
        qrSvg:    await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 }),
      })
    } else if (p.kind === 'p') {
      const q = pqrById.get(p.id)
      if (!q) continue
      const url = `${origin}/p/${q.token}`
      cards.push({
        heading:  displayName(q.person),
        subtitle: q.service?.name ?? null,
        url,
        qrSvg:    await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 }),
      })
    } else {
      const q = trqById.get(p.id)
      if (!q) continue
      const url = `${origin}/tr/${q.token}`
      cards.push({
        heading:  displayName(q.person),
        subtitle: 'Training Rides',
        url,
        qrSvg:    await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 }),
      })
    }
  }

  if (cards.length === 0) {
    return (
      <div className="p-8 max-w-xl">
        <p className="text-sm text-[#444650]">No codes to print. Close this tab and pick some codes from the QR Codes page.</p>
      </div>
    )
  }

  return (
    <div className="qr-print-root min-h-screen bg-white">
      <PrintTriggerBar count={cards.length} />

      {pageTitle && (
        <h1 className="text-center text-xl font-bold text-[#191c1e] pt-6 pb-2 print:pt-0 print:pb-1">
          {pageTitle}
        </h1>
      )}

      {/* 6-up grid, letter portrait. Each card is a labelled box. CSS
          `print:` utilities hide the toolbar and clean up spacing at print. */}
      <div className="grid grid-cols-2 gap-4 p-6 print:p-0 print:gap-0">
        {cards.map((c, i) => (
          <div
            key={i}
            className="border border-[#c4c6d1] rounded-lg p-4 flex flex-col items-center
                       print:border-[#000] print:rounded-none print:p-3 print:break-inside-avoid
                       aspect-[8.5/5.5]"
          >
            <div
              className="flex-1 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-[260px] [&>svg]:max-h-[260px]"
              dangerouslySetInnerHTML={{ __html: c.qrSvg }}
            />
            <div className="mt-2 text-center w-full">
              <div className="text-base font-bold text-[#191c1e] leading-tight">{c.heading}</div>
              {c.subtitle && (
                <div className="text-xs text-[#444650] mt-0.5">{c.subtitle}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.4in; }
          .qr-print-root { background: white !important; }
        }
      `}</style>
    </div>
  )
}
