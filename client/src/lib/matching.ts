/**
 * A `matching` question as its form writes it: pairs of a field and the option that belongs
 * on it, written side by side, then decoys. `answer` follows from the pairs, so an author
 * never types an index, and the options are stored pairs first: the server shuffles them
 * for play (`server/app/questions/types/matching.py`).
 *
 * With `bins` the options are bins and the fields the entries sorted into them, any
 * number to a bin: the form writes the bins, then each entry with the bin it goes in.
 *
 * Like Create's questions (`lib/customQuestions.ts`) it is held to the schema's limits,
 * read from the schema, then to what `check()` adds. Only a pack question's form offers an
 * icon on a field: a host's question has no pictures, and a player names no asset ids.
 */

import { at, previewShell, unstorable } from './customQuestions'
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

export interface MatchingEntry {
  /** The entry's name; may be empty for an icon entry. */
  field: string
  /** The entry's `item:`/`npc:` asset, or empty. */
  icon: string
  /** Its bin, by index in `bins`. */
  bin: number
}

/** One question as the form edits it: text as typed, and what it does not edit. */
export interface MatchingDraft {
  /** The NPC's line before the prompt, for a random event's. */
  intro: string
  prompt: string
  /** Which of the two the form writes: pairs and decoys, or bins and entries. */
  sorting: boolean
  pairs: MatchingPair[]
  decoys: MatchingDecoy[]
  bins: MatchingDecoy[]
  entries: MatchingEntry[]
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

/** What `matching.check()` holds a `bins` question to. */
export const BINS_MIN = 3
export const BINS_MAX = 4
export const ENTRIES_MIN = 4
export const ENTRIES_MAX = FIELDS_MAX

const EDITED = new Set(['intro', 'prompt', 'bins', 'fields', 'options', 'answer', 'explanation'])

const blank = (): MatchingPair => ({ field: '', icon: '', option: '', detail: '' })
const blankBin = (): MatchingDecoy => ({ option: '', detail: '' })
/** A new entry, in the first bin until the author picks another. */
export const blankEntry = (): MatchingEntry => ({ field: '', icon: '', bin: 0 })
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A blank draft, or `question` opened for editing. */
export function draftOf(question?: MatchingQuestion): MatchingDraft {
  const p = question?.payload ?? {}
  const stored = Array.isArray(p.fields) ? (p.fields as Record<string, unknown>[]) : []
  const options = Array.isArray(p.options) ? (p.options as Record<string, unknown>[]) : []
  const answer = Array.isArray(p.answer) ? (p.answer as number[]) : []
  const sorting = p.bins === true
  const optionOf = (entry: Record<string, unknown>): MatchingDecoy => ({
    option: text(entry.text),
    detail: text(entry.detail),
  })
  // The kind a question was not written as starts blank, for an author who switches to it.
  const pairs: MatchingPair[] = sorting
    ? []
    : stored.map((entry, index) => ({
        field: text(entry.text),
        icon: text(entry.icon),
        ...optionOf(options[answer[index] ?? -1] ?? {}),
      }))
  const decoys = sorting ? [] : options.filter((_, i) => !answer.includes(i)).map(optionOf)
  const bins = sorting ? options.map(optionOf) : []
  const entries: MatchingEntry[] = sorting
    ? stored.map((entry, index) => ({
        field: text(entry.text),
        icon: text(entry.icon),
        bin: answer[index] ?? 0,
      }))
    : []
  while ((question === undefined || sorting) && pairs.length < FIELDS_MIN) pairs.push(blank())
  while (!sorting && bins.length < BINS_MIN) bins.push(blankBin())
  while (!sorting && entries.length < ENTRIES_MIN) entries.push(blankEntry())
  return {
    intro: text(p.intro),
    prompt: text(p.prompt),
    sorting,
    pairs,
    decoys,
    bins,
    entries,
    explanation: text(p.explanation),
    extra: Object.fromEntries(Object.entries(p).filter(([key]) => !EDITED.has(key))),
  }
}

function option(entry: { option: string; detail: string }): Record<string, string> {
  const detail = entry.detail.trim()
  return { text: entry.option.trim(), ...(detail === '' ? {} : { detail }) }
}

function fieldOf(entry: { field: string; icon: string }): Record<string, string> {
  const name = entry.field.trim()
  const icon = entry.icon.trim()
  return { ...(name === '' ? {} : { text: name }), ...(icon === '' ? {} : { icon }) }
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
  if (draft.sorting) {
    payload.bins = true
    payload.fields = draft.entries.map(fieldOf)
    payload.options = draft.bins.map(option)
    payload.answer = draft.entries.map((entry) => entry.bin)
  } else {
    payload.fields = draft.pairs.map(fieldOf)
    payload.options = [...draft.pairs.map(option), ...draft.decoys.map(option)]
    payload.answer = draft.pairs.map((_, index) => index)
  }
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
  const sorting = payload.bins === true
  if (sorting) {
    if (options.length < BINS_MIN || options.length > BINS_MAX) {
      found.push(at('payload.options', `${BINS_MIN} to ${BINS_MAX} bins.`))
    }
    if (stored.length < ENTRIES_MIN || stored.length > ENTRIES_MAX) {
      found.push(at('payload.fields', `${ENTRIES_MIN} to ${ENTRIES_MAX} entries to sort.`))
    }
    if (answer.some((bin) => typeof bin === 'number' && bin >= options.length)) {
      found.push(at('payload.answer', 'Puts an entry in a bin that is not there.'))
    }
  } else if (stored.length > 0 && options.length < stored.length) {
    found.push(
      at('payload.options', `At least one answer for each of the ${stored.length} fields.`),
    )
  }
  if (answer.length !== stored.length) {
    found.push(at('payload.answer', 'Must name one answer for each field.'))
  }
  if (!sorting && new Set(answer).size !== answer.length) {
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
 * its own shuffle would leave every option beside its field. Bins keep their order: no
 * order of them gives anything away.
 */
export function previewOf(question: MatchingQuestion, mode: string): OpenQuestion {
  const p = question.payload
  const stored = Array.isArray(p.fields) ? (p.fields as { text?: unknown }[]) : []
  const options = Array.isArray(p.options) ? (p.options as { text?: unknown }[]) : []
  const sorting = p.bins === true
  const order = sorting ? options : [...options.slice(1), ...options.slice(0, 1)]
  const shown = order.map((entry) => ({ text: entry.text }))
  const view = Object.fromEntries(
    ['intro', 'prompt', 'bins'].filter((key) => key in p).map((key) => [key, p[key]]),
  )
  return {
    ...previewShell(mode, question.random_event ?? null),
    type: 'matching',
    view: {
      ...view,
      fields: stored.map((entry) => (entry.text === undefined ? {} : { text: entry.text })),
      options: shown,
    },
  }
}

/**
 * The pairs for a reviewer: each field with its answer, then what is left over. A sort is
 * each bin with its entries.
 */
export function answerLine(payload: Record<string, unknown>): string {
  const stored = (payload.fields as { text?: string; icon?: string }[] | undefined) ?? []
  const options = (payload.options as { text: string }[] | undefined) ?? []
  const answer = (payload.answer as number[] | undefined) ?? []
  if (payload.bins === true) {
    return options
      .map((bin, index) => {
        const held = stored.filter((_, i) => answer[i] === index)
        const names = held.map((entry) => entry.text ?? entry.icon ?? '')
        return `${bin.text}: ${names.length === 0 ? 'none' : names.join(', ')}`
      })
      .join('; ')
  }
  const pairs = stored.map(
    (entry, i) => `${entry.text ?? entry.icon ?? ''} → ${options[answer[i] ?? -1]?.text ?? ''}`,
  )
  const left = options.filter((_, i) => !answer.includes(i)).map((entry) => entry.text)
  return left.length === 0 ? pairs.join(', ') : `${pairs.join(', ')}; left over: ${left.join(', ')}`
}
