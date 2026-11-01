import { describe, expect, it } from 'vitest'

import { whereOf } from './barWhere'

const SEGMENT = { mode: 'more_less', index: 0, total: 3, start: 0, count: 5 }

describe('whereOf', () => {
  it('names the round and its mode on the splash, a question and its reveal', () => {
    for (const phase of ['splash', 'open', 'reveal']) {
      expect(whereOf('playing', phase, SEGMENT)).toEqual({
        lead: 'Round 1 of 3:',
        mode: 'More or Less',
      })
    }
  })

  it('counts questions in a daily, whose rounds are one each', () => {
    const third = { mode: 'more_less', index: 2, total: 10, start: 2, count: 1 }
    for (const phase of ['open', 'reveal']) {
      expect(whereOf('playing', phase, third, true)).toEqual({
        lead: 'Question 3 of 10:',
        mode: 'More or Less',
      })
    }
  })

  it('says Lobby in the lobby', () => {
    expect(whereOf('lobby', 'idle', null)).toEqual({ lead: 'Lobby', mode: null })
  })

  it('names the round the hiscores come after', () => {
    expect(whereOf('playing', 'standings', { ...SEGMENT, index: 1 })).toEqual({
      lead: 'Hiscores after round 2 of 3',
      mode: null,
    })
  })

  it('says the final hiscores once the game is over', () => {
    expect(whereOf('finished', 'idle', SEGMENT)).toEqual({ lead: 'Final hiscores', mode: null })
  })

  it('says nothing while playing with no round known', () => {
    expect(whereOf('playing', 'open', null)).toBeNull()
  })
})
