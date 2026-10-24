/**
 * What a reveal hands over to, for the host's countdown in its bubble (section 10 of
 * ideas/design.md): the next question, or after a round's last the standings (the next
 * round, with them off), and after the game's last the final standings.
 */

export interface Placed {
  index: number
  total: number
  segment: { start: number; count: number }
}

/** What comes after the reveal of `question`. */
export function nextUp(question: Placed, standings: boolean): string {
  if (question.index + 1 >= question.total) return 'Final standings'
  const { start, count } = question.segment
  if (question.index !== start + count - 1) return 'Next question'
  return standings ? 'Standings' : 'Next round'
}

/** "Next question in 6 seconds". */
export function nextInLine(what: string, seconds: number): string {
  return `${what} in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}
