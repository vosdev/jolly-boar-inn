/** The Stats view's arithmetic: each band edge's suggestion, the thresholds, the sorts. */

import { describe, expect, it } from 'vitest'

import {
  band,
  distance,
  ranOut,
  scored,
  statsRows,
  suggestion,
  type QuestionStats,
  type StatsFilter,
} from './questionStats'
import type { PackQuestion } from './reports'
import type { QuestionDifficulty } from './suggestions'

function row(
  share: number,
  over: Partial<QuestionStats> = {},
  question: Partial<PackQuestion> = {},
): QuestionStats {
  return {
    question: {
      id: `q_${share}`,
      type: 'free_text',
      mode: 'bestiary',
      payload: { prompt: 'Who?', answer: 'Jad' },
      difficulty: 'medium',
      ...question,
    },
    answers: 100,
    credit_sum: share,
    correct: share,
    unanswered: 0,
    games: 10,
    ...over,
  }
}

const ALL: StatsFilter = { mode: '', tier: '', onlySuggestions: false }

describe('suggestion', () => {
  // [tier, share, suggested] for a type without choices on screen, then with them.
  const typed: [QuestionDifficulty, number, QuestionDifficulty | null][] = [
    ['easy', 100, null],
    ['easy', 55, null],
    ['easy', 54, 'medium'],
    ['easy', 30, 'medium'],
    ['easy', 29, 'hard'],
    ['medium', 80, null],
    ['medium', 81, 'easy'],
    ['medium', 30, null],
    ['medium', 29, 'hard'],
    ['hard', 0, null],
    ['hard', 60, null],
    ['hard', 61, 'medium'],
    ['hard', 80, 'medium'],
    ['hard', 81, 'easy'],
  ]
  const choices: [QuestionDifficulty, number, QuestionDifficulty | null][] = [
    ['easy', 65, null],
    ['easy', 64, 'medium'],
    ['easy', 40, 'medium'],
    ['easy', 39, 'hard'],
    ['medium', 90, null],
    ['medium', 91, 'easy'],
    ['medium', 40, null],
    ['medium', 39, 'hard'],
    ['hard', 70, null],
    ['hard', 71, 'medium'],
    ['hard', 90, 'medium'],
    ['hard', 91, 'easy'],
  ]

  it.each(typed)('a typed %s question at %i%% suggests %s', (tier, share, want) => {
    expect(suggestion(row(share, {}, { difficulty: tier }))).toBe(want)
  })

  it.each(['multiple_choice', 'pick_all_that_apply', 'ordering', 'matching'])(
    'a %s question takes the bands 10 higher',
    (type) => {
      for (const [tier, share, want] of choices) {
        expect(suggestion(row(share, {}, { difficulty: tier, type })), `${tier} ${share}`).toBe(
          want,
        )
      }
    },
  )

  it('compares the whole percent the table shows', () => {
    expect(scored(row(54.6))).toBe(55)
    expect(suggestion(row(54.6, {}, { difficulty: 'easy' }))).toBeNull()
  })

  it('suggests nothing under 20 answers or 3 games', () => {
    const easy = { difficulty: 'easy' as const }
    expect(suggestion(row(10, { answers: 20, credit_sum: 2, games: 3 }, easy))).toBe('hard')
    expect(suggestion(row(10, { answers: 19, credit_sum: 1.9, games: 3 }, easy))).toBeNull()
    expect(suggestion(row(10, { answers: 20, credit_sum: 2, games: 2 }, easy))).toBeNull()
  })

  it('suggests nothing for a question without a tier or answers', () => {
    expect(band(row(10).question)).not.toBeNull()
    expect(suggestion(row(10, {}, { difficulty: undefined, mode: 'random_event' }))).toBeNull()
    expect(suggestion(row(0, { answers: 0, games: 0 }))).toBeNull()
  })
})

describe('ranOut', () => {
  it('is the share of players who did not answer, and null with none', () => {
    expect(ranOut(row(50, { answers: 70, unanswered: 30 }))).toBe(30)
    expect(ranOut(row(0, { answers: 0, unanswered: 0 }))).toBeNull()
  })
})

describe('statsRows', () => {
  const far = row(5)
  const near = row(25)
  const fits = row(50)
  const few = row(5, { answers: 10, credit_sum: 0.5 })
  const easy = row(90, {}, { difficulty: 'easy', mode: 'odd_one_out', id: 'q_easy' })
  const rows = [fits, few, near, easy, far]

  it('puts the furthest from its band first and those it says nothing about last', () => {
    expect(distance(far)).toBe(25)
    expect(distance(few)).toBe(0)
    expect(statsRows(rows, ALL, 'band')).toEqual([far, near, fits, easy, few])
  })

  it('filters by round, tier and suggestions', () => {
    expect(statsRows(rows, { ...ALL, mode: 'odd_one_out' }, 'band')).toEqual([easy])
    expect(statsRows(rows, { ...ALL, tier: 'easy' }, 'band')).toEqual([easy])
    expect(statsRows(rows, { ...ALL, onlySuggestions: true }, 'band')).toEqual([far, near])
  })

  it('sorts by scored either way with unplayed questions last', () => {
    const unplayed = row(0, { answers: 0, games: 0 })
    expect(statsRows([fits, unplayed, far], ALL, 'low')).toEqual([far, fits, unplayed])
    expect(statsRows([far, unplayed, fits], ALL, 'high')).toEqual([fits, far, unplayed])
  })

  it('sorts by no answer and by answers, most first', () => {
    const late = row(50, { unanswered: 60 })
    expect(statsRows([fits, late], ALL, 'ran_out')).toEqual([late, fits])
    expect(statsRows([few, fits], ALL, 'answers')).toEqual([fits, few])
  })
})
