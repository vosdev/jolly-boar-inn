/**
 * An `ordering` question as the suggestion form writes it: entries first to last, and a
 * "tied with the one above" box instead of a rank number. Ranks follow from the two, run
 * from 1 without a gap and share a number across a tie, as `ordering.check()` on the
 * server demands (`server/app/questions/types/ordering.py`), so an author never types one
 * and cannot skip one.
 *
 * Like Create's questions (`lib/customQuestions.ts`) it is held to the schema's limits,
 * read from the schema, then to what `check()` adds. Only a suggestion offers it: Create's
 * editor and the random events keep their three types.
 */

import { at, unstorable } from './customQuestions'
import type { OpenQuestion } from './protocol'
import {
  check,
  definition,
  field,
  fields,
  limit,
  type Problem,
  type Schema,
} from './questionSchema'

export interface OrderingQuestion {
  type: 'ordering'
  payload: Record<string, unknown>
}

export interface OrderingEntry {
  text: string
  /** Shown beside it in the reveal, such as "Level 20". */
  detail: string
  /** Shares the rank of the entry above it. Meaningless on the first. */
  tied: boolean
}

/** One question as the form edits it: text as typed, and what it does not edit. */
export interface OrderingDraft {
  prompt: string
  /** What the first and the last entry are, such as "Lowest" and "Highest". */
  ends: [string, string]
  entries: OrderingEntry[]
  /** Order only this many from the first end, or every entry. */
  picks: number | null
  explanation: string
  /** Payload fields the form has no control for, such as `image`: kept as they came. */
  extra: Record<string, unknown>
}

const ENTRIES = field('ordering', 'entries')
export const ENTRIES_MIN = limit(ENTRIES, 'minItems') ?? 0
export const ENTRIES_MAX = limit(ENTRIES, 'maxItems') ?? 0
export const PICKS_MIN = limit(field('ordering', 'picks'), 'minimum') ?? 0
export const ENDS_MAX = limit(field('ordering', 'ends').items as Schema, 'maxLength') ?? 0
export const TEXT_MAX = limit(definition('short_text'), 'maxLength') ?? 0
export const DETAIL_MAX =
  limit(
    ((ENTRIES.items as Schema).properties as Record<string, Schema>).detail ?? {},
    'maxLength',
  ) ?? 0

/** What an ordering round's form says to its author, where the generic wording would not do. */
export interface OrderingWording {
  prompt: string
  ends: [string, string]
  detail: string
  /** Whether every entry needs its detail: for Release Order it is the date. */
  detailRequired: boolean
}

const GENERIC: OrderingWording = {
  prompt: 'What are they sorted by?',
  ends: ['Lowest', 'Highest'],
  detail: 'Shown at the reveal, such as Level 20',
  detailRequired: false,
}

const WORDING: Record<string, OrderingWording> = {
  release_order: {
    prompt: 'What are they put in order of?',
    ends: ['Oldest', 'Newest'],
    detail: 'The date it came out, such as 4 January 2001',
    detailRequired: true,
  },
}

export function wordingOf(mode: string): OrderingWording {
  return WORDING[mode] ?? GENERIC
}

const EDITED = new Set(['prompt', 'ends', 'entries', 'answer', 'picks', 'explanation'])

const blank = (): OrderingEntry => ({ text: '', detail: '', tied: false })

/** Ranks that run from 1: an entry takes the one above's rank if tied with it, else the next. */
export function ranksOf(entries: readonly Pick<OrderingEntry, 'tied'>[]): number[] {
  let rank = 0
  return entries.map((entry, index) => {
    if (index === 0 || !entry.tied) rank += 1
    return rank
  })
}

/** The most `picks` may be: fewer than the entries, which `check()` refuses otherwise. */
export function picksMax(entries: number): number {
  return Math.min(entries - 1, limit(field('ordering', 'picks'), 'maximum') ?? entries - 1)
}

