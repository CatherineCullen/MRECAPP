// Derive the effective display status of a lesson.
//
// Rule (Catherine): "If a lesson wasn't cancelled and it's in the past,
// it's complete." We don't ask the admin to manually flip every lesson
// to Completed — past + still-scheduled is treated as complete for display.
//
// Terminal statuses (cancelled_*, completed, no_show) are honored as-is.
// The legacy `completed` value is kept so historical/explicit completions
// still render correctly.

export type RawStatus =
  | 'pending'
  | 'scheduled'
  | 'completed'
  | 'cancelled_rider'
  | 'cancelled_barn'
  | 'no_show'

export type EffectiveStatus = RawStatus

export function effectiveStatus(args: {
  status:      RawStatus
  scheduledAt: string
  now?:        Date
}): EffectiveStatus {
  const now = args.now ?? new Date()
  if (args.status === 'scheduled' && new Date(args.scheduledAt) < now) {
    return 'completed'
  }
  return args.status
}

/** True if the raw status indicates a done-and-final lesson. */
export function isRawTerminal(status: RawStatus): boolean {
  return status === 'completed'
      || status === 'cancelled_rider'
      || status === 'cancelled_barn'
      || status === 'no_show'
}

/** True if, from the user's perspective, the lesson is done (past or terminal). */
export function isEffectivelyDone(status: RawStatus, scheduledAt: string): boolean {
  return isRawTerminal(status) || new Date(scheduledAt) < new Date()
}
