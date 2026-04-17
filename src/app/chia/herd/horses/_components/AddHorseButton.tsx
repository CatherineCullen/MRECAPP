'use client'

import { useRouter } from 'next/navigation'

export default function AddHorseButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push('/chia/herd/horses/new')}
      className="btn-primary text-white text-xs font-semibold px-4 py-2 rounded transition-opacity hover:opacity-90"
    >
      + Add Horse
    </button>
  )
}
