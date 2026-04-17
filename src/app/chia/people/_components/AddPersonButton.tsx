'use client'

import { useRouter } from 'next/navigation'

export default function AddPersonButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push('/chia/people/new')}
      className="btn-primary text-white text-xs font-semibold px-4 py-2 rounded"
    >
      + Add Person
    </button>
  )
}
