/**
 * What a player may suggest for the packs, and how the operator's queue reads it back
 * (`server/app/suggestions.py`).
 *
 * Two kinds. A `question` is what Create's editor writes, for a mode, with the wiki
 * page that proves it. An `item` is only a name not on the roster yet: the import script finds its
 * id. Every one carries a credit, a name held to a display name's rules, and whether
 * players may see it, which an item's never may: its rounds name no author.
 *
 * The form shows only once this browser has finished a game. That is a courtesy, as
 * Create's room cap is, and clearing storage gets round it; the server's hourly limit is
 * the backstop.
 */

import type { CustomQuestion, CustomType } from './customQuestions'
import { CUSTOM_TYPES, TYPE_LABELS, previewOf } from './customQuestions'
import { pastGames } from './history'
import { MODES, UPCOMING_MODES } from './modes'
import { nameProblem } from './names'
import { answerLine, previewOf as orderingPreview, type OrderingQuestion } from './ordering'
import type { OpenQuestion } from './protocol'
import { codePoints, envelopeProperty, limit } from './questionSchema'
import { RANDOM_EVENTS } from './randomEvents'
import type { ReportChoice } from './reports'
import { fold, type VocabEntry } from './vocab'

/** How many finished games this browser needs before it is offered the form. */
export const SUGGEST_AFTER_GAMES = 1

export function maySuggest(): boolean {
  return pastGames().length >= SUGGEST_AFTER_GAMES
}

export type SuggestionKind = 'question' | 'item'
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'imported'

/** The types a suggestion may be: Create's, and an ordering for the rounds that sort and the NPCs. */
export type SuggestedType = CustomType | 'ordering'

export const SUGGESTED_TYPE_LABELS: Record<SuggestedType, string> = {
  ...TYPE_LABELS,
  ordering: 'Put in order',
}

export interface QuestionContent {
  type: SuggestedType
  payload: Record<string, unknown>
  /** The NPC who asks it, for a random event's. */
  random_event?: string
  mode: string
  /** Where it was checked: either of these, or both. */
  wiki?: string
  source_url?: string
}

/** The question as players will see it open, drawn by `QuestionStage` or `RandomEvent`. */
export function questionPreview(content: QuestionContent): OpenQuestion {
  if (content.type === 'ordering') return orderingPreview(content as OrderingQuestion, content.mode)
  return previewOf(
    content as CustomQuestion,
    content.mode === 'random_event' ? undefined : content.mode,
  )
}

export interface ItemContent {
  name: string
}

export type SuggestionContent = QuestionContent | ItemContent

export interface SuggestionBody {
  kind: SuggestionKind
  content: SuggestionContent
  credit: string
  credit_shown: boolean
}

/** One row of the operator's queue. */
export interface QueuedSuggestion extends SuggestionBody {
  id: string
  status: SuggestionStatus
  created_at: string
  exported_at: string | null
  /** False for a question whose round is not built yet: no export includes it. */
  playable: boolean
}

/** One thing the form offers to write. */
export interface Choice {
  /** The mode a question is for, or the kind itself for an item. */
  id: string
  kind: SuggestionKind
  label: string
  hint: string
  /** The NPC on its card and in its preview. */
  host: string
  /** For a question: the types its editor offers. */
  types: readonly SuggestedType[]
  /** Whether a multiple-choice question may carry a quotation: `QUOTE_MODES` on the server. */
  quote?: boolean
  /** The question a new one starts with, and whether it may be changed. */
  prompt?: RoundPrompt
  /** How many options a multiple-choice question offers, when the round says: `Mode.options` on the server. */
  options?: readonly [number, number]
  /** Whether only a wiki page proves it: `WIKI_MODES` on the server. */
  wikiOnly?: boolean
}

export interface RoundPrompt {
  text: string
  /** `FIXED_PROMPTS` on the server: the round asks only this. */
  fixed: boolean
}

/** What most of a round's questions ask, so a suggestion need not type it. */
const ROUND_PROMPTS: Record<string, RoundPrompt> = {
  who_said_that: { text: 'Who said that?', fixed: false },
  odd_one_out: { text: "Which one doesn't belong?", fixed: true },
}

/** Rounds that take four-button questions, built or not, with `ROUND_TYPES`: `QUESTION_MODES` on the server. */
const CHOICE_ROUNDS = [
  'guess_examine',
  'bestiary',
  'drop_table',
  'odd_one_out',
  'who_said_that',
  'know_your_content_creator',
]

