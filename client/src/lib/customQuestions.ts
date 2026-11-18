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
 * Five types are offered here, and `matching` in its own form (`MatchingForm`), text
 * fields only. `more_less` and `price_is_right` cannot be events yet, `pick_from_list`
 * needs vocabulary ids a host does not have, and `ordering` is not offered to hosts.
 */

import { problems as matchingProblems, type MatchingQuestion } from './matching'
import type { EventFrequency, OpenQuestion } from './protocol'
import { ASKERS, randomEventFor } from './randomEvents'
import { check, codePoints, envelopeProperty, field, fields, type Problem } from './questionSchema'
import { defaultScale, middle, onTrack, type Scale } from './slider'

export const CUSTOM_TYPES = [
  'multiple_choice',
  'free_text',
  'closest_number',
  'number_slider',
  'pick_all_that_apply',
] as const
export type CustomType = (typeof CUSTOM_TYPES)[number]

export const TYPE_LABELS: Record<CustomType, string> = {
  multiple_choice: 'Multiple choice',
  free_text: 'Type the answer',
  closest_number: 'Closest number',
  number_slider: 'Slider',
  pick_all_that_apply: 'Pick all that apply',
}

export interface CustomQuestion {
  type: CustomType
  payload: Record<string, unknown>
  /** The NPC who asks it; left out, the room draws one. */
  random_event?: string
}

/** What Create's list holds: a question of this editor's types, or a matching one. */
export type HostQuestion = CustomQuestion | MatchingQuestion

export const HOST_TYPE_LABELS: Record<HostQuestion['type'], string> = {
  ...TYPE_LABELS,
  matching: 'Match them up',
}

/** What Create's list calls `question`: its type's label, or a sort's own. */
export function hostTypeLabel(question: HostQuestion): string {
  return question.payload.bins === true ? 'Sort into bins' : HOST_TYPE_LABELS[question.type]
}

const ENVELOPE_KEYS = ['type', 'payload', 'random_event']
const ROSTER = new Set(ASKERS.map((npc) => npc.id))

function isCustomType(value: unknown): value is CustomType {
  return (CUSTOM_TYPES as readonly unknown[]).includes(value)
}

/** What the form calls a multiple-choice question's prompt and each of its options. */
export interface FormWording {
  prompt: string
  option: string
}

/** `normalize.normalize` on the server: the form two free-text answers are compared in. */
export function normalize(text: string): string {
  const folded = text.normalize('NFKC').toLowerCase()
  return folded.replace(/\p{P}/gu, '').split(/\s+/u).filter(Boolean).join(' ')
}

export function at(path: string, message: string, kind: Problem['kind'] = 'limit'): Problem {
  return { path, message, kind }
}

