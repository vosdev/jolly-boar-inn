/** The admin history: ranges, empty days, weeks, and modes ranked. */

import { describe, expect, it } from 'vitest'

import type { Count } from './admin'
import { buckets, modeRanking, rangeDays } from './adminCharts'

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

describe('buckets', () => {
  it('is a bar a day up to 90 days, counting each game by how it ended', () => {
    const counts = [
      count('2026-09-30', 'games_finished', 3),
      count('2026-09-30', 'games_ended_early', 1),
      count('2026-10-01', 'games_abandoned', 2),
      count('2026-10-01', 'players_joined', 9),
      count('2026-10-01', 'players_returning', 4),
      count('2026-10-01', 'rooms_created', 7),
      count('2026-06-01', 'games_finished', 50),
    ]
    const bars = buckets(counts, '90', TODAY)
    expect(bars).toHaveLength(90)
    expect(bars.every((b) => b.days === 1)).toBe(true)
    expect(bars.at(-2)).toMatchObject({ start: '2026-09-30', finished: 3, endedEarly: 1 })
    expect(bars.at(-1)).toMatchObject({ abandoned: 2, joined: 9, returning: 4, finished: 0 })
    expect(bars.reduce((n, b) => n + b.finished, 0)).toBe(3)
  })

  it('is a bar a week beyond 90 days, whole weeks counted back from today', () => {
    const bars = buckets([count('2026-09-25', 'games_finished', 2), count(TODAY, 'games_finished', 1)], '365', TODAY)
    expect(bars).toHaveLength(53)
    expect(bars.at(-1)).toMatchObject({ start: '2026-09-25', days: 7, finished: 3 })
    expect(bars[0]?.days).toBe(365 - 52 * 7)
    expect(bars.reduce((n, b) => n + b.days, 0)).toBe(365)
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
    expect(modeRanking(counts, 'all', TODAY)[0]).toEqual({ mode: 'more_less', started: 101, finished: 1 })
  })
})
