'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { markUploadReviewed, unmarkUploadReviewed } from '../actions'

export type UploadRow = {
  id:          string
  horseId:     string | null
  horseName:   string
  filename:    string
  uploadedAt:  string
  uploadedBy:  string
  reviewedAt:  string | null
  reviewedBy:  string | null
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function UploadsQueue({
  rows,
  showProcessed,
}: {
  rows: UploadRow[]
  showProcessed: boolean
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#191c1e]">Owner Uploads</h1>
          <p className="text-sm text-[#444650] mt-0.5">
            PDFs uploaded by owners from their horse pages. Open each one, run
            the AI import from the Import tab as needed, then mark it processed.
          </p>
        </div>
        <div className="flex gap-1 text-xs font-semibold">
          <Link
            href="/chia/herd/uploads"
            className={`px-3 py-1.5 rounded ${
              !showProcessed ? 'bg-[#002058] text-white' : 'bg-[#e7ecf4] text-[#444650]'
            }`}
          >
            Pending
          </Link>
          <Link
            href="/chia/herd/uploads?show=processed"
            className={`px-3 py-1.5 rounded ${
              showProcessed ? 'bg-[#002058] text-white' : 'bg-[#e7ecf4] text-[#444650]'
            }`}
          >
            Recently processed
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg p-6 text-sm text-[#444650]">
          {showProcessed
            ? 'No processed uploads to show.'
            : 'Nothing to review right now.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f9fc] text-[11px] font-semibold text-[#444650] uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Horse</th>
                <th className="text-left px-4 py-2">Uploaded by</th>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">File</th>
                {showProcessed && <th className="text-left px-4 py-2">Processed</th>}
                <th className="text-right px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <Row key={r.id} row={r} showProcessed={showProcessed} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Row({ row, showProcessed }: { row: UploadRow; showProcessed: boolean }) {
  const [pending, startTx] = useTransition()
  const [error, setError]  = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTx(async () => {
      const res = showProcessed
        ? await unmarkUploadReviewed(row.id)
        : await markUploadReviewed(row.id)
      if (res.error) setError(res.error)
    })
  }

  return (
    <tr className="border-t border-[#e7ecf4]">
      <td className="px-4 py-2 font-semibold text-[#191c1e]">
        {row.horseId ? (
          <Link href={`/chia/herd/horses/${row.horseId}`} className="hover:underline">
            {row.horseName}
          </Link>
        ) : row.horseName}
      </td>
      <td className="px-4 py-2 text-[#444650]">{row.uploadedBy}</td>
      <td className="px-4 py-2 text-[#444650] tabular-nums">{formatWhen(row.uploadedAt)}</td>
      <td className="px-4 py-2">
        <a
          href={`/api/documents/${row.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-[#002058] font-semibold hover:underline"
        >
          {row.filename}
        </a>
        {' '}
        {row.horseId && (
          <Link
            href={`/chia/herd/import?horse_id=${row.horseId}&mode=ai`}
            className="ml-2 text-[11px] text-[#444650] hover:underline"
          >
            Open Import →
          </Link>
        )}
      </td>
      {showProcessed && (
        <td className="px-4 py-2 text-[11px] text-[#444650]">
          {row.reviewedAt ? formatWhen(row.reviewedAt) : ''}
          {row.reviewedBy && <div className="text-[#8a8c94]">by {row.reviewedBy}</div>}
        </td>
      )}
      <td className="px-4 py-2 text-right">
        <button
          onClick={handleClick}
          disabled={pending}
          className="text-xs font-semibold px-3 py-1.5 rounded bg-[#e7ecf4] text-[#002058] hover:bg-[#d9e1ef] disabled:opacity-50"
        >
          {pending
            ? '…'
            : showProcessed
              ? 'Move back to pending'
              : 'Mark processed'}
        </button>
        {error && <div className="text-[11px] text-[#b00020] mt-1">{error}</div>}
      </td>
    </tr>
  )
}
