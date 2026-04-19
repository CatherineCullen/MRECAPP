'use client'

import { useRouter } from 'next/navigation'

export default function InviteRiderButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push('/chia/people/invite')}
      className="text-xs font-semibold px-4 py-2 rounded border border-[#002058] text-[#002058] hover:bg-[#002058] hover:text-white transition-colors"
    >
      ↳ Invite Rider
    </button>
  )
}
