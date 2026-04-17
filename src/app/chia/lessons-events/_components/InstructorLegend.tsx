'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateInstructorColor } from '../_actions/instructorColor'
import { INSTRUCTOR_PALETTE } from '../_lib/instructorColor'
import type { InstructorKey } from './WeekGrid'

type Props = {
  instructors: InstructorKey[]
}

// The "Unassigned" pseudo-entry isn't editable — it represents lessons with
// no instructor assigned, not a real person row.
const UNASSIGNED_ID = '__unassigned'

export default function InstructorLegend({ instructors }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  // Close on outside click / Escape — shared across all instructor popovers
  const wrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!openId) return
    function handleDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenId(null)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openId])

  return (
    <div ref={wrapRef} className="flex items-center gap-3 flex-wrap mb-1">
      <span className="font-semibold uppercase tracking-wide text-[#444650]">Instructors</span>
      {instructors.map(i => {
        const editable = i.id !== UNASSIGNED_ID
        return (
          <span key={i.id} className="relative flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => editable && setOpenId(openId === i.id ? null : i.id)}
              disabled={!editable}
              title={editable ? 'Click to change color' : 'Lessons with no instructor'}
              className={`inline-flex items-center justify-center text-white font-bold rounded-sm transition-opacity ${
                editable ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
              }`}
              style={{
                width:           18,
                height:          14,
                fontSize:        9,
                letterSpacing:   '0.5px',
                backgroundColor: i.color,
              }}
            >
              {i.initials}
            </button>
            <span>{i.name}</span>

            {openId === i.id && editable && (
              <ColorPicker
                instructorId={i.id}
                currentColor={i.color}
                hasOverride={i.hasOverride}
                onDone={() => setOpenId(null)}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}

function ColorPicker({
  instructorId, currentColor, hasOverride, onDone,
}: {
  instructorId: string
  currentColor: string
  hasOverride:  boolean
  onDone:       () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function pick(color: string | null) {
    setError(null)
    startTransition(async () => {
      const r = await updateInstructorColor({ instructorId, color })
      if (r?.error) {
        setError(r.error)
        return
      }
      onDone()
      router.refresh()
    })
  }

  return (
    <div
      className="absolute left-0 top-full mt-1 z-20 bg-white border border-[#002058] shadow-lg rounded-lg p-2 text-[11px] whitespace-nowrap"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 mb-1.5">
        {INSTRUCTOR_PALETTE.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => pick(c)}
            disabled={pending}
            title={c}
            className={`w-5 h-5 rounded-sm border-2 transition-transform hover:scale-110 ${
              c.toLowerCase() === currentColor.toLowerCase()
                ? 'border-[#191c1e]'
                : 'border-transparent'
            } ${pending ? 'opacity-50' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {hasOverride && (
        <button
          type="button"
          onClick={() => pick(null)}
          disabled={pending}
          className="text-[10px] text-[#444650] hover:text-[#191c1e] hover:underline disabled:opacity-50"
        >
          Reset to default
        </button>
      )}

      {error && (
        <div className="mt-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded text-[10px] text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
