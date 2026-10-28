/** The admin history: ranges, empty days, moving lines, headline figures and modes ranked. */

import { describe, expect, it } from 'vitest'

import type { Count } from './admin'
import {
  breakdown,
  headline,
  joinFunnel,
  modeRanking,
  rangeDays,
  roundLengths,
  series,
  total,
} from './adminCharts'

const TODAY = '2026-10-01'

function count(day: string, metric: string, n: number, key = ''): Count {
  return { day, metric, key, count: n }
}

describe('rangeDays', () => {
  it('ends today and fills days nothing happened on', () => {
    const days = rangeDays([], '30', TODAY)
    expect(days).toHaveLength(30)
    expect(days[0]).toBe('2026-09-02')
    expect(days.at(-1)).toBe(TODAY)
  })

  it('goes back to the first counter for all of it', () => {
    const days = rangeDays([count('2026-09-28', 'games_started', 1)], 'all', TODAY)
    expect(days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', TODAY])
  })
})

describe('series', () => {
  it('is a value a day up to 90 days, one list per metric asked for', () => {
    const counts = [
      count('2026-09-30', 'games_finished', 3),
      count('2026-09-30', 'games_ended_early', 1),
      count('2026-10-01', 'games_finished', 2),
      count('2026-10-01', 'rooms_created', 7),
      count('2026-06-01', 'games_finished', 50),
    ]
    const chart = series(counts, '90', TODAY, ['games_finished', 'games_ended_early'])
    expect(chart.smoothed).toBe(false)
    expect(chart.days).toHaveLength(90)
    expect(chart.days.at(-1)).toBe(TODAY)
    expect(chart.values[0]?.slice(-2)).toEqual([3, 2])
    expect(chart.values[1]?.slice(-2)).toEqual([1, 0])
    expect(chart.values[0]?.reduce((a, b) => a + b, 0)).toBe(5)
  })

  it('is a 7-day moving mean past 90 days, over fewer days at the start', () => {
    const counts = [count('2025-10-02', 'games_finished', 7), count(TODAY, 'games_finished', 14)]
    const chart = series(counts, '365', TODAY, ['games_finished'])
    expect(chart.smoothed).toBe(true)
    expect(chart.days).toHaveLength(365)
    const values = chart.values[0]!
    expect(values[0]).toBe(7)
    expect(values[1]).toBe(3.5)
    expect(values[7]).toBe(0)
    expect(values.at(-1)).toBe(2)
  })
})

describe('headline', () => {
  const counts = [
    // A day too early for the previous period, which is 2026-08-02 to 2026-08-31.
    count('2026-08-01', 'games_started', 50),
    count('2026-08-02', 'games_started', 4),
    count('2026-08-31', 'games_finished', 1),
    count('2026-08-31', 'games_abandoned', 1),
    count('2026-08-31', 'players_joined', 10),
    count('2026-08-31', 'players_returning', 5),
    // The range, 2026-09-01 to yesterday.
    count('2026-09-01', 'games_started', 2),
    count('2026-09-30', 'games_started', 3),
    count('2026-09-30', 'games_finished', 3),
    count('2026-09-30', 'games_ended_early', 1),
    count('2026-09-30', 'players_joined', 20),
    count('2026-09-30', 'players_returning', 4),
    // Today, partial, and left out.
    count(TODAY, 'games_started', 100),
    count(TODAY, 'games_finished', 100),
  ]

  it('sums whole days up to yesterday and compares them with as many days just before', () => {
    const figures = headline(counts, '30', TODAY)
    expect(figures.days).toBe(30)
    expect(figures.compared).toBe(true)
    expect(figures.games).toEqual({ value: 5, previous: 4, change: 0.25 })
    expect(figures.players).toEqual({ value: 20, previous: 10, change: 1 })
    expect(figures.finishRate).toEqual({ value: 0.75, previous: 0.5, change: 0.25 })
    expect(figures.returnRate.value).toBe(0.2)
    expect(figures.returnRate.change).toBeCloseTo(-0.3)
  })

  it('has no rate and no change where there was nothing to divide by', () => {
    const figures = headline([count(TODAY, 'games_started', 2)], '30', TODAY)
    expect(figures.games).toEqual({ value: 0, previous: 0, change: null })
    expect(figures.finishRate).toEqual({ value: null, previous: null, change: null })
    expect(figures.returnRate).toEqual({ value: null, previous: null, change: null })
  })

  it('compares nothing over all of it', () => {
    const figures = headline(counts, 'all', TODAY)
    expect(figures.compared).toBe(false)
    expect(figures.days).toBe(61)
    expect(figures.games).toEqual({ value: 59, previous: null, change: null })
    expect(figures.finishRate.change).toBeNull()
  })
})

describe('joinFunnel', () => {
  it('counts joins that are not a host with their room, and every failure, as attempts', () => {
    const counts = [
      count('2026-09-30', 'players_joined', 12),
      count('2026-09-30', 'rooms_created', 2),
      count('2026-09-30', 'join_failures', 3, 'name_taken'),
      count('2026-09-30', 'join_failures', 1, 'not_found'),
      count('2026-09-30', 'join_failures', 2, 'room_full'),
      count('2026-09-30', 'join_failures', 1, 'requests_full'),
      count('2026-09-30', 'join_failures', 1, 'request_denied'),
    ]
    expect(joinFunnel(counts, '30', TODAY)).toEqual({
      attempts: 18,
      failed: { player: 4, ours: 3, host: 1 },
    })
  })

  it('is no attempts at all in an empty range', () => {
    expect(joinFunnel([], '30', TODAY)).toEqual({
      attempts: 0,
      failed: { player: 0, ours: 0, host: 0 },
    })
  })
})

describe('roundLengths', () => {
  it('splits each mode by length bucket, most rounds first', () => {
    const counts = [
      count(TODAY, 'round_durations', 1, 'more_less/0-2'),
      count(TODAY, 'round_durations', 2, 'more_less/5-10'),
      count(TODAY, 'round_durations', 4, 'price_is_right/10+'),
      count(TODAY, 'rounds_finished', 9, 'more_less'),
    ]
    expect(roundLengths(counts, '30', TODAY)).toEqual([
      { key: 'price_is_right', values: [0, 0, 0, 4], total: 4 },
      { key: 'more_less', values: [1, 0, 2, 0], total: 3 },
    ])
  })
})

describe('modeRanking', () => {
  it('ranks modes by rounds started in the range', () => {
    const counts = [
      count('2026-09-30', 'rounds_started', 2, 'more_less'),
      count('2026-09-30', 'rounds_finished', 1, 'more_less'),
      count('2026-09-30', 'rounds_started', 5, 'guess_examine'),
      count('2026-09-30', 'rounds_finished', 5, 'guess_examine'),
      count('2026-09-30', 'rounds_abandoned', 9, 'price_is_right'),
      count('2025-01-01', 'rounds_started', 99, 'more_less'),
    ]
    expect(modeRanking(counts, '30', TODAY)).toEqual([
      { mode: 'guess_examine', started: 5, finished: 5 },
      { mode: 'more_less', started: 2, finished: 1 },
    ])
    expect(modeRanking(counts, 'all', TODAY)[0]).toEqual({
      mode: 'more_less',
      started: 101,
      finished: 1,
    })
  })
})

describe('breakdown', () => {
  const closes = ['questions_all_answered', 'questions_timed_out', 'questions_skipped']

  it('splits each key by metric over the range, biggest first', () => {
    const counts = [
      count('2026-09-30', 'questions_all_answered', 4, 'more_less'),
      count('2026-10-01', 'questions_timed_out', 1, 'more_less'),
      count('2026-10-01', 'questions_skipped', 6, 'guess_examine'),
      count('2026-10-01', 'questions_timed_out', 3, 'guess_examine'),
      count('2026-10-01', 'rounds_started', 9, 'guess_examine'),
      count('2026-06-01', 'questions_all_answered', 50, 'odd_one_out'),
    ]
    expect(breakdown(counts, '30', TODAY, closes)).toEqual([
      { key: 'guess_examine', values: [0, 3, 6], total: 9 },
      { key: 'more_less', values: [4, 1, 0], total: 5 },
    ])
  })

  it('keeps an order of its own when it is given one', () => {
    const counts = [
      count('2026-10-01', 'game_durations', 9, '10-20'),
      count('2026-10-01', 'game_durations', 1, '60+'),
      count('2026-10-01', 'game_durations', 2, '0-10'),
    ]
    const keys = breakdown(counts, '30', TODAY, ['game_durations'], ['0-10', '10-20', '60+'])
    expect(keys.map((row) => row.key)).toEqual(['0-10', '10-20', '60+'])
  })
})

describe('total', () => {
  it('sums one metric over the range, every key together', () => {
    const counts = [
      count('2026-10-01', 'games_with_custom', 2),
      count('2026-09-30', 'games_with_custom', 1),
      count('2026-06-01', 'games_with_custom', 7),
      count('2026-10-01', 'custom_questions', 5, 'free_text'),
    ]
    expect(total(counts, '30', TODAY, 'games_with_custom')).toBe(3)
  })
})
