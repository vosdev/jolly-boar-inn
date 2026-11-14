/**
 * How to play's Try a question: one sample question per mode, played on the page alone.
 *
 * Written in its mode's file (`lib/modes/`) rather than drawn from a pack, so nothing a
 * player answers reaches the server and nothing lands in anyone's stats. Only the lists the
 * pick-from-list modes search are fetched, the same ones a room's players get. Each sample is
 * the `client_view` its type sends while open, plus what that type's reveal and grade need;
 * the grading is a copy of the server's, held to it by `server/tests/sample_grading_cases.json`.
 *
 * A mode whose round asks only in other types has no sample, and its view offers no Try a
 * question. A mixed mode's sample is one of its types.
 */

import { ANSWER_RULES, rulesOf, type AnswerRules } from './modeRules'
import { modeCopy } from './modes'
import { npcArt } from './npcs'
import type { PlayerResult } from './protocol'
import { credit as sliderCredit } from './slider'

// An item's detail picture, fetched as its icon is and missing where nothing fetched it. An NPC's
// art is `lib/npcs.ts`'s; a question's own picture has a random name only the server knows.
const detailFiles = import.meta.glob<string>('../assets/items/detail_*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

interface SampleBase {
  mode: string
  /** `client_view(payload)`: what the question shows while open. */
  view: Record<string, unknown>
  /** The seconds its mode adds to the answer: the registry's, never its mode file's. */
  extra?: number
}

export interface OneAnswerSample extends SampleBase {
  type: 'more_less' | 'multiple_choice'
  /** The right answer's shown position. */
  answer: number
  /** More or Less's reveal: each option's value, in the shown order. */
  values?: number[]
}

interface PriceSample extends SampleBase {
  type: 'price_is_right'
  /** The price, on the slider's two-figure grid. */
  value: number
}

interface OrderingSample extends SampleBase {
  type: 'ordering'
  /** Each shown entry's rank and the fact the reveal puts beside it. */
  reveal: { rank: number; detail: string }[]
}

export interface ListSample extends SampleBase {
  type: 'pick_from_list'
  /** The vocabulary entry that is right, which is also the id of its art. */
  answer: number
  subject: { name: string }
  /** The mode's `Steps`, where its picture builds up and points fall with it: the registry's. */
  steps?: { build: number; of: number }
}

export type Sample = OneAnswerSample | PriceSample | OrderingSample | ListSample

/** A mode file's sample, with what its mode's registry entry adds to the time and the points. */
function withRules(sample: Sample): Sample {
  const rules = rulesOf(sample.mode)
  if (rules === undefined) return sample
  const timed = rules.extra_answer > 0 ? { ...sample, extra: rules.extra_answer } : sample
  if (timed.type === 'pick_from_list' && rules.steps !== null) {
    return { ...timed, steps: rules.steps }
  }
  return timed
}

export const SAMPLES: Record<string, Sample> = Object.fromEntries(
  Object.entries(modeCopy('sample')).map(([id, sample]) => [id, withRules(sample)]),
)

/** The type's `items(payload)`: what its `ANSWER` adds seconds for. */
function sampleItems(sample: Sample): number {
  switch (sample.type) {
    case 'multiple_choice':
      return (sample.view.options as unknown[]).length
    case 'ordering':
      return sample.reveal.length
    case 'more_less':
    case 'price_is_right':
    case 'pick_from_list':
      return 0
  }
}

/** How long a sample stays open, in seconds: its type's `ANSWER` at the room's usual pace. */
export function sampleSeconds(sample: Sample, rules: AnswerRules = ANSWER_RULES): number {
  const timing = rules.answer[sample.type]!
  const exact = timing.base + timing.per_item * sampleItems(sample) + (sample.extra ?? 0)
  return Math.max(rules.min_answer, Math.floor(exact + 0.5))
}

/** The picture a room would send with the sample, as a URL, or null for none. */
export function samplePicture(
  sample: Sample,
  details: Record<string, string> = detailFiles,
): string | null {
  if (sample.type !== 'pick_from_list') return null
  if (sample.view.vocab === 'npcs') return npcArt(String(sample.answer)).url
  return details[`../assets/items/detail_${sample.answer}.png`] ?? null
}

/** What the type's reveal sends. */
export function sampleReveal(sample: Sample): Record<string, unknown> {
  switch (sample.type) {
    case 'more_less':
    case 'multiple_choice': {
      const shown = { ...sample.view, answer_index: sample.answer }
      const { values } = sample
      if (values === undefined) return shown
      const options = sample.view.options as Record<string, unknown>[]
      return { ...shown, options: options.map((option, i) => ({ ...option, value: values[i] })) }
    }
    case 'price_is_right':
      return { ...sample.view, value: sample.value }
    case 'ordering': {
      const entries = sample.view.entries as Record<string, unknown>[]
      const ranks = sample.reveal.map((entry) => entry.rank)
      return {
        ...sample.view,
        entries: entries.map((entry, i) => ({ ...entry, ...sample.reveal[i] })),
        answer: ranks.map((_, i) => i).sort((a, b) => ranks[a]! - ranks[b]!),
      }
    }
    case 'pick_from_list':
      return { ...sample.view, answer_id: sample.answer, subject: sample.subject }
  }
}

/**
 * `ordering.grade`: per place played, 1 for the rank that belongs there, and with `picks`
 * half for one that belongs in another. `ranks` are in shown order, as `value`'s positions.
 */
export function orderingCredit(
  ranks: number[],
  picks: number | undefined,
  value: number[],
): number {
  const wanted = [...ranks].sort((a, b) => a - b).slice(0, picks ?? ranks.length)
  const cut = wanted[wanted.length - 1]!
  const half = picks === undefined ? 0 : 0.5
  const earned = wanted.reduce((sum, rank, place) => {
    const placed = ranks[value[place]!]!
    if (placed === rank) return sum + 1
    return placed <= cut ? sum + half : sum
  }, 0)
  return earned / wanted.length
}

/** What the type's `grade` gives this answer, from 0 to 1. */
export function sampleCredit(sample: Sample, value: unknown): number {
  switch (sample.type) {
    case 'more_less':
    case 'multiple_choice':
    case 'pick_from_list':
      return value === sample.answer ? 1 : 0
    case 'price_is_right':
      return sliderCredit(
        sample.view.min as number,
        sample.view.max as number,
        sample.value,
        value as number,
      )
    case 'ordering':
      return orderingCredit(
        sample.reveal.map((entry) => entry.rank),
        sample.view.picks as number | undefined,
        value as number[],
      )
  }
}

/** Points for an answer `elapsedMs` into `seconds`, as the room scores one on speed. */
export function speedPoints(
  credit: number,
  elapsedMs: number,
  seconds: number,
  rules: AnswerRules = ANSWER_RULES,
): number {
  const fraction = elapsedMs / (seconds * 1000)
  const bucket = rules.buckets.find(([upTo]) => fraction <= upTo)
  return bucket === undefined ? 0 : Math.round(bucket[1] * credit)
}

/** `rooms/scoring.py`'s `step` and `step_points`: what `elapsedMs` pays while a picture builds up. */
export function stepPoints(
  elapsedMs: number,
  seconds: number,
  steps: { build: number; of: number },
): number {
  const count = steps.build + 1
  let step = 1
  while (step < count && (elapsedMs / 1000) * steps.of > step * seconds) step += 1
  return Math.round(400 + (600 * (count - step)) / (count - 1))
}

/** The points a room would pay `credit`, `elapsedMs` into the sample. */
function samplePoints(
  sample: Sample,
  credit: number,
  elapsedMs: number,
  rules: AnswerRules,
): number {
  const seconds = sampleSeconds(sample, rules)
  if (sample.type === 'pick_from_list' && sample.steps !== undefined) {
    return Math.round(stepPoints(elapsedMs, seconds, sample.steps) * credit)
  }
  return speedPoints(credit, elapsedMs, seconds, rules)
}

/** The row a room's reveal would give this answer, `elapsedMs` into the sample. */
export function sampleResult(
  sample: Sample,
  value: unknown,
  elapsedMs: number,
  rules: AnswerRules = ANSWER_RULES,
): PlayerResult {
  const credit = sampleCredit(sample, value)
  const points = samplePoints(sample, credit, elapsedMs, rules)
  return { value, correct: credit >= 1, credit, points }
}

/** The mode to try after `mode`, in `order`, wrapping round; only modes with a sample. */
export function nextSample(mode: string, order: readonly string[]): string {
  const tried = order.filter((id) => id in SAMPLES)
  const at = tried.indexOf(mode)
  return tried[(at + 1) % tried.length] ?? mode
}
