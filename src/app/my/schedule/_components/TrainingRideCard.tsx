type Props = {
  rideDate:   string  // YYYY-MM-DD
  horseName:  string
}

function formatRideDate(date: string) {
  const d = new Date(date + 'T12:00:00') // avoid timezone shift on date-only strings
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function TrainingRideCard({ rideDate, horseName }: Props) {
  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide leading-tight">
        {formatRideDate(rideDate)}
      </p>
      <p className="text-base font-bold text-on-surface mt-0.5">{horseName}</p>
      <p className="text-sm text-on-surface-muted mt-0.5">Training Ride</p>
    </div>
  )
}