function choiceRound(
  id: string,
): { id: string; label: string; hint: string; host: string } | undefined {
  const built = MODES[id]
  if (built !== undefined) return { id, label: built.label, hint: built.hint, host: built.host.id }
  return UPCOMING_MODES.find((mode) => mode.id === id)
}

/** A round whose editor offers more than four buttons. */
const ROUND_TYPES: Record<string, readonly SuggestedType[]> = {
  bestiary: ['multiple_choice', 'free_text', 'pick_all_that_apply', 'ordering'],
  drop_table: ['multiple_choice', 'free_text', 'closest_number', 'pick_all_that_apply'],
  know_your_content_creator: ['multiple_choice', 'closest_number', 'pick_all_that_apply'],
}

/** Rounds that hold their options to a range: `Mode.options` on the server. */
const ROUND_OPTIONS: Record<string, readonly [number, number]> = { guess_examine: [4, 6] }

/** Rounds whose pack holds every question to its wiki page: `WIKI_MODES` on the server. */
const WIKI_ROUNDS = ['guess_examine']

/** Rounds that show a quotation under the prompt. */
const QUOTE_ROUNDS = ['who_said_that', 'know_your_content_creator']

/** Rounds whose questions may carry an intro, an NPC's line before the prompt: `INTRO_MODES` on the server. */
export const INTRO_ROUNDS = ['random_event']

/** Rounds that sort: `ordering` questions, the form with its tie boxes. */
const ORDERING_ROUNDS = ['sort_it_out', 'release_order']
/** What a card says to a player thinking of a question, where the round's tagline would not. */
const ORDERING_HINTS: Record<string, string> = {
  sort_it_out: 'Something worth putting in order.',
  release_order: 'Something worth putting in release order.',
}

export const CHOICES: readonly Choice[] = [
  {
    id: 'item',
    kind: 'item',
    label: 'A popular item',
    hint: 'For More or Less and The Price is Right.',
    host: 'grand_exchange_clerk',
    types: [],
  },
  {
    id: 'random_event',
    kind: 'question',
    label: 'A random event question',
    hint: 'Asked by an NPC in the middle of a round.',
    host: 'sandwich_lady',
    types: [...CUSTOM_TYPES, 'ordering'],
  },
  ...CHOICE_ROUNDS.map(choiceRound)
    .filter((mode) => mode !== undefined)
    .map((mode): Choice => ({
      id: mode.id,
      kind: 'question',
      label: mode.label,
      hint: mode.hint,
      host: mode.host,
      types: ROUND_TYPES[mode.id] ?? ['multiple_choice'],
      quote: QUOTE_ROUNDS.includes(mode.id),
      prompt: ROUND_PROMPTS[mode.id],
      options: ROUND_OPTIONS[mode.id],
      wikiOnly: WIKI_ROUNDS.includes(mode.id),
    })),
  ...ORDERING_ROUNDS.map(choiceRound)
    .filter((mode) => mode !== undefined)
    .map((mode): Choice => ({
      id: mode.id,
      kind: 'question',
      label: mode.label,
      hint: ORDERING_HINTS[mode.id] ?? mode.hint,
      host: mode.host,
      types: ['ordering'],
    })),
]

/** The choice a stored suggestion was written under. */
export function choiceOf(kind: SuggestionKind, content: SuggestionContent): Choice | undefined {
  const id = kind === 'question' ? (content as QuestionContent).mode : kind
  return CHOICES.find((choice) => choice.id === id)
}

/** The NPC a stored suggestion shows: a random event's own, else its choice's host. */
export function hostOf(kind: SuggestionKind, content: SuggestionContent): string {
  const event = kind === 'question' ? (content as QuestionContent).random_event : undefined
  return event ?? choiceOf(kind, content)?.host ?? 'innkeeper'
}

/** A mode's name as players would read it, built or not. */
export function modeName(mode: string): string {
  return MODES[mode]?.label ?? UPCOMING_MODES.find((m) => m.id === mode)?.label ?? mode
}

// --- what the game already asks -------------------------------------------------------

/** The mode whose pack questions show beside the editor, or null for a card that has none. */
export function existingMode(choice: Choice): string | null {
  return choice.kind === 'question' ? choice.id : null
}

const ROSTER_PLACE = new Map(RANDOM_EVENTS.map((npc, index) => [npc.id, index]))

