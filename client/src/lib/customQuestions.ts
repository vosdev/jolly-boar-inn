/**
 * The host's own questions, as Create's editor writes them and `POST /api/rooms` takes
 * them: `{type, payload, random_event?}`, nothing else. The server fills in `id`, `mode`,
 * `source` and `tags` (`server/app/questions/custom.py`), and a content id is not
 * something the browser could reproduce byte for byte, so an export leaves them out too.
 *
 * `problems` refuses what the server would: the schema's limits, read from the schema
 * (`lib/questionSchema.ts`), then each type's `check()` and the storable-text rule, which
 * the schema cannot say. A list only ever holds questions that pass, so the one thing
 * left for submit to refuse is the event cap (`eventSlots`).
 *
 * Only three types are offered. `more_less` and `price_is_right` cannot be events yet, and
 * `pick_from_list` needs vocabulary ids a host does not have.
 */

import type { EventFrequency, OpenQuestion } from './protocol'
import { RANDOM_EVENTS, randomEventFor } from './randomEvents'
import { check, codePoints, envelopeProperty, field, fields, type Problem } from './questionSchema'

export const CUSTOM_TYPES = ['multiple_choice', 'free_text', 'closest_number'] as const
export type CustomType = (typeof CUSTOM_TYPES)[number]

export const TYPE_LABELS: Record<CustomType, string> = {
  multiple_choice: 'Multiple choice',
  free_text: 'Type the answer',
  closest_number: 'Closest number',
}

export interface CustomQuestion {
  type: CustomType
  payload: Record<string, unknown>
  /** The NPC who asks it; left out, the room draws one. */
  random_event?: string
}

const ENVELOPE_KEYS = ['type', 'payload', 'random_event']
const ROSTER = new Set(RANDOM_EVENTS.map((npc) => npc.id))

function isCustomType(value: unknown): value is CustomType {
  return (CUSTOM_TYPES as readonly unknown[]).includes(value)
}

/** `normalize.normalize` on the server: the form two free-text answers are compared in. */
export function normalize(text: string): string {
  const folded = text.normalize('NFKC').toLowerCase()
  return folded.replace(/\p{P}/gu, '').split(/\s+/u).filter(Boolean).join(' ')
}

function at(path: string, message: string, kind: Problem['kind'] = 'limit'): Problem {
  return { path, message, kind }
}

const UNSTORABLE = /\0|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/** `questions/text.py`: strings Postgres will not store, keys included. */
function unstorable(value: unknown, path: string): Problem[] {
  const problem = at(path, 'Holds a character that can’t be stored.')
  if (typeof value === 'string') return UNSTORABLE.test(value) ? [problem] : []
  if (Array.isArray(value)) return value.flatMap((item, i) => unstorable(item, `${path}[${i}]`))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => [
      ...(UNSTORABLE.test(key) ? [problem] : []),
      ...unstorable(item, `${path}.${key}`),
    ])
  }
  return []
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Each type's `check()` in `server/app/questions/types/`. The server runs it only on a
 * payload the schema passed; here it runs on whatever fields are well formed, so a
 * repeated answer shows while the prompt is still empty.
 */
function consistency(type: CustomType, payload: Record<string, unknown>): Problem[] {
  const found: Problem[] = []
  if (type === 'multiple_choice' && strings(payload.options)) {
    const options = payload.options
    const index = payload.answer_index
    if (typeof index === 'number' && index >= options.length) {
      found.push(at('payload.answer_index', 'Pick one of the answers.', 'missing'))
    }
    const seen = new Map<string, number>()
    options.forEach((option, i) => {
      // An empty one is the schema's to report, and blank answers are not a repeat yet.
      if (option === '') return
      const key = option.split(/\s+/u).filter(Boolean).join(' ').toLowerCase()
      const first = seen.get(key)
      if (first === undefined) seen.set(key, i)
      else found.push(at(`payload.options[${i}]`, `Same as answer ${first + 1}.`))
    })
  }
  if (type === 'free_text' && strings(payload.accepted)) {
    const most = field('free_text', 'accepted').items as { maxLength: number }
    payload.accepted.forEach((answer, i) => {
      const normal = normalize(answer)
      const path = `payload.accepted[${i}]`
      if (answer === '') return
      if (normal === '') {
        found.push(at(path, 'Only punctuation and spaces: nothing could match it.'))
      } else if (codePoints(answer) <= most.maxLength && codePoints(normal) > most.maxLength) {
        found.push(at(path, `Over ${most.maxLength} characters once normalised.`))
      }
    })
  }
  return found
}

