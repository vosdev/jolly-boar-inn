/**
 * What the stage pins on the sheet for our answer (section 8 of ideas/design.md).
 *
 * Any answer worth points earns a pin: right, partial credit or a graded guess. Only full
 * credit throws confetti as well, so a near miss is marked without being celebrated like a
 * hit. `+0`, and no answer at all, get nothing. The pin is a rosette in the theme's colours.
 */

import type { Verdict } from './modes'
import type { PlayerResult } from './protocol'

export interface Award {
  kind: 'none' | 'pin' | 'confetti'
  points: number
}

export const NO_AWARD: Award = { kind: 'none', points: 0 }

/** The award for our row of `question_closed.results`, or for no row. */
export function awardFor(result: PlayerResult | null): Award {
  if (result === null || result.points <= 0) return NO_AWARD
  return { kind: result.correct ? 'confetti' : 'pin', points: result.points }
}

/**
 * How our row of `question_closed.results` did, for the host to react to; null when the
 * question was never ours to answer. Partial credit is any points short of right.
 */
export function verdictFor(result: PlayerResult | null, canAnswer: boolean): Verdict | null {
  if (!canAnswer) return null
  if (result === null) return 'missed'
  if (result.correct) return 'right'
  return result.points > 0 ? 'partial' : 'wrong'
}

/** The mark at the rosette's heart. */
export type Pin = 'star' | 'skull'

/** The mark `theme`'s rosette carries: the Wilderness's skull, else the inn's star. */
export function pinFor(theme: string): Pin {
  return theme === 'wilderness' ? 'skull' : 'star'
}
