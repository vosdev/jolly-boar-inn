/** What the sheet pins for an answer: any points earn a pin, full credit confetti too, and the theme picks the rosette's mark. */

import { describe, expect, it } from 'vitest'

import { NO_AWARD, awardFor, pinFor, verdictFor } from './award'

describe('awardFor', () => {
  it('throws confetti for full credit', () => {
    expect(
      awardFor({
        value: 0,
        correct: true,
        credit: 1,
        points: 850,
        item_points: 0,
        item: null,
        by_book: false,
      }),
    ).toEqual({
      kind: 'confetti',
      points: 850,
    })
  })

  it('pins alone on partial credit or a graded guess that scored', () => {
    expect(
      awardFor({
        value: 'Zezma',
        correct: false,
        credit: 0.9,
        points: 400,
        item_points: 0,
        item: null,
        by_book: false,
      }),
    ).toEqual({
      kind: 'pin',
      points: 400,
    })
    expect(
      awardFor({
        value: 120,
        correct: false,
        credit: 0.3,
        points: 1,
        item_points: 0,
        item: null,
        by_book: false,
      }),
    ).toEqual({
      kind: 'pin',
      points: 1,
    })
  })

  it('gives +0 and no answer nothing', () => {
    expect(
      awardFor({
        value: 1,
        correct: false,
        credit: 0,
        points: 0,
        item_points: 0,
        item: null,
        by_book: false,
      }),
    ).toBe(NO_AWARD)
    expect(awardFor(null)).toBe(NO_AWARD)
  })
})

describe('pinFor', () => {
  it('pins the star rosette in every theme but the Wilderness, and in one it does not know', () => {
    for (const theme of ['jolly', 'party_room', 'zanaris', 'tzhaar', '', 'from_a_newer_build']) {
      expect(pinFor(theme)).toBe('star')
    }
  })

  it('pins the skull rosette in the Wilderness', () => {
    expect(pinFor('wilderness')).toBe('skull')
  })
})

describe('verdictFor', () => {
  it('calls full credit right, some points partial, none wrong and no answer missed', () => {
    expect(
      verdictFor(
        {
          value: 0,
          correct: true,
          credit: 1,
          points: 850,
          item_points: 0,
          item: null,
          by_book: false,
        },
        true,
      ),
    ).toBe('right')
    expect(
      verdictFor(
        {
          value: 0,
          correct: false,
          credit: 0.4,
          points: 340,
          item_points: 0,
          item: null,
          by_book: false,
        },
        true,
      ),
    ).toBe('partial')
    expect(
      verdictFor(
        {
          value: 0,
          correct: false,
          credit: 0,
          points: 0,
          item_points: 0,
          item: null,
          by_book: false,
        },
        true,
      ),
    ).toBe('wrong')
    expect(verdictFor(null, true)).toBe('missed')
  })

  it('has no verdict for somebody the question was never theirs to answer', () => {
    expect(verdictFor(null, false)).toBeNull()
  })
})
