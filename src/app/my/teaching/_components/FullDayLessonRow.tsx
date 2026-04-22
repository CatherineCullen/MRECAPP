export type FullDayLesson = {
  lessonId: string
  scheduledAt: string
  instructorName: string
  isMine: boolean
  lessonType: 'private' | 'semi_private' | 'group'
  riders: Array<{ name: string; horseName: string | null }>
}

export default function FullDayLessonRow({ lesson }: { lesson: FullDayLesson }) {
  const riderLabel = lesson.riders.map(r => r.name).join(' & ') || '—'
  const horses = lesson.riders.map(r => r.horseName).filter(Boolean) as string[]
  const horseLabel = horses.length
    ? Array.from(new Set(horses)).join(' & ')
    : null

  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm ${
        lesson.isMine
          ? 'bg-secondary-container/60 border-l-4 border-secondary'
          : 'bg-surface-lowest'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold text-on-surface-muted uppercase tracking-wide">
          {lesson.instructorName}
        </span>
        {lesson.isMine && (
          <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">You</span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        {horseLabel ? (
          <span className="font-semibold text-on-surface">{horseLabel}</span>
        ) : (
          <span className="font-semibold text-warning">No horse</span>
        )}
        <span className="text-on-surface-muted">·</span>
        <span className="text-on-surface-muted">{riderLabel}</span>
      </div>
    </div>
  )
}
