import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadCurrentTemplate, loadTemplateVersions } from '../../_lib/loadTemplate'
import TemplateEditor from './_components/TemplateEditor'

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ kind: string }>
}) {
  const { kind } = await params
  if (kind !== 'waiver' && kind !== 'boarding-agreement') notFound()

  const dbKind = kind === 'waiver' ? 'waiver' : 'boarding_agreement'
  const [current, versions] = await Promise.all([
    loadCurrentTemplate(dbKind),
    loadTemplateVersions(dbKind),
  ])

  const title = dbKind === 'waiver' ? 'Waiver' : 'Boarding Agreement'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/documents" className="text-[#056380] hover:text-[#002058]">Documents</Link>
        <span className="text-[#c4c6d1]">/</span>
        <Link href="/chia/documents/templates" className="text-[#056380] hover:text-[#002058]">Templates</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">{title}</span>
      </div>

      <h1 className="text-lg font-bold text-[#191c1e] mb-2">{title} template</h1>
      <p className="text-xs text-[#444650] mb-4 leading-relaxed">
        Saving creates a new version. Supports markdown bold (<code>**text**</code>) and paragraph breaks.
        The rendered PDF uses plain-text paragraphs with bold emphasis — keep formatting simple.
      </p>

      <TemplateEditor
        kind={dbKind}
        initialBody={current?.body_markdown ?? ''}
        currentVersion={current?.version ?? null}
      />

      {versions.length > 1 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider mb-2">Version history</h2>
          <ul className="text-xs text-[#444650] space-y-1">
            {versions.map(v => (
              <li key={v.id}>
                v{v.version} · effective {new Date(v.effective_from).toLocaleDateString('en-US', { dateStyle: 'long' })}
                {v.version === current?.version && <span className="ml-2 text-[#1a6b3c] font-semibold">current</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
