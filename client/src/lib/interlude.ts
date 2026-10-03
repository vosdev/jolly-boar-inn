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
/** Where the prompt starts typing when the hold leaves room for it. */
export const TYPE_FROM_MS = 900
/** Nothing moves for this long before the answers appear. */
export const SETTLE_MS = 200
export const LETTERS_PER_SECOND = 60
/** The return mirrors the entrance in the reveal's last 250 ms. */
export const RETURN_MS = 250
/** A reveal skipped before its return has played cross-fades into what follows. */
export const CROSSFADE_MS = 200

export interface Interlude {
  /** Play the entrance, rather than start with the NPC in place. */
  enter: boolean
  /** When the prompt starts typing. */
  typeFrom: number
  /** How long it types for; 0 shows it whole from the first frame. */
  typeFor: number
}

/** The NPC in place and the prompt whole: a reconnect, a reveal, reduced motion. */
export const SETTLED: Interlude = { enter: false, typeFrom: 0, typeFor: 0 }

/**
 * The interlude for a hold of `holdMs` and a prompt of `letters`.
 *
 * Typing ends `SETTLE_MS` before the answers. It starts at 900 ms, or sooner when the
 * prompt would not fit at 60 a second, but never before the entrance is over, and a
 * prompt that still does not fit types faster. A hold with no room for the entrance and
 * the settle is no interlude at all.
 */
export function interludeFor(holdMs: number, letters: number): Interlude {
  const end = holdMs - SETTLE_MS
  if (!(end >= ENTRANCE_MS)) return SETTLED
  const natural = (letters * 1000) / LETTERS_PER_SECOND
  const typeFrom = Math.max(ENTRANCE_MS, Math.min(TYPE_FROM_MS, end - natural))
  return { enter: true, typeFrom, typeFor: Math.min(natural, end - typeFrom) }
}

/** How many of `letters` show `elapsed` ms into `interlude`. */
export function typedAt(interlude: Interlude, letters: number, elapsed: number): number {
  if (interlude.typeFor <= 0) return letters
  // A hair over, so the letter due at a timer's exact moment is typed by that timer.
  const done = ((elapsed - interlude.typeFrom) * letters) / interlude.typeFor
  return Math.max(0, Math.min(letters, Math.floor(done + 1e-6)))
}

/** Whether the viewer asked for reduced motion; false where nobody can say. */
export function reducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