/** A blank draft, or `question` opened for editing. */
export function draftOf(question?: OrderingQuestion): OrderingDraft {
  const p = question?.payload ?? {}
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  const ends = Array.isArray(p.ends) ? p.ends.map(text) : []
  const stored = Array.isArray(p.entries) ? (p.entries as Record<string, unknown>[]) : []
  // `answer` is what puts a stored question's entries in order; written by hand they need
  // not be, and the form always shows them first to last.
  const order = Array.isArray(p.answer) ? (p.answer as number[]) : stored.map((_, i) => i)
  const placed = order.map((index) => stored[index]).filter((entry) => entry !== undefined)
  const entries = placed.map((entry, index) => ({
    text: text(entry.text),
    detail: text(entry.detail),
    tied: index > 0 && entry.rank === placed[index - 1]?.rank,
  }))
  while (question === undefined && entries.length < ENTRIES_MIN) entries.push(blank())
  return {
    prompt: text(p.prompt),
    ends: [ends[0] ?? '', ends[1] ?? ''],
    entries,
    picks: typeof p.picks === 'number' ? p.picks : null,
    explanation: text(p.explanation),
    extra: Object.fromEntries(Object.entries(p).filter(([key]) => !EDITED.has(key))),
  }
}

/** The question a draft says, trimmed, with empty optional fields left out. */
export function questionOf(draft: OrderingDraft): OrderingQuestion {
  const allowed = new Set(fields('ordering'))
  const payload: Record<string, unknown> = { prompt: draft.prompt.trim() }
  for (const [key, value] of Object.entries(draft.extra)) {
    if (allowed.has(key)) payload[key] = value
  }
  const ranks = ranksOf(draft.entries)
  payload.ends = draft.ends.map((end) => end.trim())
  payload.entries = draft.entries.map((entry, index) => {
    const detail = entry.detail.trim()
    return { text: entry.text.trim(), rank: ranks[index], ...(detail === '' ? {} : { detail }) }
  })
  payload.answer = draft.entries.map((_, index) => index)
  if (draft.picks !== null) payload.picks = draft.picks
  const explanation = draft.explanation.trim()
  if (explanation !== '') payload.explanation = explanation
  return { type: 'ordering', payload }
}

const tidy = (text: string): string => text.split(/\s+/u).filter(Boolean).join(' ').toLowerCase()

/** `ordering.check()`, run on whatever of the payload is well formed. */
function consistency(payload: Record<string, unknown>): Problem[] {
  const found: Problem[] = []
  const entries = payload.entries
  if (!Array.isArray(entries)) return found
  const shaped = entries.filter(
    (entry): entry is { text: unknown; rank: number } =>
      typeof entry === 'object' &&
      entry !== null &&
      Number.isInteger((entry as { rank?: unknown }).rank),
  )
  if (shaped.length !== entries.length) return found
  const ranks = shaped.map((entry) => entry.rank).sort((a, b) => a - b)
  const answer = payload.answer
  if (Array.isArray(answer) && answer.length === entries.length) {
    if ([...answer].sort((a, b) => a - b).some((index, i) => index !== i)) {
      found.push(at('payload.answer', 'Must list each entry once.'))
    } else {
      answer.slice(1).forEach((after: number, i) => {
        if (shaped[answer[i] as number]!.rank > shaped[after]!.rank) {
          found.push(at('payload.answer', 'Entries must come in the order of their ranks.'))
        }
      })
    }
  }
  const last = ranks[ranks.length - 1] ?? 0
  const missing = Array.from({ length: last }, (_, i) => i + 1).filter((r) => !ranks.includes(r))
  if (missing.length > 0) {
    found.push(at('payload.entries', `No entry has rank ${missing.join(', ')}.`))
  }
  const picks = payload.picks
  if (typeof picks === 'number' && picks >= entries.length) {
    found.push(
      at(
        'payload.picks',
        `Only fewer than the ${entries.length} entries can be ordered; leave it to order all.`,
      ),
    )
  } else if (typeof picks === 'number' && new Set(ranks.slice(0, picks + 1)).size === 1) {
    found.push(
      at(
        'payload.picks',
        `The first ${picks + 1} entries are tied, so any ${picks} of them in any order would win.`,
      ),
    )
  }
  if (ranks.length > 0 && new Set(ranks).size === 1) {
    found.push(at('payload.entries', 'Every entry is tied, so any order would be right.'))
  }
  const seen = new Map<string, number>()
  shaped.forEach((entry, i) => {
    // An empty one is the schema's to report, and blank entries are not a repeat yet.
    if (typeof entry.text !== 'string' || entry.text === '') return
    const key = tidy(entry.text)
    const first = seen.get(key)
    if (first === undefined) seen.set(key, i)
    else found.push(at(`payload.entries[${i}].text`, `Same as entry ${first + 1}.`))
  })
  return found
}

