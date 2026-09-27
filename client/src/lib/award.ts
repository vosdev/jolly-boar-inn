/**
 * What the clue scroll pins on the sheet for our answer (section 8 of ideas/design.md).
 *
 * Any answer worth points earns the ribbon: right, partial credit or a graded guess. Only
 * full credit throws confetti as well, so a near miss is marked without being celebrated
 * like a hit. `+0`, and no answer at all, get nothing.
 */

import type { PlayerResult } from './protocol'

export type Award = 'none' | 'ribbon' | 'confetti'

/** The award for our row of `question_closed.results`, or for no row. */
export function awardFor(result: PlayerResult | null): Award {
  if (result === null || result.points <= 0) return 'none'
  return result.correct ? 'confetti' : 'ribbon'
}
