'use client'

import Link from 'next/link'

export default function ViewToggle({
  view,
  week,
}: {
  view: 'mine' | 'all' | 'availability'
  week: string
}) {
  const base = (v: 'mine' | 'all' | 'availability') => {
    const params = new URLSearchParams()
    if (week) params.set('week', week)
    if (v !== 'mine') params.set('view', v)
    const qs = params.toString()
    return `/my/teaching${qs ? `?${qs}` : ''}`
  }
  const btn = (active: boolean) =>
    `flex-1 text-center text-xs font-bold uppercase tracking-wide py-1.5 rounded ${
      active ? 'bg-secondary text-on-secondary' : 'text-on-surface-muted'
    }`

  return (
    <div className="flex bg-surface-lowest rounded-lg p-1 mb-2 gap-1">
      <Link href={base('mine')}         className={btn(view === 'mine')}>Me</Link>
      <Link href={base('all')}          className={btn(view === 'all')}>All instructors</Link>
      <Link href={base('availability')} className={btn(view === 'availability')}>Availability</Link>
    </div>
  )
}
