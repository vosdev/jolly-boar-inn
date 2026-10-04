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

/** When a game ended, in the reader's own zone and locale: "1 Oct 2026, 21:05". */
export function finishedTime(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
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
