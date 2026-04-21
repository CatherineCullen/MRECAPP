import Link from 'next/link'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

type Props = {
  horseId: string
  coggins: {
    expiry_date: string | null
    date_drawn:  string | null
    document_id: string | null
  } | null
}

export default function CogginsCard({ horseId, coggins }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const expired = coggins?.expiry_date != null && coggins.expiry_date < today

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
          Coggins
        </h2>
        <Link
          href={`/my/horses/${horseId}/coggins/new`}
          className="text-xs font-semibold text-on-secondary-container"
        >
          + Add
        </Link>
      </div>

      {!coggins ? (
        <p className="text-sm text-on-surface-muted mt-1">No Coggins on file.</p>
      ) : (
        <div className="flex items-center justify-between gap-3 mt-1">
          <div>
            <p className={`text-sm font-semibold ${expired ? 'text-error' : 'text-on-surface'}`}>
              {expired ? 'Expired ' : 'Expires '}
              {formatDate(coggins.expiry_date ?? coggins.date_drawn)}
            </p>
          </div>
          {coggins.document_id && (
            <a
              href={`/api/documents/${coggins.document_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-on-secondary-container flex-shrink-0"
            >
              View PDF →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
