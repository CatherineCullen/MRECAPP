'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { softDeleteDocument } from '../actions'
import { isProtectedFromDelete } from '../_lib/documentTypes'
import type { DocumentListRow } from '../_lib/loadDocuments'

// Compact table. Clicking the filename opens the file through the signed-URL
// route (/api/documents/[id]). Delete is inline; waivers refuse at the
// server action level and surface the error here.

export default function DocumentsList({
  rows,
  showAttachment = true,
}: {
  rows: DocumentListRow[]
  /** Hide the "Attached to" column when already scoped to one entity. */
  showAttachment?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  function handleDelete(row: DocumentListRow) {
    if (isProtectedFromDelete(row.type)) {
      setError('Waivers cannot be deleted — upload a replacement instead.')
      return
    }
    if (!confirm(`Delete "${row.filename}"? This can be restored by an admin via the database.`)) return
    setError(null)
    setPendingId(row.id)
    startTransition(async () => {
      const res = await softDeleteDocument(row.id)
      setPendingId(null)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-[#444650]">No documents.</div>
  }

  return (
    <div>
      {error && <div className="px-4 py-2 text-xs text-[#b3261e] bg-[#fce8e6]">{error}</div>}
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
            <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-32">Type</th>
            <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase">Filename</th>
            {showAttachment && (
              <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-56">Attached to</th>
            )}
            <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-28">Signed</th>
            <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-28">Uploaded</th>
            <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase">Notes</th>
            <th className="py-1.5 px-3 w-16" />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const signed = row.signedAt
              ? new Date(row.signedAt + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
              : '—'
            const uploaded = new Date(row.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
            const attachHref =
              row.attachedKind === 'horse'  && row.horseId  ? `/chia/herd/horses/${row.horseId}` :
              row.attachedKind === 'person' && row.personId ? `/chia/people/${row.personId}`   : null
            const disabled = isProtectedFromDelete(row.type)
            return (
              <tr key={row.id} className="border-b border-[#c4c6d1]/20 hover:bg-[#fafbfd]">
                <td className="py-1.5 px-3 text-xs text-[#191c1e]">{row.type}</td>
                <td className="py-1.5 px-3 text-xs">
                  <a
                    href={`/api/documents/${row.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#056380] hover:text-[#002058]"
                  >
                    {row.filename}
                  </a>
                </td>
                {showAttachment && (
                  <td className="py-1.5 px-3 text-xs text-[#444650]">
                    {attachHref
                      ? <Link href={attachHref} className="hover:text-[#002058]">{row.attachedLabel}</Link>
                      : row.attachedLabel}
                  </td>
                )}
                <td className="py-1.5 px-3 text-xs text-[#444650]">{signed}</td>
                <td className="py-1.5 px-3 text-xs text-[#444650]">{uploaded}</td>
                <td className="py-1.5 px-3 text-xs text-[#444650] truncate max-w-xs">{row.notes ?? ''}</td>
                <td className="py-1.5 px-3 text-right">
                  <button
                    onClick={() => handleDelete(row)}
                    disabled={disabled || (isPending && pendingId === row.id)}
                    title={disabled ? 'Waivers cannot be deleted' : 'Delete'}
                    className="text-[11px] text-[#b3261e] hover:text-[#7a180f] disabled:text-[#c4c6d1] disabled:cursor-not-allowed"
                  >
                    {pendingId === row.id ? '…' : 'Delete'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
