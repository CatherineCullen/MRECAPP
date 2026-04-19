'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// Single "+ New" button for the calendar nav. Opens a popover with the same
// four choices the admin gets from clicking a calendar slot — New lesson,
// New event, New subscription, Schedule makeup — so both surfaces feel
// identical. No prefill params here since there's no slot context; the
// target pages fall through to their own defaults.

export default function NewLessonMenu() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Click-outside + Escape to close.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] transition-colors"
      >
        + New
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-[#002058] shadow-lg rounded-lg p-2 text-[11px] w-72">
          <div className="flex flex-col gap-1">
            <Link
              href="/chia/lessons-events/products/new"
              onClick={() => setOpen(false)}
              className="w-full text-left px-2 py-1.5 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors block"
            >
              <div className="font-semibold text-[#002058]">New lesson</div>
              <div className="text-[10px] text-[#444650]">Evaluation · Extra lesson</div>
            </Link>
            <Link
              href="/chia/lessons-events/events/new"
              onClick={() => setOpen(false)}
              className="w-full text-left px-2 py-1.5 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors block"
            >
              <div className="font-semibold text-[#002058]">New event</div>
              <div className="text-[10px] text-[#444650]">Birthday party · Clinic · Therapy · Other</div>
            </Link>
            <Link
              href="/chia/lessons-events/subscriptions/new"
              onClick={() => setOpen(false)}
              className="w-full text-left px-2 py-1.5 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors block"
            >
              <div className="font-semibold text-[#002058]">New subscription</div>
              <div className="text-[10px] text-[#444650]">Recurring weekly slot this quarter</div>
            </Link>
            <Link
              href="/chia/lessons-events/makeups/new"
              onClick={() => setOpen(false)}
              className="w-full text-left px-2 py-1.5 rounded border border-[#c4c6d1] bg-white hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors block"
            >
              <div className="font-semibold text-[#002058]">Schedule makeup</div>
              <div className="text-[10px] text-[#444650]">Redeem an available token</div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
