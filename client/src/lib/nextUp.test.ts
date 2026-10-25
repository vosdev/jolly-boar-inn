import { describe, expect, it } from 'vitest'

import { nextInLine, nextRoundLine, nextUp } from './nextUp'

const round = { start: 3, count: 3 }

describe('nextUp', () => {
  it('is the next question inside a round', () => {
    expect(nextUp({ index: 3, total: 9, segment: round }, true)).toBe('Next question')
    expect(nextUp({ index: 4, total: 9, segment: round }, true)).toBe('Next question')
  })

  it('is the standings after a round’s last, or the next round with them off', () => {
    expect(nextUp({ index: 5, total: 9, segment: round }, true)).toBe('Standings')
    expect(nextUp({ index: 5, total: 9, segment: round }, false)).toBe('Next round')
  })

  it('is the final standings after the game’s last', () => {
    expect(nextUp({ index: 8, total: 9, segment: { start: 6, count: 3 } }, true)).toBe(
      'Final standings',
    )
  })
})

describe('nextInLine', () => {
  it('counts in whole seconds, one of them singular', () => {
    expect(nextInLine('Next question', 6)).toBe('Next question in 6 seconds')
    expect(nextInLine('Standings', 1)).toBe('Standings in 1 second')
  })
})

describe('nextRoundLine', () => {
  it('says which round is next and how many questions it holds', () => {
    const next = { mode: 'more_less', index: 2, total: 3, start: 10, count: 5 }
    expect(nextRoundLine(next)).toBe('Round 3 of 3, 5 questions')
    expect(nextRoundLine({ ...next, count: 1 })).toBe('Round 3 of 3, 1 question')
  })
})
