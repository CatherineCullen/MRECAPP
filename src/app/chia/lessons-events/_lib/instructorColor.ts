/**
 * Instructor color assignment for calendar views.
 *
 * v1: deterministic hash of instructor_id → palette slot. Colors stay stable
 * across refreshes as long as the instructor row exists. When we want
 * instructor-picked colors, add a `calendar_color` field on Person and prefer
 * it; fall through to this hash for anyone without a custom color.
 *
 * Palette picked for:
 *  - Clear contrast with white initials
 *  - Reasonable color-blind separation (mix of hue + luminance)
 *  - Distinct from status colors used elsewhere on the card (cancelled red,
 *    scheduled border navy) — stripe lives on the left edge so collisions are
 *    acceptable even when they happen
 */
export const INSTRUCTOR_PALETTE = [
  '#002058',  // navy (CHIA primary)
  '#1a6b3c',  // forest green
  '#7a2ba7',  // violet
  '#c04a00',  // burnt orange
  '#056380',  // teal
  '#8a4a00',  // saddle brown
  '#b01060',  // magenta
  '#3a5080',  // steel blue
] as const

export const UNASSIGNED_COLOR = '#8f9099'  // neutral gray for "no instructor"

export function instructorColor(instructorId: string | null | undefined): string {
  if (!instructorId) return UNASSIGNED_COLOR
  let h = 0
  for (let i = 0; i < instructorId.length; i++) {
    h = (h * 31 + instructorId.charCodeAt(i)) >>> 0
  }
  return INSTRUCTOR_PALETTE[h % INSTRUCTOR_PALETTE.length]
}
