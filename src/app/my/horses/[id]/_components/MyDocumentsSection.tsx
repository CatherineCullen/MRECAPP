'use client'

import { useState } from 'react'

export type DocumentRow = {
  id:            string
  document_type: string
  filename:      string
  uploaded_at:   string
  signed_at:     string | null
  expires_at:    string | null
}

function formatDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MyDocumentsSection({ documents }: { documents: DocumentRow[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
          Documents
          {documents.length > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold text-on-surface-muted normal-case tracking-normal">
              ({documents.length})
            </span>
          )}
        </h2>
        <span className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {documents.length === 0 && (
            <p className="text-sm text-on-surface-muted">No documents on file.</p>
          )}
          {documents.map(d => (
            <div key={d.id} className="py-1.5 border-t border-outline first:border-t-0">
              <div className="flex items-baseline gap-3">
                <div className="shrink-0 text-[11px] text-on-surface-muted tabular-nums">
                  {formatDate(d.signed_at ?? d.uploaded_at)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-on-surface truncate">{d.document_type}</div>
                  <div className="text-[11px] text-on-surface-muted truncate">{d.filename}</div>
                </div>
                <a
                  href={`/api/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[11px] font-semibold text-on-secondary-container"
                >
                  View →
                </a>
              </div>
              {d.expires_at && (
                <div className="mt-0.5 text-[10px] text-on-surface-muted">
                  Expires {formatDate(d.expires_at)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
