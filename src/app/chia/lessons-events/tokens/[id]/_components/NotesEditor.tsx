'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateTokenNote } from '../../actions'

type Props = {
  tokenId: string
  initial: string
  canEdit: boolean
}

export default function NotesEditor({ tokenId, initial, canEdit }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(initial)
  const [error, setError]     = useState<string | null>(null)

  function save() {
    setError(null)
    startTransition(async () => {
      const r = await updateTokenNote(tokenId, draft || null)
      if (r?.error) setError(r.error)
      else {
        setEditing(false)
        router.refresh()
      }
    })
  }

  function cancel() {
    setDraft(initial)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div>
        {initial ? (
          <p className="text-xs text-[#191c1e] whitespace-pre-wrap">{initial}</p>
        ) : (
          <p className="text-xs text-[#c4c6d1]">(no notes)</p>
        )}
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="mt-2 text-[10px] text-[#002058] font-semibold hover:underline"
          >
            {initial ? 'Edit' : '+ Add note'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <textarea
        rows={3}
        className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#002058]"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="e.g. rider asked to save for February, clinic date TBC"
        autoFocus
      />
      {error && <p className="text-[10px] text-red-700 mt-1">{error}</p>}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={save}
          disabled={pending}
          className="text-[10px] font-semibold text-white bg-[#002058] px-2.5 py-1 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={cancel}
          disabled={pending}
          className="text-[10px] font-semibold text-[#444650] hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
