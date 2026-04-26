import Link from 'next/link'

type Props = {
  sheetId:    string
  date:       string             // 'YYYY-MM-DD'
  mode:       'timed' | 'ordered'
  startTime:  string | null      // 'HH:MM:SS'
  duration:   number | null
  title:      string
  providerName: string
  horseName:  string
  serviceName: string | null
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function fmtClock(t: string | null) {
  if (!t) return null
  const [hh, mm] = t.split(':').map(Number)
  const period   = hh >= 12 ? 'pm' : 'am'
  const h12      = ((hh + 11) % 12) + 1
  return `${h12}:${String(mm).padStart(2, '0')}${period}`
}

export default function SignUpSlotCard({
  sheetId, date, mode, startTime, duration, title, providerName, horseName, serviceName,
}: Props) {
  const timeLabel = mode === 'timed' && startTime
    ? (() => {
        const start = fmtClock(startTime)
        if (!duration) return start
        const [hh, mm] = startTime.split(':').map(Number)
        const total = hh * 60 + mm + duration
        const endHH = String(Math.floor(total / 60) % 24).padStart(2, '0')
        const endMM = String(total % 60).padStart(2, '0')
        return `${start}–${fmtClock(`${endHH}:${endMM}:00`)}`
      })()
    : 'All day'

  return (
    <Link
      href={`/my/sign-ups/${sheetId}`}
      className="block bg-surface-lowest rounded-lg px-4 py-3 border-l-4 border-on-secondary-container/60 flex items-start justify-between gap-3 hover:bg-surface-low transition-colors"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide leading-tight">
          {fmtDate(date)} · {timeLabel}
        </p>
        <p className="text-base font-bold text-on-surface mt-0.5">{horseName}</p>
        <p className="text-sm text-on-surface-muted mt-0.5">
          {title}{serviceName ? ` — ${serviceName}` : ''} · {providerName}
        </p>
      </div>
      <span className="text-[10px] font-semibold bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
        Sign-Up
      </span>
    </Link>
  )
}
