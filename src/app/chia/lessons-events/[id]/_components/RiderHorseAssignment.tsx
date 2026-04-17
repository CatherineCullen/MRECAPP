'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateRiderHorse } from '../actions'

// Horse options: lesson horses surface first (separator below), then all others.
// `lesson_horse` is a visibility filter, not a hard restriction — admin can
// still pick a non-lesson horse if the situation calls for it.
export type HorseOption = {
  id:          string
  name:        string
  lessonHorse: boolean
}

type Props = {
  lessonId:       string
  lessonRiderId:  string
  currentHorseId: string | null
  currentName:    string | null
  horses:         HorseOption[]
  /** Disable editing when the lesson or this rider row is in a terminal state */
  readOnly?:      boolean
}

export default function RiderHorseAssignment({
  lessonId, lessonRiderId, currentHorseId, currentName, horses, readOnly,
}: Props) {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [filter, setFilter]       = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Outside-click + Escape close
  useEffect(() => {
    if (!open) return
    function handleDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function choose(horseId: string | null) {
    setError(null)
    startTransition(async () => {
      const res = await updateRiderHorse({ lessonId, lessonRiderId, horseId })
      if (res?.error) {
        setError(res.error)
        return
      }
      setOpen(false)
      setFilter('')
      router.refresh()
    })
  }

  // Filter + split. Empty filter still shows the full list — the filter is a
  // convenience for barns with many horses; most flow-through use is clicking.
  const q = filter.trim().toLowerCase()
  const matches = q
    ? horses.filter(h => h.name.toLowerCase().includes(q))
    : horses
  const lessonHorses = matches.filter(h => h.lessonHorse)
  const otherHorses  = matches.filter(h => !h.lessonHorse)

  const label = currentName ?? 'No horse assigned'

  if (readOnly) {
    // Static display when the lesson/rider row is terminal — match the inline
    // style the original dl used (" · HorseName")
    return (
      <span className="text-[#444650]">
        {currentName ? ` · ${currentName}` : ''}
      </span>
    )
  }

  return (
    <span className="relative inline-block" ref={wrapRef}>
      {' · '}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 border text-[11px] transition-colors ${
          currentHorseId
            ? 'border-[#c4c6d1] bg-white text-[#191c1e] hover:border-[#002058]'
            : 'border-dashed border-[#7a5a00]/50 bg-[#fff4d6]/40 text-[#7a5a00] hover:border-[#7a5a00]'
        } ${pending ? 'opacity-60' : ''}`}
        title="Change horse"
      >
        <span>{label}</span>
        <span className="text-[9px] opacity-70">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-64 bg-white border border-[#002058] shadow-lg rounded-lg p-2 text-[11px]">
          <input
            autoFocus
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search horses…"
            className="w-full border border-[#c4c6d1] rounded px-2 py-1 text-xs mb-1.5 focus:outline-none focus:border-[#002058]"
          />

          <div className="max-h-64 overflow-y-auto">
            {/* Clear option */}
            <button
              type="button"
              onClick={() => choose(null)}
              disabled={pending}
              className={`w-full text-left px-2 py-1 rounded text-[11px] italic transition-colors ${
                currentHorseId === null
                  ? 'bg-[#f7f9fc] text-[#444650]'
                  : 'text-[#7a5a00] hover:bg-[#fff4d6]/60'
              }`}
            >
              — No horse assigned —
            </button>

            {/* Lesson horses first */}
            {lessonHorses.length > 0 && (
              <>
                <div className="text-[9px] font-bold uppercase tracking-wide text-[#444650] mt-1.5 mb-0.5 px-2">
                  Lesson horses
                </div>
                {lessonHorses.map(h => (
                  <HorseRow
                    key={h.id}
                    name={h.name}
                    selected={h.id === currentHorseId}
                    disabled={pending}
                    onClick={() => choose(h.id)}
                  />
                ))}
              </>
            )}

            {/* All other horses */}
            {otherHorses.length > 0 && (
              <>
                <div className="text-[9px] font-bold uppercase tracking-wide text-[#444650] mt-1.5 mb-0.5 px-2">
                  Other horses
                </div>
                {otherHorses.map(h => (
                  <HorseRow
                    key={h.id}
                    name={h.name}
                    selected={h.id === currentHorseId}
                    disabled={pending}
                    onClick={() => choose(h.id)}
                  />
                ))}
              </>
            )}

            {lessonHorses.length === 0 && otherHorses.length === 0 && (
              <div className="px-2 py-3 text-[11px] text-[#444650] italic">
                No horses match "{filter}".
              </div>
            )}
          </div>

          {error && (
            <div className="mt-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded text-[10px] text-red-700">
              {error}
            </div>
          )}
        </div>
      )}
    </span>
  )
}

function HorseRow({
  name, selected, disabled, onClick,
}: {
  name:     string
  selected: boolean
  disabled: boolean
  onClick:  () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
        selected
          ? 'bg-[#dae2ff] text-[#002058] font-semibold'
          : 'text-[#191c1e] hover:bg-[#f7f9fc]'
      }`}
    >
      {name}
    </button>
  )
}
