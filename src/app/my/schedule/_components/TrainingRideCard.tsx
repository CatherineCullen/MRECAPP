type Props = {
  rideDate:     string  // YYYY-MM-DD
  horseName:    string
  providerName?: string | null
}

function formatRideDate(date: string) {
  const d = new Date(date + 'T12:00:00') // avoid timezone shift on date-only strings
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function TrainingRideCard({ rideDate, horseName, providerName }: Props) {
  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3 border-l-4 border-warning flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide leading-tight">
          {formatRideDate(rideDate)}
        </p>
        <p className="text-base font-bold text-on-surface mt-0.5">{horseName}</p>
        <p className="text-sm text-on-surface-muted mt-0.5">
          Training Ride{providerName ? ` — ${providerName}` : ''}
        </p>
      </div>
      <span className="text-[10px] font-semibold bg-warning-container text-warning px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
        Training
      </span>
    </div>
  )
}
