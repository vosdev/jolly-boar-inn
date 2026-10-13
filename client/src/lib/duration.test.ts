import { describe, expect, it } from 'vitest'

import { NAMES_SECONDS, SPLASH_SECONDS, minutes, plannedSeconds } from './duration'

describe('plannedSeconds', () => {
  it('adds the rounds, the events, a splash per round and standings between rounds', () => {
    const rounds = [
      { questions: 5, seconds: 15 },
      { questions: 3, seconds: 20 },
    ]
    expect(plannedSeconds(rounds, 2, 25, 10)).toBe(75 + 60 + 50 + 2 * SPLASH_SECONDS + 10)
  })

  it('has no standings for a single round, and nothing for none', () => {
    expect(plannedSeconds([{ questions: 4, seconds: 10 }], 0, 0, 30)).toBe(40 + SPLASH_SECONDS)
    expect(plannedSeconds([], 0, 0, 10)).toBe(0)
  })

  it('holds every question and event a second longer when the names are on', () => {
    const rounds = [{ questions: 5, seconds: 15 }]
    const plain = plannedSeconds(rounds, 2, 25, 10)
    expect(plannedSeconds(rounds, 2, 25, 10, true)).toBe(plain + 7 * NAMES_SECONDS)
  })
})

describe('minutes', () => {
  it('rounds to the nearest minute, never under one', () => {
    expect(minutes(0)).toBe('~1 min')
    expect(minutes(89)).toBe('~1 min')
    expect(minutes(90)).toBe('~2 min')
    expect(minutes(1290)).toBe('~22 min')
  })
})