/** A mode's pack questions as the panel lists them: a random event's by roster, `npc`'s first. */
export function inGameOrder(choices: readonly ReportChoice[], npc: string): ReportChoice[] {
  const place = (choice: ReportChoice): number => {
    const asker = choice.random_event
    if (asker === undefined) return 0
    if (asker === npc) return -1
    return ROSTER_PLACE.get(asker) ?? RANDOM_EVENTS.length
  }
  return [...choices].sort((a, b) => place(a) - place(b))
}

// --- the fields beside a question ------------------------------------------------------

const WIKI = envelopeProperty('wiki')
const WIKI_MAX = limit(WIKI, 'maxLength') ?? 0
const WIKI_PATTERN = new RegExp(String(WIKI.pattern))
/** `ITEM_NAME_MAX` on the server. */
export const ITEM_NAME_MAX = 80

export function wikiProblem(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed === '') return 'Required: the page you checked it on.'
  if (codePoints(trimmed) > WIKI_MAX) return `At most ${WIKI_MAX} characters.`
  if (!WIKI_PATTERN.test(trimmed)) return 'A page on oldschool.runescape.wiki, starting https://.'
  return null
}

const SOURCE_URL = envelopeProperty('source_url')
const SOURCE_URL_MAX = limit(SOURCE_URL, 'maxLength') ?? 0
const SOURCE_URL_PATTERN = new RegExp(String(SOURCE_URL.pattern))

/**
 * A question's two ways of saying where it was checked. Either is enough, since a streamer's
 * words have no wiki page; one that is filled in must still be well formed.
 */
export function sourceProblems(
  wiki: string,
  sourceUrl: string,
): Record<'wiki' | 'source_url' | 'either', string | null> {
  const w = wiki.trim()
  const u = sourceUrl.trim()
  return {
    wiki: w === '' ? null : wikiProblem(w),
    source_url:
      u === ''
        ? null
        : codePoints(u) > SOURCE_URL_MAX
          ? `At most ${SOURCE_URL_MAX} characters.`
          : SOURCE_URL_PATTERN.test(u)
            ? null
            : 'A link starting https://.',
    either:
      w === '' && u === ''
        ? 'Required: the wiki page you checked it on, or another https link.'
        : null,
  }
}

export function creditProblem(name: string): string | null {
  return name.trim() === '' ? 'Required: a name to credit.' : nameProblem(name)
}

function textProblem(text: string, most: number, what: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return `Required: ${what}.`
  if (codePoints(trimmed) > most) return `At most ${most} characters.`
  return null
}

/** `roster` is the `items` list, so a name already in the game is refused before it is sent. */
export function itemProblem(
  content: ItemContent,
  roster: readonly VocabEntry[] = [],
): string | null {
  const wanted = fold(content.name.trim())
  if (roster.some((entry) => fold(entry.name) === wanted)) return 'Already in the game.'
  return textProblem(content.name, ITEM_NAME_MAX, 'the item’s name')
}

// --- the queue -------------------------------------------------------------------------

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  imported: 'Imported',
}

/** One line for the queue's list. */
export function summary(suggestion: Pick<SuggestionBody, 'kind' | 'content'>): string {
  if (suggestion.kind === 'item') return (suggestion.content as ItemContent).name
  const prompt = (suggestion.content as QuestionContent).payload.prompt
  return typeof prompt === 'string' ? prompt : ''
}

/** The right answer, as the reviewer checks it against the wiki. */
export function answerOf(suggestion: Pick<SuggestionBody, 'kind' | 'content'>): string {
  if (suggestion.kind === 'item') return (suggestion.content as ItemContent).name
  const { type, payload } = suggestion.content as QuestionContent
  if (type === 'ordering') return answerLine(payload)
  if (type === 'multiple_choice') {
    const options = payload.options as string[]
    return options[payload.answer_index as number] ?? ''
  }
  if (type === 'pick_all_that_apply') {
    const options = payload.options as string[]
    return (payload.answer_indices as number[]).map((index) => options[index] ?? '').join(' / ')
  }
  if (type === 'free_text') return (payload.accepted as string[]).join(' / ')
  return [String(payload.answer), payload.unit].filter((part) => part !== undefined).join(' ')
}

/** "in 23 minutes", for a limit that frees up at `retryAt`. */
export function retryIn(retryAt: string | null, now: number): string {
  if (retryAt === null) return 'later'
  const minutes = Math.max(1, Math.ceil((Date.parse(retryAt) - now) / 60_000))
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`
}

/** Today's file for an export, so two downloads in a day sit side by side. */
export function exportName(status: 'approved' | 'imported', now: Date): string {
  return `suggestions-${status}-${now.toISOString().slice(0, 10)}.json`
}
