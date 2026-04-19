import Link from 'next/link'

type ExtensionCard = {
  slug:        string
  title:       string
  description: string
  kind:        'in-app' | 'spec-download'
  href?:       string               // in-app extensions render a page here
  storagePath?:string               // spec downloads; not used until specs ship
  note:        string               // plain-English "how to use this"
}

/**
 * Extensions Library — a shelf of things the app doesn't do natively but that
 * an admin might reach for. Two kinds live here:
 *   1. "in-app" entries — first-class pages we own. "Direct data access" is
 *      the only one at launch; it's the escape hatch for AI Query and the
 *      standing answer to "I own this data — how do I get at it?"
 *   2. "spec-download" entries — PDFs/markdown stored in Supabase Storage,
 *      each with a "bring this to Claude" workflow. Written at end of Phase 1
 *      by the developer. Empty at launch.
 */

const ENTRIES: ExtensionCard[] = [
  {
    slug:        'direct-data-access',
    title:       'Direct data access',
    description: "When the AI Query tool can't answer your question, this is the path. The barn owns the database and the credentials — this guide shows how to bring them to Claude for a one-off query.",
    kind:        'in-app',
    href:        '/chia/data/extensions/direct-data-access',
    note:        "Start here if AI Query returned a validator error, or told you the question was outside its scope. You don't need to become a developer — just follow the guide.",
  },
]

export default function ExtensionsLibraryPage() {
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-[#191c1e]">Extensions Library</h2>
        <p className="text-xs text-[#444650] mt-1 max-w-2xl">
          A shelf of ready-made specs and guides for things the app doesn’t do natively. Bring
          any of these to Claude (along with the barn’s Supabase credentials) to get it built
          or answered — you don’t need a developer on retainer.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ENTRIES.map(e => (
          <ExtensionCardView key={e.slug} card={e} />
        ))}
      </div>

      <div className="mt-6 text-xs text-[#444650] italic">
        More specs land here at the end of the build — biweekly ride summary emails, custom
        CSV exports, and others. Empty sections are intentional, not a bug.
      </div>
    </div>
  )
}

function ExtensionCardView({ card }: { card: ExtensionCard }) {
  const body = (
    <div className="bg-white border border-[#c4c6d1]/50 rounded-lg p-4 h-full hover:border-[#056380] transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-bold text-[#191c1e]">{card.title}</div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#056380]">
          {card.kind === 'in-app' ? 'Guide' : 'Spec'}
        </span>
      </div>
      <p className="text-xs text-[#444650] leading-relaxed">{card.description}</p>
      <div className="mt-3 pt-3 border-t border-[#f2f4f7] text-[11px] text-[#444650] italic">
        {card.note}
      </div>
    </div>
  )

  if (card.kind === 'in-app' && card.href) {
    return <Link href={card.href} className="block">{body}</Link>
  }
  return body
}
