'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archivePerson } from '../actions'

export default function ArchivePersonButton({ personId }: { personId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirm, setConfirm]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [blockers, setBlockers] = useState<string[] | null>(null)

  function handleArchive() {
    setError(null)
    setBlockers(null)
    start(async () => {
      const res = await archivePerson(personId)
      if (res.error)    { setError(res.error); return }
      if (res.blockers) { setBlockers(res.blockers); return }
      router.push('/chia/people')
      router.refresh()
    })
  }

  if (blockers) {
    return (
      <div className="text-xs text-right max-w-xs">
        <div className="font-semibold text-red-700 mb-1">Can't archive — this person:</div>
        <ul className="list-disc list-inside text-red-700 space-y-0.5">
          {blockers.map(b => <li key={b}>{b}</li>)}
        </ul>
        <button
          onClick={() => { setBlockers(null); setConfirm(false) }}
          className="mt-1 text-[#056380] hover:text-[#002058] font-semibold"
        >
          Dismiss
        </button>
      </div>
    )
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#444650]">Archive this person?</span>
        <button
          onClick={handleArchive}
          disabled={pending}
          className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-40"
        >
          {pending ? 'Archiving…' : 'Yes, archive'}
        </button>
        <button
          onClick={() => setConfirm(false)}
          disabled={pending}
          className="text-xs font-semibold text-[#444650] hover:text-[#191c1e]"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="text-xs font-semibold text-red-700 hover:text-red-900"
        title="Archive this person (hides them from all lists)"
      >
        Archive
      </button>
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </>
  )
}
