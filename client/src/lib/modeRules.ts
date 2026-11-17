/**
 * `schema/modes.json`, read in the browser: each mode's rules as the server's registry
 * (`server/app/modes`) holds them, so no client file keeps its own list of which mode takes a
 * quote, how a round's picture shows or what a suggestion for it may be.
 *
 * `make gen-modes` writes the file from the registry; a server test fails while it is stale,
 * and `modes.test.ts` while a mode under `lib/modes/` is missing from it. Copy, what a mode
 * is called and how it is explained, stays in `lib/modes/`.
 */

import RULES from '../../../schema/modes.json'
import type { Scoring } from './protocol'

/** `Suggest` on the server: what a player may suggest for a mode. */
export interface SuggestRules {
  types: string[]
  quote: boolean
  intro: boolean
  explanation: boolean
  difficulty: boolean
  fixed_prompt: string | null
  wiki_only: boolean
  named: string | null
  verse: boolean
  render: boolean
  picture_item: boolean
  lined: boolean
  tags: [string, string][]
  right_first: boolean
}

/** How the report form offers a mode's questions, and what makes two of them the same. */
export type ReportBy = 'question' | 'item' | 'options' | 'npc'

/** `Mode` on the server: one entry of the registry, in its order. */
export interface ModeRules {
  id: string
  types: string[]
  is_round: boolean
  questions: { default: number; minimum: number; maximum: number } | null
  pool: string | null
  setting: string | null
  options: [number, number] | null
  steps: { build: number; of: number } | null
  pictured: boolean
  picture_at_reveal: boolean
  extra_answer: number
  stem: string | null
  hold_counts_prompt: boolean
  suggest: SuggestRules | null
  report: ReportBy
  compare: ReportBy
}

/** `Timing` on the server: `base` seconds plus `per_item` for each item shown, at run pace. */
export interface Timing {
  base: number
  per_item: number
}

/** What a question's answer time and its points are made of, as the server holds them. */
export interface AnswerRules {
  /** Each type's `ANSWER`. */
  answer: Record<string, Timing>
  /** `MIN_ANSWER`: no question is open for less, whatever the pace. */
  min_answer: number
  /** Each type's `SCORING`: whether the clock counts toward its points. */
  scoring: Record<string, Scoring>
  /** `rooms/scoring.py`'s `BUCKETS`: the fraction of the time used, and its points. */
  buckets: [number, number][]
}

interface Rules extends AnswerRules {
  modes: ModeRules[]
  upcoming: { id: string; suggest: SuggestRules }[]
  planned: string[]
}

const DATA = RULES as unknown as Rules

/** The answer timings, scorings and speed buckets this build's server applies. */
export const ANSWER_RULES: AnswerRules = DATA

/** Every mode this build plays, in the registry's order, which is the create form's. */
export const MODE_RULES: readonly ModeRules[] = DATA.modes

/** Rounds not built yet: those that take suggestions already, then those that do not. */
export const COMING_SOON: readonly string[] = [
  ...DATA.upcoming.map((entry) => entry.id),
  ...DATA.planned,
]

/** Every mode id, built or coming soon, in that order. */
export const ALL_MODE_IDS: readonly string[] = [
  ...MODE_RULES.map((mode) => mode.id),
  ...COMING_SOON,
]

const BY_ID = new Map(MODE_RULES.map((mode) => [mode.id, mode]))

/** `mode`'s registry entry, or undefined for one this build does not play. */
export function rulesOf(mode: string): ModeRules | undefined {
  return BY_ID.get(mode)
}

/** Every mode a player may suggest for, built or not, in registry order and then the upcoming. */
export const SUGGESTIBLE: ReadonlyMap<string, SuggestRules> = new Map([
  ...MODE_RULES.flatMap((mode): [string, SuggestRules][] =>
    mode.suggest === null ? [] : [[mode.id, mode.suggest]],
  ),
  ...DATA.upcoming.map((entry): [string, SuggestRules] => [entry.id, entry.suggest]),
])

/** What a suggestion for `mode` may be, or undefined for a mode that takes none. */
export function suggestRulesOf(mode: string): SuggestRules | undefined {
  return SUGGESTIBLE.get(mode)
}

/**
 * How a mode's picture shows while a question is open: `shadow` for one that is the whole
 * question, `build` for one that builds up, `reveal` for one held back until the reveal.
 */
export function pictureOf(mode: ModeRules): 'shadow' | 'build' | 'reveal' | undefined {
  if (mode.steps !== null) return 'build'
  if (mode.picture_at_reveal) return 'reveal'
  return mode.pictured ? 'shadow' : undefined
}