/** Everything the server would refuse about `question`, or none. */
export function problems(question: unknown): Problem[] {
  if (typeof question !== 'object' || question === null || Array.isArray(question)) {
    return [at('', 'A question is a JSON object.')]
  }
  const raw = question as Record<string, unknown>
  const found: Problem[] = Object.keys(raw)
    .filter((key) => !ENVELOPE_KEYS.includes(key))
    .map((key) =>
      at(key, `“${key}” is not part of a question here: only type, payload and random_event are.`),
    )
  if (!isCustomType(raw.type)) {
    const kind = raw.type === undefined ? 'missing' : 'limit'
    found.push(at('type', `Must be one of ${CUSTOM_TYPES.join(', ')}.`, kind))
    return found
  }
  if ('random_event' in raw) {
    const npc = raw.random_event
    const shape = check(envelopeProperty('random_event'), npc, 'random_event')
    if (shape.length > 0) found.push(...shape)
    else if (!ROSTER.has(npc as string)) {
      found.push(at('random_event', `“${String(npc)}” is not an NPC this game knows.`))
    }
  }
  if (!('payload' in raw)) {
    found.push(at('payload', 'Required.', 'missing'))
    return found
  }
  const payload = raw.payload
  found.push(...check({ $ref: `#/$defs/${raw.type}` }, payload, 'payload'))
  found.push(...unstorable(payload, 'payload'))
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    found.push(...consistency(raw.type, payload as Record<string, unknown>))
  }
  return found
}

// --- The form ------------------------------------------------------------------------

/** One question as the form edits it: text fields as typed, and what it does not edit. */
export interface Draft {
  type: CustomType
  prompt: string
  options: string[]
  answerIndex: number
  accepted: string[]
  maxDistance: number
  /** As typed: a number is only a number once it parses. */
  answer: string
  unit: string
  explanation: string
  /** An NPC id, or '' for the room to draw one. */
  npc: string
  /** Payload fields the form has no control for, such as an imported `image`: kept as they came. */
  extra: Record<string, unknown>
}

const EDITED = new Set([
  'prompt',
  'options',
  'answer_index',
  'accepted',
  'max_distance',
  'answer',
  'unit',
  'explanation',
])

export const MAX_DISTANCE_DEFAULT = field('free_text', 'max_distance').default as number

/** A blank draft, or `question` opened for editing. */
export function draftOf(question?: CustomQuestion): Draft {
  const p = question?.payload ?? {}
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  return {
    type: question?.type ?? 'multiple_choice',
    prompt: text(p.prompt),
    options: Array.isArray(p.options) ? p.options.map(text) : ['', ''],
    answerIndex: typeof p.answer_index === 'number' ? p.answer_index : 0,
    accepted: Array.isArray(p.accepted) ? p.accepted.map(text) : [''],
    maxDistance: typeof p.max_distance === 'number' ? p.max_distance : MAX_DISTANCE_DEFAULT,
    answer: typeof p.answer === 'number' ? String(p.answer) : '',
    unit: text(p.unit),
    explanation: text(p.explanation),
    npc: question?.random_event ?? '',
    extra: Object.fromEntries(Object.entries(p).filter(([key]) => !EDITED.has(key))),
  }
}

/**
 * The question a draft says, trimmed, with empty optional fields left out. Fields of
 * `extra` the type does not have are dropped, so switching type keeps no stray `subject`.
 */
export function questionOf(draft: Draft): CustomQuestion {
  const allowed = new Set(fields(draft.type))
  const payload: Record<string, unknown> = { prompt: draft.prompt.trim() }
  for (const [key, value] of Object.entries(draft.extra)) {
    if (allowed.has(key)) payload[key] = value
  }
  if (draft.type === 'multiple_choice') {
    payload.options = draft.options.map((option) => option.trim())
    payload.answer_index = draft.answerIndex
  } else if (draft.type === 'free_text') {
    payload.accepted = draft.accepted.map((answer) => answer.trim())
    if (draft.maxDistance !== MAX_DISTANCE_DEFAULT) payload.max_distance = draft.maxDistance
  } else {
    const typed = draft.answer.trim()
    const number = Number(typed)
    // Anything that is not a number goes through as typed, so the check names the field.
    if (typed !== '') payload.answer = Number.isFinite(number) ? number : typed
    const unit = draft.unit.trim()
    if (unit !== '') payload.unit = unit
  }
  const explanation = draft.explanation.trim()
  if (explanation !== '') payload.explanation = explanation
  return draft.npc === ''
    ? { type: draft.type, payload }
    : { type: draft.type, payload, random_event: draft.npc }
}

/** What players see while it is open: each type's `client_view` on the server. */
const OPEN_KEYS: Record<CustomType, string[]> = {
  multiple_choice: ['intro', 'prompt', 'image', 'options'],
  free_text: ['intro', 'prompt', 'image'],
  closest_number: ['intro', 'prompt', 'image', 'unit'],
}

