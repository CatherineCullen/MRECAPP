export default function MakeupTokenCard({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className="bg-secondary-fixed rounded-lg px-4 py-3">
      <p className="text-sm font-bold text-on-secondary-fixed">
        {count === 1
          ? 'You have 1 unscheduled makeup credit.'
          : `You have ${count} unscheduled makeup credits.`}
      </p>
      <p className="text-xs text-on-secondary-fixed/70 mt-0.5">
        Contact the barn to schedule your makeup lesson.
      </p>
    </div>
  )
}
