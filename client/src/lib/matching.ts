/**
 * A `matching` question as its form writes it: pairs of a field and the option that belongs
 * on it, written side by side, then decoys. `answer` follows from the pairs, so an author
 * never types an index, and the options are stored pairs first: the server shuffles them
 * for play (`server/app/questions/types/matching.py`).
 *
 * Like Create's questions (`lib/customQuestions.ts`) it is held to the schema's limits,
 * read from the schema, then to what `check()` adds. Only a pack question's form offers an
 * icon on a field: a host's question has no pictures, and a player names no asset ids.
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

export interface MatchingQuestion {
  type: 'matching'
  payload: Record<string, unknown>
  /** The NPC who asks it, for a random event's. */
  random_event?: string
}

export interface MatchingPair {
  /** The field's name; may be empty for an icon field. */
  field: string
  /** The field's `item:`/`npc:` asset, or empty. */
  icon: string
  option: string
  /** Shown beside the option at the reveal. */
  detail: string
}

export interface MatchingDecoy {
  option: string
  detail: string
}

/** One question as the form edits it: text as typed, and what it does not edit. */
export interface MatchingDraft {
  /** The NPC's line before the prompt, for a random event's. */
  intro: string
  prompt: string
  pairs: MatchingPair[]
  decoys: MatchingDecoy[]
  explanation: string
  /** Payload fields the form has no control for, such as `image`: kept as they came. */
  extra: Record<string, unknown>
}

const FIELDS = field('matching', 'fields')
const OPTIONS = field('matching', 'options')
export const FIELDS_MIN = limit(FIELDS, 'minItems') ?? 0
export const FIELDS_MAX = limit(FIELDS, 'maxItems') ?? 0
export const OPTIONS_MAX = limit(OPTIONS, 'maxItems') ?? 0
export const TEXT_MAX = limit(definition('short_text'), 'maxLength') ?? 0
export const DETAIL_MAX =
  limit(
    ((OPTIONS.items as Schema).properties as Record<string, Schema>).detail ?? {},
    'maxLength',
  ) ?? 0

const EDITED = new Set(['intro', 'prompt', 'fields', 'options', 'answer', 'explanation'])

const blank = (): MatchingPair => ({ field: '', icon: '', option: '', detail: '' })
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A blank draft, or `question` opened for editing. */
export function draftOf(question?: MatchingQuestion): MatchingDraft {
  const p = question?.payload ?? {}
  const stored = Array.isArray(p.fields) ? (p.fields as Record<string, unknown>[]) : []
  const options = Array.isArray(p.options) ? (p.options as Record<string, unknown>[]) : []
  const answer = Array.isArray(p.answer) ? (p.answer as number[]) : []
  const pairs = stored.map((entry, index) => {
    const option = options[answer[index] ?? -1] ?? {}
    return {
      field: text(entry.text),
      icon: text(entry.icon),
      option: text(option.text),
      detail: text(option.detail),
    }
  })
  const decoys = options
    .filter((_, index) => !answer.includes(index))
    .map((option) => ({ option: text(option.text), detail: text(option.detail) }))
  while (question === undefined && pairs.length < FIELDS_MIN) pairs.push(blank())
  return {
    intro: text(p.intro),
    prompt: text(p.prompt),
    pairs,
    decoys,
    explanation: text(p.explanation),
    extra: Object.fromEntries(Object.entries(p).filter(([key]) => !EDITED.has(key))),
  }
}

function option(entry: { option: string; detail: string }): Record<string, string> {
  const detail = entry.detail.trim()
  return { text: entry.option.trim(), ...(detail === '' ? {} : { detail }) }
}

/** The question a draft says, trimmed, with empty optional fields left out. */
export function questionOf(draft: MatchingDraft): MatchingQuestion {
  const allowed = new Set(fields('matching'))
  const intro = draft.intro.trim()
  const payload: Record<string, unknown> = intro === '' ? {} : { intro }
  payload.prompt = draft.prompt.trim()
  for (const [key, value] of Object.entries(draft.extra)) {
    if (allowed.has(key)) payload[key] = value
  }
  payload.fields = draft.pairs.map((pair) => {
    const name = pair.field.trim()
    const icon = pair.icon.trim()
    return { ...(name === '' ? {} : { text: name }), ...(icon === '' ? {} : { icon }) }
  })
  payload.options = [...draft.pairs.map(option), ...draft.decoys.map(option)]
  payload.answer = draft.pairs.map((_, index) => index)
  const explanation = draft.explanation.trim()
  if (explanation !== '') payload.explanation = explanation
  return { type: 'matching', payload }
}

const tidy = (value: string): string => value.split(/\s+/u).filter(Boolean).join(' ').toLowerCase()

