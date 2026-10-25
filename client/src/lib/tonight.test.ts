import { describe, expect, it } from 'vitest'

import { tonight, type Night } from './tonight'

const MODES = ['more_less', 'bestiary', 'drop_table', 'sort_it_out'].map((mode) => ({
  mode,
  questions: 5,
}))
const night = (patch: Partial<Night> = {}): Night => ({
  index: 1,
  total: 4,
  mode: 'bestiary',
  modes: MODES,
  modeOrder: 'listed',
  ...patch,
})

describe('tonight', () => {
  it('names every round’s host when the rounds play in the order listed', () => {
    expect(tonight(night(), 12)).toEqual({
      stops: [
        { index: 0, mode: 'more_less', state: 'done' },
        { index: 1, mode: 'bestiary', state: 'now' },
        { index: 2, mode: 'drop_table', state: 'next' },
        { index: 3, mode: 'sort_it_out', state: 'next' },
      ],
      before: 0,
      after: 0,
    })
  })

  it.each([
    ['shuffled', { modeOrder: 'random' as const }],
    ['hidden', { hidden: true }],
  ])('shows only the current host when the rounds are %s', (_, patch) => {
    expect(tonight(night(patch), 12).stops.map((stop) => stop.mode)).toEqual([
      null,
      'bestiary',
      null,
      null,
    ])
  })

  it.each([
    ['shuffled', { modeOrder: 'random' as const }],
    ['hidden', { hidden: true }],
  ])('names the hosts of the rounds played when the rounds are %s', (_, patch) => {
    const third = night({
      ...patch,
      index: 2,
      mode: 'drop_table',
      played: ['sort_it_out', 'bestiary'],
    })
    expect(tonight(third, 12).stops.map((stop) => stop.mode)).toEqual([
      'sort_it_out',
      'bestiary',
      'drop_table',
      null,
    ])
  })

  it('keeps ten rounds in one window, and slides twenty to keep the current one in view', () => {
    expect(tonight(night({ index: 9, total: 10, modes: undefined }), 12).stops).toHaveLength(10)
    const far = tonight(night({ index: 15, total: 20, modes: undefined }), 12)
    expect(far.stops.map((stop) => stop.index)).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ])
    expect([far.before, far.after]).toEqual([8, 0])
    const middle = tonight(night({ index: 10, total: 20, modes: undefined }), 5)
    expect(middle.stops.map((stop) => stop.index)).toEqual([8, 9, 10, 11, 12])
    expect([middle.before, middle.after]).toEqual([8, 7])
  })
})
