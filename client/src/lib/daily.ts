/**
 * The daily in this browser: the token that makes it once a day, and the day of the
 * attempt it last started, so opening `/daily` again resumes instead of offering Start.
 *
 * The token stays across days; the server keeps its hash with each attempt. A private
 * window has none, and gets around the once a day, which is accepted.
 */

import { readStored, writeStored } from './session'

const TOKEN_KEY = 'jbi:daily:token'
const LAST_KEY = 'jbi:daily:last'

/** This browser's token, made on first use: 32 random bytes, URL-safe base64. */
export function dailyToken(): string {
  const stored = readStored(TOKEN_KEY)
  if (stored !== null && stored.length >= 16) return stored
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  writeStored(TOKEN_KEY, token)
  return token
}

export interface LastDaily {
  /** The day the attempt plays, as the server names it (`2026-10-31`). */
  day: string
  finished: boolean
}

export function lastDaily(): LastDaily | null {
  try {
    const raw: unknown = JSON.parse(readStored(LAST_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { day, finished } = raw as Record<string, unknown>
    return typeof day === 'string' && typeof finished === 'boolean' ? { day, finished } : null
  } catch {
    return null
  }
}

export function noteDaily(last: LastDaily): void {
  writeStored(LAST_KEY, JSON.stringify(last))
}

/**
 * Whether `/daily` goes straight to the server rather than offering Start: an attempt
 * still running, whatever its day, or one played today.
 */
export function resumes(last: LastDaily | null, today: string): boolean {
  return last !== null && (!last.finished || last.day === today)
}

/** A finished attempt, as `POST /api/daily/result` returns it. */
export interface DailyResult {
  day: string
  number: number
  points: number
  /** Full credit only, the 🟩 in the row. */
  correct: number
  results: ('right' | 'partial' | 'missed')[]
}

export const SQUARES: Record<DailyResult['results'][number], string> = {
  right: '🟩',
  partial: '🟨',
  missed: '🟥',
}

/**
 * What the copy button gives: the day, the score, the row and a link to `/daily`, and no
 * answer. The points group in thousands with a comma, whatever the browser's language, so
 * every pasted result reads alike.
 */
export function shareText(result: DailyResult, origin: string): string {
  const points = result.points.toLocaleString('en-US')
  const row = result.results.map((one) => SQUARES[one]).join('')
  return `Daily #${result.number}: ${result.correct}/${result.results.length} · ${points}\n${row}\n${origin}/daily`
}
