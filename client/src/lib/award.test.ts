/** What the scroll pins for an answer: any points earn the ribbon, full credit confetti too. */

import { describe, expect, it } from 'vitest'

import { awardFor } from './award'

describe('awardFor', () => {
  it('throws confetti for full credit', () => {
    expect(awardFor({ value: 0, correct: true, credit: 1, points: 850 })).toBe('confetti')
  })

  it('pins the ribbon alone on partial credit or a graded guess that scored', () => {
    expect(awardFor({ value: 'Zezma', correct: false, credit: 0.9, points: 400 })).toBe('ribbon')
    expect(awardFor({ value: 120, correct: false, credit: 0.3, points: 1 })).toBe('ribbon')
  })

  it('gives +0 and no answer nothing', () => {
    expect(awardFor({ value: 1, correct: false, credit: 0, points: 0 })).toBe('none')
    expect(awardFor(null)).toBe('none')
  })
})