/**
 * Everything the server would refuse about `question`, or none. With `detailRequired`, also
 * an entry that has no detail: the server leaves it optional, but a round that shows dates
 * is no use with some missing.
 */
export function problems(question: unknown, detailRequired = false): Problem[] {
  if (typeof question !== 'object' || question === null || Array.isArray(question)) {
    return [at('', 'A question is a JSON object.')]
  }
  const raw = question as Record<string, unknown>
  const found: Problem[] = Object.keys(raw)
    .filter((key) => key !== 'type' && key !== 'payload')
    .map((key) => at(key, `“${key}” is not part of this question: only type and payload are.`))
  if (raw.type !== 'ordering') found.push(at('type', 'Must be ordering.'))
  if (!('payload' in raw)) return [...found, at('payload', 'Required.', 'missing')]
  const payload = raw.payload
  found.push(...check({ $ref: '#/$defs/ordering' }, payload, 'payload'))
  found.push(...unstorable(payload, 'payload'))
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    found.push(...consistency(payload as Record<string, unknown>))
    const entries = (payload as { entries?: unknown }).entries
    if (detailRequired && Array.isArray(entries)) {
      entries.forEach((entry: { detail?: unknown }, i) => {
        if (entry?.detail === undefined) {
          found.push(
            at(`payload.entries[${i}].detail`, 'Required: the date it came out.', 'missing'),
          )
        }
      })
    }
  }
  return found
}

/**
 * The question as players see it open: the entries without rank or detail, and not in the
 * order they were written. The server shuffles by the payload's content (`shown_order`);
 * a preview only needs one that is not the answer, so the first goes to the end, which is
 * what the server does when its own shuffle lands in order.
 */
export function previewOf(question: OrderingQuestion, mode: string): OpenQuestion {
  const opened = new Date(0).toISOString()
  const p = question.payload
  const entries = Array.isArray(p.entries) ? (p.entries as { text?: unknown }[]) : []
  const shown = [...entries.slice(1), ...entries.slice(0, 1)].map((entry) => ({ text: entry.text }))
  const view = Object.fromEntries(
    ['intro', 'prompt', 'ends', 'picks'].filter((key) => key in p).map((key) => [key, p[key]]),
  )
  return {
    question_id: 'preview',
    index: 0,
    total: 1,
    type: 'ordering',
    mode,
    segment: { mode, index: 0, total: 1, start: 0, count: 1 },
    view: { ...view, entries: shown },
    picture: null,
    random_event: null,
    opened_at: opened,
    answerable_at: opened,
    ends_at: new Date(8.64e15).toISOString(),
    you_can_answer: true,
    answered: 0,
    of: 0,
  }
}

/** The right order for the queue's reviewer: first to last, ties joined by "=". */
export function answerLine(payload: Record<string, unknown>): string {
  const entries = (payload.entries as { text: string; rank: number; detail?: string }[]) ?? []
  const order = (payload.answer as number[]) ?? entries.map((_, i) => i)
  const label = (entry: { text: string; detail?: string }): string =>
    entry.detail === undefined ? entry.text : `${entry.text} (${entry.detail})`
  let line = ''
  order.forEach((index, i) => {
    const entry = entries[index]
    if (entry === undefined) return
    const before = i === 0 ? undefined : entries[order[i - 1] as number]
    line += i === 0 ? '' : before?.rank === entry.rank ? ' = ' : ' → '
    line += label(entry)
  })
  return typeof payload.picks === 'number'
    ? `${line} (the first ${payload.picks} are ordered)`
    : line
}
