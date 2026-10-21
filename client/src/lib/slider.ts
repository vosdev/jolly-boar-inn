/**
 * A slider between two whole numbers: the client's half of `questions/types/slider.py`,
 * which must agree with it on the grid or a player could drag to a value the server refuses.
 *
 * A `linear` track stops on every whole number. On a `log` one, positions are the numbers
 * with at most three significant figures, so every two-figure price is reachable exactly,
 * and a step from 110k to 120k is as wide as one from 1.1M to 1.2M. The keyboard steps one
 * grid value at a time.
 */

export type Scale = 'linear' | 'log'

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

/** Whether the slider can stop on `value`: any whole number on a linear track. */
export function onTrack(value: number, scale: Scale = 'log'): boolean {
  return scale === 'linear' || value === roundSig(value)
}

/** Where `value` sits on the track, 0 at `low` and 1 at `high`. */
export function position(value: number, low: number, high: number, scale: Scale = 'log'): number {
  if (scale === 'linear') return (value - low) / (high - low)
  return Math.log(value / low) / Math.log(high / low)
}

/** The grid value nearest the track's `fraction` (0 to 1), kept within the ends. */
export function valueAt(fraction: number, low: number, high: number, scale: Scale = 'log'): number {
  const along = Math.min(1, Math.max(0, fraction))
  if (scale === 'linear') return Math.round(low + (high - low) * along)
  const exact = low * (high / low) ** along
  return Math.min(high, Math.max(low, roundSig(Math.round(exact))))
}

/** Where the slider starts: the middle of the track, a half rounded up. */
export function middle(low: number, high: number, scale: Scale = 'log'): number {
  if (scale === 'linear') return Math.floor((low + high + 1) / 2)
  return valueAt(0.5, low, high)
}

/** How many steps PageUp and PageDown take: ten on a log track, a twentieth of a linear one. */
export function pageSteps(low: number, high: number, scale: Scale = 'log'): number {
  return scale === 'linear' ? Math.max(1, Math.round((high - low) / 20)) : 10
}

/** The scale a new slider gets: log once the range spans a factor of 20. */
export function defaultScale(low: number, high: number): Scale {
  return low >= 1 && high >= 20 * low ? 'log' : 'linear'
}

/** The grid value `steps` positions from `value`, stopping at the ends. */
export function stepFrom(
  value: number,
  steps: number,
  low: number,
  high: number,
  scale: Scale = 'log',
): number {
  if (scale === 'linear') return Math.min(high, Math.max(low, value + steps))
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
