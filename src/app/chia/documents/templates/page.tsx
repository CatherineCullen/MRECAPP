import Link from 'next/link'
import { loadTemplateVersions } from '../_lib/loadTemplate'

export default async function TemplatesIndexPage() {
  const [waivers, boarding] = await Promise.all([
    loadTemplateVersions('waiver'),
    loadTemplateVersions('boarding_agreement'),
  ])

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/documents" className="text-[#056380] hover:text-[#002058]">Documents</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Templates</span>
      </div>

      <h1 className="text-lg font-bold text-[#191c1e] mb-2">Document templates</h1>
      <p className="text-xs text-[#444650] mb-5 leading-relaxed">
        Editing a template creates a new immutable version. Waivers already signed against a prior
        version remain bound to the text that was in force when they signed — nothing downstream changes.
      </p>

      <div className="space-y-4">
        <TemplateCard
          kind="waiver"
          title="Waiver"
          description="Signed by every rider (or guardian for minors) before their first lesson."
          versions={waivers}
        />
        <TemplateCard
          kind="boarding_agreement"
          title="Boarding Agreement"
          description="Signed by boarders before their horse arrives."
          versions={boarding}
        />
      </div>
    </div>
  )
}

function TemplateCard({
  kind, title, description, versions,
}: {
  kind: 'waiver' | 'boarding_agreement'
  title: string
  description: string
  versions: Awaited<ReturnType<typeof loadTemplateVersions>>
}) {
  const slug = kind === 'waiver' ? 'waiver' : 'boarding-agreement'
  const current = versions[0]
  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#191c1e]">{title}</h2>
          <p className="text-[11px] text-[#444650] mt-0.5">{description}</p>
        </div>
        <Link
          href={`/chia/documents/templates/${slug}`}
          className="text-xs font-semibold text-[#056380] hover:text-[#002058] border border-[#c4c6d1]/50 px-3 py-1.5 rounded"
        >
          {current ? 'Edit' : 'Create'}
        </Link>
      </div>
      <div className="px-4 py-3 text-xs text-[#444650]">
        {versions.length === 0 ? (
          <span className="italic text-[#c4c6d1]">No version on file yet.</span>
        ) : (
          <>
            <span>Current: v{current.version} · effective {new Date(current.effective_from).toLocaleDateString()}</span>
            {versions.length > 1 && (
              <span className="ml-3 text-[#6b6e7a]">{versions.length - 1} prior version{versions.length - 1 === 1 ? '' : 's'}</span>
            )}
          </>
        )}
      </div>
    </section>
  )
}
