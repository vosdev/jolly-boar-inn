/**
 * A logarithmic slider between two whole numbers: the client's half of
 * `questions/types/slider.py`, which must agree with it on the grid or a player could drag
 * to a value the server refuses.
 *
 * Positions are the numbers with at most three significant figures, so every two-figure
 * price is reachable exactly. The track is logarithmic, so a step from 110k to 120k is as
 * wide as one from 1.1M to 1.2M; the keyboard steps one grid value at a time.
 */

export const FIGURES = 3
export const ANSWER_FIGURES = 2
/** How far past the answer's band, as a share of the width, credit reaches 0. */
export const REACH = 0.25

/** The grid's spacing at `value`: 1 below `figures` digits, else a power of ten. */
export function sigStep(value: number, figures: number = FIGURES): number {
  return 10 ** Math.max(0, String(Math.trunc(value)).length - figures)
}

/** `value` to `figures` significant figures, half up. */
export function roundSig(value: number, figures: number = FIGURES): number {
  const step = sigStep(value, figures)
  return Math.floor((value + Math.floor(step / 2)) / step) * step
}

/** Where `value` sits on the track, 0 at `low` and 1 at `high`. */
export function position(value: number, low: number, high: number): number {
  return Math.log(value / low) / Math.log(high / low)
}

/** The grid value nearest the track's `fraction` (0 to 1), kept within the ends. */
export function valueAt(fraction: number, low: number, high: number): number {
  const exact = low * (high / low) ** Math.min(1, Math.max(0, fraction))
  return Math.min(high, Math.max(low, roundSig(Math.round(exact))))
}

/** Where the slider starts: the middle of the track. */
export function middle(low: number, high: number): number {
  return valueAt(0.5, low, high)
}

/** The grid value `steps` positions from `value`, stopping at the ends. */
export function stepFrom(value: number, steps: number, low: number, high: number): number {
  let current = value
  for (let i = 0; i < Math.abs(steps); i++) {
    if (steps > 0) {
      if (current >= high) return high
      current = Math.min(high, current + sigStep(current))
    } else {
      if (current <= low) return low
      // Just above a power of ten the grid below is ten times finer.
      current = Math.max(low, current - sigStep(current - 1))
    }
  }
  return current
}
