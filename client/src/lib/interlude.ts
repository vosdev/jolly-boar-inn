/**
 * The timing of the scroll typing itself in: a random event's interlude (section 12 of
 * ideas/design.md), a round's question, and the splash, as numbers a test can check
 * without a stage. The server times each question's hold to the same numbers
 * (`server/app/rooms/hold.py`).
 *
 * Every time here is in ms from the moment the question took the stage. That is its
 * arrival rather than its `opened_at`, so a `question_open` that arrives late plays as a
 * shorter hold and still settles before `answerable_at`.
 */

/** The host fades out and the scroll slides over in 375 ms; the NPC is in 600 ms in. */
export const ENTRANCE_MS = 600
/** Where an event's typing starts when the hold leaves room for it. */
export const TYPE_FROM_MS = 900
/** Where a round's question starts typing, with no NPC to walk on first. */
export const QUESTION_TYPE_FROM_MS = 400
/** The splash types after a beat, or once the stage has come over if that is later. */
export const SPLASH_TYPE_FROM_MS = 300
/** Nothing moves for this long before the answers appear. */
export const SETTLE_MS = 200
export const LETTERS_PER_SECOND = 50
/**
 * Between the intro and the question: what is left of reading the intro once it has typed,
 * at a reading pace slower than the typing, and never less or more than these.
 */
export const PAUSE_MIN_MS = 500
export const PAUSE_MAX_MS = 1000
export const READ_LETTERS_PER_SECOND = 25
/**
 * The return, in the reveal's last `RETURN_MS`, one step at a time so nothing moves under a
 * fade: the NPC fades out, the scroll slides back, then the host fades in (`StageView`).
 */
export const RETURN_GUEST_OUT_MS = 225
export const RETURN_MOVE_MS = 375
export const RETURN_HOST_IN_MS = 300
export const RETURN_MS = RETURN_GUEST_OUT_MS + RETURN_MOVE_MS + RETURN_HOST_IN_MS

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
 * Typing ends `SETTLE_MS` before the answers at the latest. It starts at `from`, or sooner
 * when the lines would not fit at 50 a second with the shortest pauses, but never before
 * `earliest`, the end of an event's entrance. Each pause is what reading the line before
 * it still needs, so a short intro is not left hanging; time to spare is left at the end,
 * settled. Short of time, the pauses give way first, then the lines type faster, pauses
 * shortened alike. A hold with no room for the entrance and the settle is no interlude at
 * all. A hold of `Infinity` types at the natural pace from `from`, which is the splash's.
 */
export function interludeFor(
  holdMs: number,
  letters: number[],
  from = TYPE_FROM_MS,
  earliest = ENTRANCE_MS,
): Interlude {
  const end = holdMs - SETTLE_MS
  if (!(end >= earliest)) return SETTLED
  const natural = letters.map((count) => (count * 1000) / LETTERS_PER_SECOND)
  const typed = natural.reduce((sum, ms) => sum + ms, 0)
  const wanted = letters.slice(0, -1).map((count) => {
    const reading = count * (1000 / READ_LETTERS_PER_SECOND - 1000 / LETTERS_PER_SECOND)
    return Math.max(PAUSE_MIN_MS, Math.min(PAUSE_MAX_MS, reading))
  })
  const shortest = typed + wanted.length * PAUSE_MIN_MS
  const longest = typed + wanted.reduce((sum, ms) => sum + ms, 0)
  const start = Math.max(earliest, Math.min(from, end - shortest))
  const room = end - start
  // How much of each pause beyond the shortest there is room for, and how fast to type.
  const give = room >= longest ? 1 : room >= shortest ? (room - shortest) / (longest - shortest) : 0
  const scale = room >= shortest || shortest === 0 ? 1 : room / shortest
  const lines: Typing[] = []
  let at = start
  natural.forEach((ms, i) => {
    lines.push({ from: at, for: ms * scale })
    const pause = wanted[i] ?? 0
    at += ms * scale + (PAUSE_MIN_MS + (pause - PAUSE_MIN_MS) * give) * scale
  })
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
