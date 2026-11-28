/**
 * Dates as a player reads them. The wire carries plain ISO dates (`as_of`), which are a
 * format for machines; a reveal that says "as of 20 September 2026" in the reader's own
 * locale is one a person takes in without parsing.
 */

/** `as_of` is a plain date with no zone: render it as that day everywhere, not as UTC midnight. */
export function asOfDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
}

/** A daily's day as Your dailies lists it, that day everywhere: "Sat 31 Oct". */
export function dailyDate(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(parsed.getTime())
    ? day
    : parsed.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
}

/** When a game ended, in the reader's own zone and locale: "1 Oct 2026, 21:05". */
export function finishedTime(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** When a past game ended, for the top bar, in the reader's own zone: "Sun 25 Oct at 21:14". */
export function finishedAt(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  const day = parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const time = parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day} at ${time}`
}

/** The day a game ended, in the reader's own zone, for a narrow screen: "25 Oct". */
export function finishedDay(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const HOUR_MS = 3_600_000

/**
 * How long a room has left, roughly: "in 31 hours", never a clock time. The stored expiry
 * is the one from creation and starting a game pushes the real one later, so this errs
 * early rather than late.
 */
export function expiresIn(expiresAt: number, now: number = Date.now()): string {
  const hours = Math.floor((expiresAt - now) / HOUR_MS)
  if (hours < 1) return 'in under an hour'
  if (hours === 1) return 'in 1 hour'
  if (hours < 48) return `in ${hours} hours`
  const days = Math.floor(hours / 24)
  return `in ${days} days`
}

/** The day something opens, in the reader's own zone: "1 January". */
export function opensOn(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

/** Within a day, the countdown shows; further off, the date alone says enough. */
export const COUNTDOWN_FROM_MS = 24 * HOUR_MS

/** How long until `ms` from now, as a ticking countdown: "5h 03m 09s", "3m 09s". */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}h ${pad(minutes)}m ${pad(seconds)}s` : `${minutes}m ${pad(seconds)}s`
}