/** `matching.check()`, run on whatever of the payload is well formed. */
function consistency(payload: Record<string, unknown>, icons: boolean): Problem[] {
  const found: Problem[] = []
  const stored = Array.isArray(payload.fields) ? (payload.fields as unknown[]) : []
  const options = Array.isArray(payload.options) ? (payload.options as unknown[]) : []
  const answer = Array.isArray(payload.answer) ? (payload.answer as unknown[]) : []
  if (stored.length > 0 && options.length < stored.length) {
    found.push(
      at('payload.options', `At least one answer for each of the ${stored.length} fields.`),
    )
  }
  if (answer.length !== stored.length) {
    found.push(at('payload.answer', 'Must name one answer for each field.'))
  }
  if (new Set(answer).size !== answer.length) {
    found.push(at('payload.answer', 'Uses an answer on two fields.'))
  }
  const seenFields = new Map<string, number>()
  stored.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null) return
    const { text: name, icon } = entry as { text?: unknown; icon?: unknown }
    if (name === undefined && icon === undefined) {
      found.push(at(`payload.fields[${i}].text`, 'Can’t be empty.', 'missing'))
      return
    }
    if (icon !== undefined && !icons) {
      found.push(at(`payload.fields[${i}].icon`, 'Only a pack question shows pictures.'))
    }
    const key = `${typeof name === 'string' ? tidy(name) : ''}\n${String(icon ?? '')}`
    const first = seenFields.get(key)
    if (first === undefined) seenFields.set(key, i)
    else found.push(at(`payload.fields[${i}].text`, `Same as field ${first + 1}.`))
  })
  const seenOptions = new Map<string, number>()
  options.forEach((entry, i) => {
    const value = (entry as { text?: unknown } | null)?.text
    // An empty one is the schema's to report, and blank answers are not a repeat yet.
    if (typeof value !== 'string' || value === '') return
    const key = tidy(value)
    const first = seenOptions.get(key)
    if (first === undefined) seenOptions.set(key, i)
    else found.push(at(`payload.options[${i}].text`, `Same as answer ${first + 1}.`))
  })
  return found
}

/**
 * Everything the server would refuse about `question`, or none. Without `icons`, also a
 * field with an icon: only a pack question's form may give one.
 */
export function problems(question: unknown, icons = false): Problem[] {
  if (typeof question !== 'object' || question === null || Array.isArray(question)) {
    return [at('', 'A question is a JSON object.')]
  }
  const raw = question as Record<string, unknown>
  const found: Problem[] = Object.keys(raw)
    .filter((key) => key !== 'type' && key !== 'payload' && key !== 'random_event')
    .map((key) => at(key, `“${key}” is not part of this question.`))
  if (raw.type !== 'matching') found.push(at('type', 'Must be matching.'))
  if (!('payload' in raw)) return [...found, at('payload', 'Required.', 'missing')]
  const payload = raw.payload
  found.push(...check({ $ref: '#/$defs/matching' }, payload, 'payload'))
  found.push(...unstorable(payload, 'payload'))
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    found.push(...consistency(payload as Record<string, unknown>, icons))
  }
  return found
}

/**
 * The question as players see it open: field names without icons, and the options not in
 * the order they were written. The server shuffles by the payload's content; a preview only
 * needs one that is not the answer, so the first goes to the end, as the server does when
 * its own shuffle would leave every option beside its field.
 */
export function previewOf(question: MatchingQuestion, mode: string): OpenQuestion {
  const opened = new Date(0).toISOString()
  const p = question.payload
  const stored = Array.isArray(p.fields) ? (p.fields as { text?: unknown }[]) : []
  const options = Array.isArray(p.options) ? (p.options as { text?: unknown }[]) : []
  const shown = [...options.slice(1), ...options.slice(0, 1)].map((entry) => ({ text: entry.text }))
  const view = Object.fromEntries(
    ['intro', 'prompt'].filter((key) => key in p).map((key) => [key, p[key]]),
  )
  return {
    question_id: 'preview',
    index: 0,
    total: 1,
    type: 'matching',
    mode,
    segment: { mode, index: 0, total: 1, start: 0, count: 1 },
    view: {
      ...view,
      fields: stored.map((entry) => (entry.text === undefined ? {} : { text: entry.text })),
      options: shown,
    },
    picture: null,
    random_event: question.random_event ?? null,
    opened_at: opened,
    answerable_at: opened,
    ends_at: new Date(8.64e15).toISOString(),
    you_can_answer: true,
    answered: 0,
    of: 0,
  }
}

/** The pairs for a reviewer: each field with its answer, then what is left over. */
export function answerLine(payload: Record<string, unknown>): string {
  const stored = (payload.fields as { text?: string; icon?: string }[] | undefined) ?? []
  const options = (payload.options as { text: string }[] | undefined) ?? []
  const answer = (payload.answer as number[] | undefined) ?? []
  const pairs = stored.map(
    (entry, i) => `${entry.text ?? entry.icon ?? ''} → ${options[answer[i] ?? -1]?.text ?? ''}`,
  )
  const left = options.filter((_, i) => !answer.includes(i)).map((entry) => entry.text)
  return left.length === 0 ? pairs.join(', ') : `${pairs.join(', ')}; left over: ${left.join(', ')}`
}
