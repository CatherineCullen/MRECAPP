'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { expireToken, restoreToken } from '../../actions'

type Status = 'available' | 'scheduled' | 'used' | 'expired'

type Props = {
  tokenId: string
  status:  Status
}

export default function TokenDetailActions({ tokenId, status }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleExpire() {
    setError(null)
    startTransition(async () => {
      const r = await expireToken(tokenId)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  function handleRestore() {
    setError(null)
    startTransition(async () => {
      const r = await restoreToken(tokenId)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  if (status === 'used' || status === 'scheduled') {
    // Terminal / in-flight — nothing to do from here. The scheduled makeup
    // lesson itself handles reschedule/cancel actions in its own detail page.
    return null
  }

  return (
    <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4">
      <h3 className="text-sm font-bold text-[#191c1e] mb-3">Actions</h3>
      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        {status === 'available' && (
          <>
            <Link
              href={`/chia/lessons-events/products/new?tokenId=${tokenId}`}
              className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] transition-colors"
            >
              Schedule Makeup
            </Link>
            <button
              onClick={handleExpire}
              disabled={pending}
              className="text-xs font-semibold text-[#8a1a1a] border border-[#ffd6d6] bg-white px-2.5 py-1.5 rounded hover:bg-[#ffd6d6]/30 disabled:opacity-50 transition-colors"
            >
              Expire
            </button>
          </>
        )}
        {status === 'expired' && (
          <button
            onClick={handleRestore}
            disabled={pending}
            className="text-xs font-semibold text-[#1a6b3c] border border-[#b7f0d0] bg-white px-2.5 py-1.5 rounded hover:bg-[#b7f0d0]/30 disabled:opacity-50 transition-colors"
          >
            Restore
          </button>
        )}
      </div>
    </div>
  )
}
