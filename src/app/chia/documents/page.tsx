import { loadDocuments, loadAttachOptions } from './_lib/loadDocuments'
import DocumentsFilters from './_components/DocumentsFilters'
import DocumentsList from './_components/DocumentsList'
import AddDocumentButton from './_components/AddDocumentButton'
import Link from 'next/link'

// Top-level documents repository. Admin-only in practice — the actions.ts
// server actions enforce admin. The page is readable by any signed-in user
// but the delete/upload affordances only produce useful results for admins.

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>
}) {
  const { type, q } = await searchParams
  const selectedType = type ?? 'all'

  const [rows, attach] = await Promise.all([
    loadDocuments({ type: selectedType, search: q }),
    loadAttachOptions(),
  ])

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold text-[#191c1e]">Documents</h1>
          <p className="text-xs text-[#444650] mt-0.5">
            Waivers, boarding agreements, Coggins, vet records, and miscellaneous files.
            Uploading here attaches to a horse or person; per-entity sections on their
            record pages show only their documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/chia/documents/templates"
            className="text-xs font-semibold text-[#056380] hover:text-[#002058] border border-[#c4c6d1]/50 px-3 py-1.5 rounded"
          >
            Templates
          </Link>
          <AddDocumentButton horses={attach.horses} people={attach.people} />
        </div>
      </div>

      {/* Filters */}
      <DocumentsFilters selectedType={selectedType} initialSearch={q ?? ''} />

      {/* Table */}
      <div className="mt-4 bg-white rounded-lg overflow-hidden">
        <DocumentsList rows={rows} />
      </div>

      <div className="mt-2 text-xs text-[#444650]">
        {rows.length} {rows.length === 1 ? 'document' : 'documents'}
      </div>
    </div>
  )
}
