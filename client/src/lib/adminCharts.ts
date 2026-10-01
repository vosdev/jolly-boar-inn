/**
 * The admin page's history, shaped for its charts from the raw daily counters.
 *
 * The server sends every counter it ever kept, one row per day, metric and mode, and keeps
 * nothing for a day without events. Ranges, gaps and grouping are decided here, so a year
 * of history costs the server one query and no settings.
 */

import type { Count } from './admin'

export type Range = '30' | '90' | '365' | 'all'

/** A chart colour, one of the theme's tokens. */
export type Tone = 'ok' | 'bad' | 'muted' | 'accent' | 'warn'

/** One bar: a day, or a week once the range is too long for a bar a day. */
export interface Bucket {
  start: string
  days: number
  finished: number
  endedEarly: number
  abandoned: number
  joined: number
  returning: number
}

export interface ModeRank {
  mode: string
  started: number
  finished: number
}

const DAY_MS = 86_400_000
/** Longer than this, a bar is a week: a year as 53 bars rather than 365 slivers. */
const DAILY_UP_TO = 90

const BUCKET_FIELD: Record<string, keyof Bucket> = {
  games_finished: 'finished',
  games_ended_early: 'endedEarly',
  games_abandoned: 'abandoned',
  players_joined: 'joined',
  players_returning: 'returning',
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function msOf(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}

/** Today in UTC, the calendar the counters are kept in. */
export function utcToday(now: number = Date.now()): string {
  return dayOf(now)
}

/** Every day `range` covers, oldest first and ending on `today`. */
export function rangeDays(counts: Count[], range: Range, today: string): string[] {
  const end = msOf(today)
  let start = end
  if (range === 'all') {
    for (const count of counts) start = Math.min(start, msOf(count.day))
  } else {
    start = end - (Number(range) - 1) * DAY_MS
  }
  const days: string[] = []
  for (let ms = start; ms <= end; ms += DAY_MS) days.push(dayOf(ms))
  return days
}

/**
 * The range's bars, oldest first. Weeks are counted back from `today`, so the newest bar
 * is always a whole week and only the oldest may be short.
 */
export function buckets(counts: Count[], range: Range, today: string): Bucket[] {
  const days = rangeDays(counts, range, today)
  const size = days.length > DAILY_UP_TO ? 7 : 1
  const total = Math.ceil(days.length / size)
  const bars: Bucket[] = []
  const barOf = new Map<string, Bucket>()
  days.forEach((day, i) => {
    const index = total - 1 - Math.floor((days.length - 1 - i) / size)
    let bar = bars[index]
    if (bar === undefined) {
      bar = { start: day, days: 0, finished: 0, endedEarly: 0, abandoned: 0, joined: 0, returning: 0 }
      bars[index] = bar
    }
    bar.days += 1
    barOf.set(day, bar)
  })
  for (const count of counts) {
    const bar = barOf.get(count.day)
    const field = BUCKET_FIELD[count.metric]
    if (bar !== undefined && field !== undefined) (bar[field] as number) += count.count
  }
  return bars
}

/** Modes by rounds started in the range, most first, with how many of those finished. */
export function modeRanking(counts: Count[], range: Range, today: string): ModeRank[] {
  const inRange = new Set(rangeDays(counts, range, today))
  const byMode = new Map<string, ModeRank>()
  for (const count of counts) {
    if (!inRange.has(count.day) || count.key === '') continue
    if (count.metric !== 'rounds_started' && count.metric !== 'rounds_finished') continue
    let rank = byMode.get(count.key)
    if (rank === undefined) {
      rank = { mode: count.key, started: 0, finished: 0 }
      byMode.set(count.key, rank)
    }
    if (count.metric === 'rounds_started') rank.started += count.count
    else rank.finished += count.count
  }
  return [...byMode.values()].sort((a, b) => b.started - a.started || a.mode.localeCompare(b.mode))
}
