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

export interface ModeRank {
  mode: string
  started: number
  finished: number
}

const DAY_MS = 86_400_000
/** Longer than this, a chart is a 7-day moving line: a year of daily bars is slivers. */
const DAILY_UP_TO = 90
const WINDOW = 7

/** Round lengths in minutes, as the server buckets them. */
export const ROUND_LENGTHS = ['0-2', '2-5', '5-10', '10+'] as const

/** Who a join failure is down to: the player, the instance's limits, or the room and its host. */
export type FailureGroup = 'player' | 'ours' | 'host'

export const FAILURE_GROUPS: Record<string, FailureGroup> = {
  not_found: 'player',
  name_taken: 'player',
  bad_key: 'player',
  room_full: 'ours',
  requests_full: 'ours',
  not_joinable: 'host',
  request_denied: 'host',
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

/** A chart's days and one value per day for each metric asked for, in that order. */
export interface Series {
  days: string[]
  values: number[][]
  /** Each value is the mean of its day and the six before it, for a range past 90 days. */
  smoothed: boolean
}

/**
 * Each of `metrics` per day over the range, oldest first. The last day is today and so
 * always partial; the chart draws it as such rather than this leaving it out.
 */
export function series(
  counts: Count[],
  range: Range,
  today: string,
  metrics: readonly string[],
): Series {
  const days = rangeDays(counts, range, today)
  const index = new Map(days.map((day, i) => [day, i]))
  const values = metrics.map(() => days.map(() => 0))
  for (const count of counts) {
    const at = metrics.indexOf(count.metric)
    const i = index.get(count.day)
    if (at >= 0 && i !== undefined) values[at]![i]! += count.count
  }
  const smoothed = days.length > DAILY_UP_TO
  return { days, values: smoothed ? values.map(moving) : values, smoothed }
}

/** The trailing 7-day mean of `values`, over fewer days where fewer came before. */
function moving(values: number[]): number[] {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - WINDOW + 1), i + 1)
    return window.reduce((a, b) => a + b, 0) / window.length
  })
}

/** One headline figure, its value over the previous period, and the change between them. */
export interface Figure {
  /** `null` for a rate with nothing to divide by. */
  value: number | null
  previous: number | null
  /** Relative for a count (0.25 is 25% up), percentage points for a rate; `null` if unknown. */
  change: number | null
}

export interface Headline {
  /** Whole days: today is left out, so a morning does not read as a slump. */
  days: number
  /** False for "all", which has nothing before it to compare with. */
  compared: boolean
  games: Figure
  players: Figure
  /** Finished over every game that ended, so a game still running counts nowhere. */
  finishRate: Figure
  returnRate: Figure
}

const ENDED = ['games_finished', 'games_ended_early', 'games_abandoned']

/** The range's headline figures over whole days up to yesterday, each against the days before. */
export function headline(counts: Count[], range: Range, today: string): Headline {
  const yesterday = dayOf(msOf(today) - DAY_MS)
  const current = rangeDays(counts, range, yesterday).filter((day) => day <= yesterday)
  const first = current[0] ?? yesterday
  const before =
    range === 'all'
      ? null
      : current.map((_, i) => dayOf(msOf(first) - (current.length - i) * DAY_MS))
  const over = (days: string[] | null) => {
    if (days === null) return null
    const inside = new Set(days)
    const sum = (metrics: string[]) =>
      counts
        .filter((c) => metrics.includes(c.metric) && inside.has(c.day))
        .reduce((n, c) => n + c.count, 0)
    const ended = sum(ENDED)
    const joined = sum(['players_joined'])
    return {
      games: sum(['games_started']),
      players: joined,
      finishRate: ended === 0 ? null : sum(['games_finished']) / ended,
      returnRate: joined === 0 ? null : sum(['players_returning']) / joined,
    }
  }
  const now = over(current)!
  const then = over(before)
  const count = (value: number, previous: number | undefined): Figure => ({
    value,
    previous: previous ?? null,
    change: previous === undefined || previous === 0 ? null : (value - previous) / previous,
  })
  const rate = (value: number | null, previous: number | null | undefined): Figure => ({
    value,
    previous: previous ?? null,
    change: value === null || previous == null ? null : value - previous,
  })
  return {
    days: current.length,
    compared: then !== null,
    games: count(now.games, then?.games),
    players: count(now.players, then?.players),
    finishRate: rate(now.finishRate, then?.finishRate),
    returnRate: rate(now.returnRate, then?.returnRate),
  }
}

/** Joins tried over the range and how many failed, by whom the failure was down to. */
export interface JoinFunnel {
  attempts: number
  failed: Record<FailureGroup, number>
}

/**
 * A host's own join comes with their room, so it is no attempt; every failure the browsers
 * reported is one, retries of a taken name included.
 */
export function joinFunnel(counts: Count[], range: Range, today: string): JoinFunnel {
  const failed: Record<FailureGroup, number> = { player: 0, ours: 0, host: 0 }
  for (const row of breakdown(counts, range, today, ['join_failures'])) {
    const group = FAILURE_GROUPS[row.key]
    if (group !== undefined) failed[group] += row.total
  }
  const joins =
    total(counts, range, today, 'players_joined') - total(counts, range, today, 'rooms_created')
  return { attempts: Math.max(0, joins) + failed.player + failed.ours + failed.host, failed }
}

/** Finished rounds per mode in the range, split by how long each took, most rounds first. */
export function roundLengths(counts: Count[], range: Range, today: string): Breakdown[] {
  const split: Count[] = []
  for (const count of counts) {
    if (count.metric !== 'round_durations') continue
    const at = count.key.lastIndexOf('/')
    split.push({ ...count, metric: count.key.slice(at + 1), key: count.key.slice(0, at) })
  }
  return breakdown(split, range, today, ROUND_LENGTHS)
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

/** One key of a breakdown, with a count per metric asked for, in that order. */
export interface Breakdown {
  key: string
  values: number[]
  total: number
}

/**
 * Each key's counts of `metrics` in the range, one value per metric. Biggest total first,
 * or in `order` when the keys have one of their own, like the game lengths.
 */
export function breakdown(
  counts: Count[],
  range: Range,
  today: string,
  metrics: readonly string[],
  order?: readonly string[],
): Breakdown[] {
  const inRange = new Set(rangeDays(counts, range, today))
  const byKey = new Map<string, Breakdown>()
  for (const count of counts) {
    const at = metrics.indexOf(count.metric)
    if (at < 0 || !inRange.has(count.day)) continue
    let row = byKey.get(count.key)
    if (row === undefined) {
      row = { key: count.key, values: metrics.map(() => 0), total: 0 }
      byKey.set(count.key, row)
    }
    row.values[at]! += count.count
    row.total += count.count
  }
  const rows = [...byKey.values()]
  if (order === undefined) {
    return rows.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
  }
  const rank = (key: string): number => {
    const i = order.indexOf(key)
    return i < 0 ? order.length : i
  }
  return rows.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))
}

/** The sum of `metric` over the range, every key together. */
export function total(counts: Count[], range: Range, today: string, metric: string): number {
  const inRange = new Set(rangeDays(counts, range, today))
  return counts
    .filter((c) => c.metric === metric && inRange.has(c.day))
    .reduce((sum, c) => sum + c.count, 0)
}
