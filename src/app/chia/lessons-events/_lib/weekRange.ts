// Week math. "Week" = Monday-Sunday (matches the planning doc's week grid).

export function toISODate(d: Date): string {
  // Local-date YYYY-MM-DD (not UTC) — we want the *calendar* day where the user is.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday of the ISO week containing `d` (in local time). */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = out.getDay()                 // 0 = Sun .. 6 = Sat
  const offset = day === 0 ? -6 : 1 - day  // Sun => -6, Mon => 0, Tue => -1, ...
  out.setDate(out.getDate() + offset)
  return out
}

/** 7 dates (Mon .. Sun) for the week containing `d`. */
export function weekDays(d: Date): Date[] {
  const monday = startOfWeek(d)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday)
    x.setDate(x.getDate() + i)
    return x
  })
}

export function shiftWeek(d: Date, direction: 1 | -1): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + 7 * direction)
  return out
}

export function formatWeekLabel(d: Date): string {
  const days = weekDays(d)
  const first = days[0]
  const last  = days[6]
  const fmt = (x: Date, opts: Intl.DateTimeFormatOptions) =>
    x.toLocaleDateString('en-US', opts)
  if (first.getMonth() === last.getMonth()) {
    return `${fmt(first, { month: 'short', day: 'numeric' })} – ${last.getDate()}, ${last.getFullYear()}`
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${fmt(first, { month: 'short', day: 'numeric' })} – ${fmt(last, { month: 'short', day: 'numeric' })}, ${last.getFullYear()}`
  }
  return `${fmt(first, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(last, { month: 'short', day: 'numeric', year: 'numeric' })}`
}
