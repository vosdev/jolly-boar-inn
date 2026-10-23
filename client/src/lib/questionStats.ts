/**
 * How players score on each pack question (`server/app/question_stats.py`), and the tier
 * that would fit it better, for the Stats view of `/admin`'s Questions tab.
 *
 * Advice only: a suggestion is applied by queueing an ordinary tier edit, which reaches the
 * packs through `make edit-packs`. Nothing retags by itself.
 */

import type { PackQuestion } from './reports'
import type { QuestionDifficulty } from './suggestions'

/** One question with its totals, as `/api/admin/questions/stats` lists it. */
export interface QuestionStats {
  question: PackQuestion
  answers: number
  credit_sum: number
  correct: number
  unanswered: number
  games: number
}

export interface Band {
  low: number
  high: number
}

/** Below these a question's share says too little to suggest anything. */
export const MIN_ANSWERS = 20
export const MIN_GAMES = 3
/** A share of players the timer beat at or above this is flagged. */
export const RAN_OUT_FLAG = 30

// A guess scores where the choices are on screen, so those types need a higher share.
const CHOICE_TYPES = new Set(['multiple_choice', 'pick_all_that_apply', 'ordering', 'matching'])
const CHOICE_LIFT = 10

function lift(question: PackQuestion): number {
  return CHOICE_TYPES.has(question.type) ? CHOICE_LIFT : 0
}

/** The whole percent of credit per answer, as the table shows it; null with no answers. */
export function scored(row: QuestionStats): number | null {
  return row.answers === 0 ? null : Math.round((100 * row.credit_sum) / row.answers)
}

/** The whole percent of players who did not answer before the close; null with nobody. */
export function ranOut(row: QuestionStats): number | null {
  const players = row.answers + row.unanswered
  return players === 0 ? null : Math.round((100 * row.unanswered) / players)
}

export function enough(row: QuestionStats): boolean {
  return row.answers >= MIN_ANSWERS && row.games >= MIN_GAMES
}

/** The scored shares, edges included, that fit `question`'s tier; null without a tier. */
export function band(question: PackQuestion): Band | null {
  const up = lift(question)
  switch (question.difficulty) {
    case 'easy':
      return { low: 55 + up, high: 100 }
    case 'medium':
      return { low: 30 + up, high: 80 + up }
    case 'hard':
      return { low: 0, high: 60 + up }
    default:
      return null
  }
}

/** Past these edges, easy goes straight to hard and hard to easy. */
function skipEdges(question: PackQuestion): Band {
  const up = lift(question)
  return { low: 30 + up, high: 80 + up }
}

/** The tier `row`'s share suggests instead of its own, or null when it fits or says too little. */
export function suggestion(row: QuestionStats): QuestionDifficulty | null {
  const fits = band(row.question)
  const share = scored(row)
  if (fits === null || share === null || !enough(row)) return null
  const skip = skipEdges(row.question)
  if (share < fits.low) return share < skip.low ? 'hard' : 'medium'
  if (share > fits.high) return share > skip.high ? 'easy' : 'medium'
  return null
}

/** How many points `row`'s share lies outside its band; 0 inside it or without a suggestion. */
export function distance(row: QuestionStats): number {
  const fits = band(row.question)
  const share = scored(row)
  if (fits === null || share === null || suggestion(row) === null) return 0
  return Math.max(fits.low - share, share - fits.high, 0)
}

export type StatsSort = 'band' | 'low' | 'high' | 'ran_out' | 'answers'

export const STATS_SORTS: { value: StatsSort; label: string }[] = [
  { value: 'band', label: 'Furthest from its band' },
  { value: 'low', label: 'Scored, lowest first' },
  { value: 'high', label: 'Scored, highest first' },
  { value: 'ran_out', label: 'No answer, most first' },
  { value: 'answers', label: 'Answers, most first' },
]

export interface StatsFilter {
  /** A mode, or '' for every round. */
  mode: string
  /** A tier, or '' for any. */
  tier: QuestionDifficulty | ''
  onlySuggestions: boolean
}

/** A missing share sorts after every real one, whichever way the list runs. */
function byShare(a: number | null, b: number | null, sign: number): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0)
  return sign * (a - b)
}

const SORTS: Record<StatsSort, (a: QuestionStats, b: QuestionStats) => number> = {
  band: (a, b) =>
    distance(b) - distance(a) || Number(enough(b)) - Number(enough(a)) || b.answers - a.answers,
  low: (a, b) => byShare(scored(a), scored(b), 1),
  high: (a, b) => byShare(scored(a), scored(b), -1),
  ran_out: (a, b) => byShare(ranOut(a), ranOut(b), -1),
  answers: (a, b) => b.answers - a.answers,
}

/** The rows `filter` keeps, before the suggestions-only switch. */
export function inScope(rows: readonly QuestionStats[], filter: StatsFilter): QuestionStats[] {
  return rows.filter(
    (row) =>
      (filter.mode === '' || row.question.mode === filter.mode) &&
      (filter.tier === '' || row.question.difficulty === filter.tier),
  )
}

/** The rows `filter` keeps, in `sort`'s order. */
export function statsRows(
  rows: readonly QuestionStats[],
  filter: StatsFilter,
  sort: StatsSort,
): QuestionStats[] {
  const kept = inScope(rows, filter).filter(
    (row) => !filter.onlySuggestions || suggestion(row) !== null,
  )
  return kept.sort(SORTS[sort])
}

export type QuestionsView = 'list' | 'stats'

const VIEW_KEY = 'jbi:admin-questions-view'

export function loadView(): QuestionsView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'stats' ? 'stats' : 'list'
  } catch {
    return 'list'
  }
}

/** Remembers `view` for the next visit, as far as storage allows. */
export function saveView(view: QuestionsView): void {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Storage denied: the choice lasts for this page only.
  }
}