/**
 * The question as players will see it open, for a preview: a random event, or with
 * `mode` and no NPC, a question of that round.
 */
export function previewOf(question: CustomQuestion, mode = 'custom'): OpenQuestion {
  // Fixed times, long past and far ahead: a preview rebuilt on every keystroke must never
  // land inside the event's hold, or its answers would blink out while the host types.
  const opened = new Date(0).toISOString()
  const view = Object.fromEntries(
    OPEN_KEYS[question.type]
      .filter((key) => key in question.payload)
      .map((key) => [key, question.payload[key]]),
  )
  return {
    question_id: 'preview',
    index: 0,
    total: 1,
    type: question.type,
    mode,
    segment: { mode, index: 0, total: 1, start: 0, count: 1 },
    view,
    random_event: question.random_event ?? '',
    opened_at: opened,
    answerable_at: opened,
    ends_at: new Date(8.64e15).toISOString(),
    you_can_answer: true,
  }
}

/** Who asks it, as the list shows it. */
export function askedBy(question: CustomQuestion): string {
  const npc = question.random_event
  return npc === undefined ? 'Random NPC' : randomEventFor(npc).name
}

// --- Export and import -----------------------------------------------------------------

export const EXPORT_FILENAME = 'jolly-boar-inn-questions.json'

/** The file Export writes; Import reads it back to the same bytes. */
export function exportText(questions: readonly CustomQuestion[]): string {
  return `${JSON.stringify(questions, null, 2)}\n`
}

const PLACES: Record<string, string> = {
  type: 'type',
  random_event: 'NPC',
  payload: 'question',
  'payload.prompt': 'question',
  'payload.options': 'answers',
  'payload.answer_index': 'correct answer',
  'payload.accepted': 'accepted answers',
  'payload.max_distance': 'typos allowed',
  'payload.answer': 'answer',
  'payload.unit': 'unit',
  'payload.explanation': 'explanation',
  'payload.image': 'picture',
}

/** `payload.options[2]` as a host would say it: "answer 3". */
export function placeName(path: string): string {
  const item = /^payload\.(options|accepted)\[(\d+)\]$/.exec(path)
  if (item !== null) {
    return `${item[1] === 'options' ? 'answer' : 'accepted answer'} ${Number(item[2]) + 1}`
  }
  return PLACES[path] ?? path.replace(/^payload\./, '')
}

export type Imported = { ok: true; questions: CustomQuestion[] } | { ok: false; errors: string[] }

/** A file Export wrote, or what is wrong with it. Nothing is imported unless all of it is. */
export function importText(text: string): Imported {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['This file is not JSON.'] }
  }
  if (!Array.isArray(parsed)) {
    const error = 'This file should be a list of questions, the way Export writes it.'
    return { ok: false, errors: [error] }
  }
  const errors = parsed.flatMap((question, index) =>
    problems(question).map((problem) => {
      const where = problem.path === '' ? '' : `, ${placeName(problem.path)}`
      return `Question ${index + 1}${where}: ${problem.message}`
    }),
  )
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, questions: parsed as CustomQuestion[] }
}

// --- The event cap ---------------------------------------------------------------------

/**
 * `event_windows` in `server/app/rooms/settings.py`, counted: one slot per whole window of
 * `every` round questions, unless every question in it ends its round. `lengths` are the
 * rounds' question counts in the listed order, which is the order the server counts in.
 */
export function eventSlots(lengths: readonly number[], every: number): number {
  const open = lengths.flatMap((length) => Array.from({ length }, (_, at) => at < length - 1))
  let slots = 0
  for (let start = 0; start + every <= open.length; start += every) {
    if (open.slice(start, start + every).some(Boolean)) slots += 1
  }
  return slots
}

export const FREQUENCY_LABELS: Record<EventFrequency, string> = {
  less: 'Less',
  default: 'Default',
  more: 'More',
}

/**
 * Why `count` questions of the host's do not fit, or null when they do. `atMore` is the
 * slot count `more` would give, to say whether it would help.
 */
export function overCap(
  count: number,
  slots: number,
  frequency: EventFrequency,
  atMore: number,
): string | null {
  if (count <= slots) return null
  const events = `${slots} random event${slots === 1 ? '' : 's'}`
  const yours = `${count} question${count === 1 ? '' : 's'}`
  const room = `Your rounds make room for ${events} at ${FREQUENCY_LABELS[frequency]} frequency, and you have ${yours} of your own.`
  const remedy =
    frequency !== 'more' && atMore > slots
      ? ` More frequency would make room for ${atMore}.`
      : ` Add questions to the rounds, or remove ${count - slots} of yours.`
  return room + remedy
}
