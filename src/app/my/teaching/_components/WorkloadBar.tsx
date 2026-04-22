'use client'

export type HorseWorkload = {
  id: string
  barnName: string
  todayCount: number
  weekCount: number
  schedulingNote: string | null
}

export default function WorkloadBar({ horses }: { horses: HorseWorkload[] }) {
  if (!horses.length) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30"
      style={{ background: 'rgba(0,20,60,0.97)', backdropFilter: 'blur(8px)' }}
    >
      <div className="max-w-md mx-auto px-4 py-2">
        <div className="flex gap-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {horses.map(h => (
            <div key={h.id} className="flex-shrink-0 min-w-0">
              <span className="text-[11px] font-bold text-white">{h.barnName}</span>
              <span className="text-[11px] text-secondary/70 ml-1">
                {h.todayCount} today · {h.weekCount} this week
              </span>
              {h.schedulingNote && (
                <span className="text-[11px] text-warning ml-1">— {h.schedulingNote}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