const UNSTORABLE = /\0|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/** `questions/text.py`: strings Postgres will not store, keys included. */
export function unstorable(value: unknown, path: string): Problem[] {
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
  const choices = type === 'multiple_choice' || type === 'pick_all_that_apply'
  if (choices && strings(payload.options)) {
    const options = payload.options
    const index = payload.answer_index
    if (type === 'multiple_choice' && typeof index === 'number' && index >= options.length) {
      found.push(at('payload.answer_index', 'Pick one of the answers.', 'missing'))
    }
    const right = payload.answer_indices
    if (type === 'pick_all_that_apply' && Array.isArray(right)) {
      if (right.length === 0) {
        found.push(at('payload.answer_indices', 'Tick at least one right answer.', 'missing'))
      } else if (payload.picks === undefined && options.length - new Set(right).size === 1) {
        found.push(
          at(
            'payload.options',
            'One wrong answer is too few: add another, or say how many to tick.',
          ),
        )
      }
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
  if (type === 'number_slider') found.push(...track(payload))
  return found
}

const whole = (value: unknown): value is number => Number.isInteger(value)

/** `number_slider.check()`: a track the slider can draw, and an answer it reaches but does not start on. */
function track(payload: Record<string, unknown>): Problem[] {
  const { min, max, answer, scale } = payload
  if (!whole(min) || !whole(max) || (scale !== 'linear' && scale !== 'log')) return []
  if (scale === 'log' && min < 1) {
    return [at('payload.min', 'A log slider starts at 1 or more.')]
  }
  if (min >= max) return [at('payload.max', 'Must be above the lowest.')]
  const found = (['min', 'max'] as const)
    .filter((key) => !onTrack(payload[key] as number, scale))
    .map((key) => at(`payload.${key}`, 'A log slider takes three significant figures at most.'))
  if (!whole(answer)) return found
  if (!onTrack(answer, scale)) {
    found.push(at('payload.answer', 'A log slider takes three significant figures at most.'))
  } else if (answer <= min || answer >= max) {
    found.push(at('payload.answer', 'Must lie between the lowest and the highest.'))
  } else if (answer === middle(min, max, scale)) {
    found.push(at('payload.answer', 'The slider starts here: move the answer or the ends.'))
  }
  return found
}

/** Everything the server would refuse about a host's `question`, of any type Create writes. */
export function hostProblems(question: unknown): Problem[] {
  const type = (question as { type?: unknown } | null)?.type
  if (type !== 'matching') return problems(question)
  const found = matchingProblems(question)
  const npc = (question as { random_event?: unknown }).random_event
  if (npc !== undefined && !ROSTER.has(npc as string)) {
    found.push(at('random_event', `“${String(npc)}” is not an NPC this game knows.`))
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
  /** A line in the asker's voice before the prompt; only a pack question's form edits it. */
  intro: string
  /** An `item:<id>` or `npc:<id>` picture; only a pack question's form edits it. */
  image: string
  /** Words someone said, for the rounds that show them. */
  quote: string
  options: string[]
  answerIndex: number
  /** The right options of a pick-all-that-apply question. */
  answerIndices: number[]
  /** Whether players are told how many are right: `picks`, always the count ticked. */
  picksShown: boolean
  accepted: string[]
  maxDistance: number
  /** As typed: a number is only a number once it parses. */
  answer: string
  unit: string
  /** A slider's ends, as typed. */
  min: string
  max: string
  /** A slider's scale, or '' to take the one its ends suggest (`defaultScale`). */
  scale: Scale | ''
  /**
   * How far off a closest-number guess still scores, as a share of the answer from
   * `WITHIN_PERCENTS`, or null to keep `withinKept`, a `within` no share gives.
   */
  withinPercent: number | null
  withinKept: number | null
  explanation: string
  /** An NPC id, or '' for the room to draw one. */
  npc: string
  /** Payload fields the form has no control for, such as an imported `subject`: kept as they came. */
  extra: Record<string, unknown>
}

const EDITED = new Set([
  'prompt',
  'intro',
  'image',
  'quote',
  'options',
  'answer_index',
  'answer_indices',
  'picks',
  'accepted',
  'max_distance',
  'answer',
  'unit',
  'min',
  'max',
  'scale',
  'within',
  'explanation',
])

export const MAX_DISTANCE_DEFAULT = field('free_text', 'max_distance').default as number

/** The shares of the answer a closest-number question offers to score within; 0 is exact only. */
export const WITHIN_PERCENTS = [0, 5, 10, 25] as const

/**
 * `within` for `percent` of `answer`, or null for exact only. A whole answer gets a whole
 * `within` of at least 1, so 5% of 13 still lets a guess of 12 score.
 */
export function withinFor(answer: number, percent: number): number | null {
  const share = (Math.abs(answer) * percent) / 100
  if (share === 0) return null
  return Number.isInteger(answer) ? Math.max(1, Math.round(share)) : Number(share.toPrecision(3))
}

/** A blank draft, or `question` opened for editing. */
export function draftOf(question?: CustomQuestion): Draft {
  const p = question?.payload ?? {}
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  return {
    type: question?.type ?? 'multiple_choice',
    prompt: text(p.prompt),
    intro: text(p.intro),
    image: text(p.image),
    quote: text(p.quote),
    options: Array.isArray(p.options) ? p.options.map(text) : ['', ''],
    answerIndex: typeof p.answer_index === 'number' ? p.answer_index : 0,
    answerIndices: Array.isArray(p.answer_indices)
      ? p.answer_indices.filter((index) => typeof index === 'number')
      : [],
    picksShown: typeof p.picks === 'number',
    accepted: Array.isArray(p.accepted) ? p.accepted.map(text) : [''],
    maxDistance: typeof p.max_distance === 'number' ? p.max_distance : MAX_DISTANCE_DEFAULT,
    answer: typeof p.answer === 'number' ? String(p.answer) : '',
    unit: text(p.unit),
    min: typeof p.min === 'number' ? String(p.min) : '',
    max: typeof p.max === 'number' ? String(p.max) : '',
    scale: p.scale === 'linear' || p.scale === 'log' ? p.scale : '',
    ...withinOf(p.answer, p.within),
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
  const intro = draft.intro.trim()
  if (intro !== '') payload.intro = intro
  const image = draft.image.trim()
  if (image !== '') payload.image = image
  if (draft.type === 'multiple_choice') {
    const quote = draft.quote.trim()
    if (quote !== '') payload.quote = quote
    payload.options = draft.options.map((option) => option.trim())
    payload.answer_index = draft.answerIndex
  } else if (draft.type === 'pick_all_that_apply') {
    payload.options = draft.options.map((option) => option.trim())
    payload.answer_indices = [...draft.answerIndices].sort((a, b) => a - b)
    if (draft.picksShown && draft.answerIndices.length > 0) {
      payload.picks = draft.answerIndices.length
    }
  } else if (draft.type === 'free_text') {
    payload.accepted = draft.accepted.map((answer) => answer.trim())
    if (draft.maxDistance !== MAX_DISTANCE_DEFAULT) payload.max_distance = draft.maxDistance
  } else {
    // Anything that is not a number goes through as typed, so the check names the field.
    const put = (key: string, text: string) => {
      const typed = text.trim()
      const number = Number(typed)
      if (typed !== '') payload[key] = Number.isFinite(number) ? number : typed
    }
    put('answer', draft.answer)
    if (draft.type === 'closest_number') {
      const answer = payload.answer
      const within =
        draft.withinPercent === null
          ? draft.withinKept
          : typeof answer === 'number'
            ? withinFor(answer, draft.withinPercent)
            : null
      if (within !== null) payload.within = within
    }
    const unit = draft.unit.trim()
    if (unit !== '') payload.unit = unit
    if (draft.type === 'number_slider') {
      put('min', draft.min)
      put('max', draft.max)
      payload.scale = draft.scale === '' ? scaleFor(draft) : draft.scale
    }
  }
  const explanation = draft.explanation.trim()
  if (explanation !== '') payload.explanation = explanation
  return draft.npc === ''
    ? { type: draft.type, payload }
    : { type: draft.type, payload, random_event: draft.npc }
}

/** A stored `within` as the form offers it: the share that gives it, or kept as it is. */
function withinOf(answer: unknown, within: unknown): Pick<Draft, 'withinPercent' | 'withinKept'> {
  if (typeof within !== 'number') return { withinPercent: 0, withinKept: null }
  const percent =
    typeof answer === 'number'
      ? WITHIN_PERCENTS.find((share) => share > 0 && withinFor(answer, share) === within)
      : undefined
  return percent === undefined
    ? { withinPercent: null, withinKept: within }
    : { withinPercent: percent, withinKept: null }
}

/** The scale a slider's ends suggest, before its author picks one. */
export function scaleFor(draft: Draft): Scale {
  const low = Number(draft.min.trim())
  const high = Number(draft.max.trim())
  return Number.isFinite(low) && Number.isFinite(high) ? defaultScale(low, high) : 'linear'
}

/** What players see while it is open: each type's `client_view` on the server. */
const OPEN_KEYS: Record<CustomType, string[]> = {
  multiple_choice: ['intro', 'prompt', 'quote', 'options'],
  free_text: ['intro', 'prompt'],
  closest_number: ['intro', 'prompt', 'within', 'unit'],
  number_slider: ['intro', 'prompt', 'unit', 'min', 'max', 'scale'],
  pick_all_that_apply: ['intro', 'prompt', 'options', 'picks'],
}

/**
 * The question as players will see it open, for a preview: a random event, or with
 * `mode` and no NPC, a question of that round.
 */
export function previewOf(question: CustomQuestion, mode = 'custom'): OpenQuestion {
  const view = Object.fromEntries(
    OPEN_KEYS[question.type]
      .filter((key) => key in question.payload)
      .map((key) => [key, question.payload[key]]),
  )
  return { ...previewShell(mode, question.random_event ?? ''), type: question.type, view }
}

/** Everything of a preview's `OpenQuestion` but its `type` and `view`: one question alone. */
export function previewShell(
  mode: string,
  randomEvent: OpenQuestion['random_event'],
): Omit<OpenQuestion, 'type' | 'view'> {
  // Fixed times, long past and far ahead: a preview rebuilt on every keystroke must never
  // land inside the event's hold, or its answers would blink out while the host types.
  const opened = new Date(0).toISOString()
  return {
    question_id: 'preview',
    index: 0,
    total: 1,
    mode,
    segment: { mode, index: 0, total: 1, start: 0, count: 1 },
    picture: null,
    random_event: randomEvent,
    opened_at: opened,
    answerable_at: opened,
    ends_at: new Date(8.64e15).toISOString(),
    you_can_answer: true,
    answered: 0,
    of: 0,
    waiting: [],
    item_used: false,
    removed: [],
  }
}

/** Who asks it, as the list shows it. */
export function askedBy(question: HostQuestion): string {
  const npc = question.random_event
  return npc === undefined ? 'Random NPC' : randomEventFor(npc).name
}

// --- Export and import -----------------------------------------------------------------

export const EXPORT_FILENAME = 'jolly-boar-inn-questions.json'

/** The file Export writes; Import reads it back to the same bytes. */
export function exportText(questions: readonly HostQuestion[]): string {
  return `${JSON.stringify(questions, null, 2)}\n`
}

const PLACES: Record<string, string> = {
  type: 'type',
  random_event: 'NPC',
  payload: 'question',
  'payload.prompt': 'question',
  'payload.options': 'answers',
  'payload.answer_index': 'correct answer',
  'payload.answer_indices': 'right answers',
  'payload.picks': 'how many to pick',
  'payload.accepted': 'accepted answers',
  'payload.max_distance': 'typos allowed',
  'payload.answer': 'answer',
  'payload.unit': 'unit',
  'payload.min': 'lowest',
  'payload.max': 'highest',
  'payload.scale': 'slider scale',
  'payload.within': 'scores within',
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

export type Imported = { ok: true; questions: HostQuestion[] } | { ok: false; errors: string[] }

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
    hostProblems(question).map((problem) => {
      const where = problem.path === '' ? '' : `, ${placeName(problem.path)}`
      return `Question ${index + 1}${where}: ${problem.message}`
    }),
  )
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, questions: parsed as HostQuestion[] }
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
