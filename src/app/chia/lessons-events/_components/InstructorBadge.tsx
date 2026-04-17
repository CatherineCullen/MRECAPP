import { instructorColor, UNASSIGNED_COLOR } from '../_lib/instructorColor'
import { personInitials, type NameablePerson } from '@/lib/displayName'

// Visual identity marker for an instructor — matches the left stripe on
// lesson calendar cards. Use anywhere an instructor is named and scanning
// by color is useful (lesson detail, subscriptions list, instructor schedule).
//
// Color precedence: person.calendar_color (admin override) → hash-based default.
// Same rule as the calendar, so colors stay consistent across views.

type InstructorLike = (NameablePerson & {
  id?:             string | null
  calendar_color?: string | null
}) | null | undefined

type Props = {
  instructor: InstructorLike
  /** Render size — compact (14px) for dense tables, normal (16px) elsewhere. */
  size?: 'compact' | 'normal'
}

export default function InstructorBadge({ instructor, size = 'normal' }: Props) {
  const initials = personInitials(instructor)
  const color    = instructor?.calendar_color
    || (instructor?.id ? instructorColor(instructor.id) : UNASSIGNED_COLOR)

  const dims = size === 'compact'
    ? { width: 18, height: 14, fontSize: 9 }
    : { width: 22, height: 16, fontSize: 10 }

  return (
    <span
      className="inline-flex items-center justify-center text-white font-bold rounded-sm flex-none"
      style={{
        ...dims,
        letterSpacing:   '0.5px',
        backgroundColor: color,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
