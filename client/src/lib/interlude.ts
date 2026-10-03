/**
 * The timing of a random event's interlude (section 12 of ideas/design.md), as numbers a
 * test can check without a stage.
 *
 * Every time here is in ms from the moment the event took the stage. That is the
 * question's arrival rather than its `opened_at`, so a `question_open` that arrives late
 * plays as a shorter hold and still settles before `answerable_at`.
 */

/** The host fades out and the scroll slides over in 250 ms; the NPC is in 400 ms in. */
export const ENTRANCE_MS = 400
/** Where the typing starts when the hold leaves room for it. */
export const TYPE_FROM_MS = 900
/** Nothing moves for this long before the answers appear. */
export const SETTLE_MS = 200
export const LETTERS_PER_SECOND = 60
/** Between the intro and the question: room to read the one before the next begins. */
export const PAUSE_MIN_MS = 1000
export const PAUSE_MAX_MS = 2000
/** The return mirrors the entrance in the reveal's last 250 ms. */
export const RETURN_MS = 250
/** A reveal skipped before its return has played cross-fades into what follows. */
export const CROSSFADE_MS = 200

/** When one line types, and for how long. */
export interface Typing {
  from: number
  for: number
}

export interface Interlude {
  /** Play the entrance, rather than start with the NPC in place. */
  enter: boolean
  /** One per line, in order; a line with none shows whole from the first frame. */
  lines: Typing[]
}

/** The NPC in place and every line whole: a reconnect, a reveal, reduced motion. */
export const SETTLED: Interlude = { enter: false, lines: [] }

/**
 * The interlude for a hold of `holdMs` and lines of `letters` each, typed in order.
 *
 * Typing ends `SETTLE_MS` before the answers at the latest. It starts at 900 ms, or sooner
 * when the lines would not fit at 60 a second with the shortest pause, but never before the
 * entrance is over. Time to spare lengthens the pauses up to their longest and is then left
 * at the end, settled. Lines that still do not fit type faster, pauses shortened alike. A
 * hold with no room for the entrance and the settle is no interlude at all.
 */
export function interludeFor(holdMs: number, letters: number[]): Interlude {
  const end = holdMs - SETTLE_MS
  if (!(end >= ENTRANCE_MS)) return SETTLED
  const natural = letters.map((count) => (count * 1000) / LETTERS_PER_SECOND)
  const gaps = Math.max(0, letters.length - 1)
  const needed = natural.reduce((sum, ms) => sum + ms, 0) + gaps * PAUSE_MIN_MS
  const start = Math.max(ENTRANCE_MS, Math.min(TYPE_FROM_MS, end - needed))
  const room = end - start
  const fits = room >= needed
  const scale = fits || needed === 0 ? 1 : room / needed
  const pause = fits
    ? gaps === 0
      ? 0
      : Math.min(PAUSE_MAX_MS, PAUSE_MIN_MS + (room - needed) / gaps)
    : PAUSE_MIN_MS * scale
  const lines: Typing[] = []
  let at = start
  for (const ms of natural) {
    lines.push({ from: at, for: ms * scale })
    at += ms * scale + pause
  }
  return { enter: true, lines }
}

/** How many of a line's `letters` show `elapsed` ms in, by its `typing`; all with none. */
export function typedAt(typing: Typing | undefined, letters: number, elapsed: number): number {
  if (typing === undefined || typing.for <= 0) return letters
  // A hair over, so the letter due at a timer's exact moment is typed by that timer.
  const done = ((elapsed - typing.from) * letters) / typing.for
  return Math.max(0, Math.min(letters, Math.floor(done + 1e-6)))
}

/** Whether the viewer asked for reduced motion; false where nobody can say. */
export function reducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
