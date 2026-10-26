/**
 * What a reveal hands over to, for the timer bar's tab (section 10 of ideas/design.md):
 * the next question, or after a round's last the standings (the next round, with them
 * off), and after the game's last the final standings. And the round the
 * standings hand over to, for their "Next up" (section 11).
 */

import type { Segment } from './protocol'

export interface Placed {
  index: number
  total: number
  segment: { start: number; count: number }
}

/** What a reveal can hand over to. */
export type Next = 'Next question' | 'Standings' | 'Next round' | 'Final standings'

/** What comes after the reveal of `question`. */
export function nextUp(question: Placed, standings: boolean): Next {
  if (question.index + 1 >= question.total) return 'Final standings'
  const { start, count } = question.segment
  if (question.index !== start + count - 1) return 'Next question'
  return standings ? 'Standings' : 'Next round'
}

/** `nextUp`'s words cut to fit the timer bar's tab: "Next", "Standings" or "Final". */
export function nextTab(what: Next): string {
  if (what === 'Final standings') return 'Final'
  return what === 'Standings' ? 'Standings' : 'Next'
}

/** The standings' "Next up" line under the round's name: "Round 3 of 3, 5 questions". */
export function nextRoundLine(segment: Segment): string {
  const questions = `${segment.count} ${segment.count === 1 ? 'question' : 'questions'}`
  return `Round ${segment.index + 1} of ${segment.total}, ${questions}`
}
