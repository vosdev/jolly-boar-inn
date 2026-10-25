/**
 * What a player may suggest for the packs, and how the operator's queue reads it back
 * (`server/app/suggestions.py`).
 *
 * Two kinds. A `question` is what Create's editor writes, for a mode, with the wiki
 * page that proves it. A player who can't place one sends it with no mode, and the
 * operator picks its round before approving it. An `item` is only a name not on the roster yet: the import script finds its
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
import { INNKEEPER, MODES, UPCOMING_MODES } from './modes'
import { CREDIT_MAX, nameProblem } from './names'
import {
  answerLine as matchingLine,
  previewOf as matchingPreview,
  type MatchingQuestion,
} from './matching'
import { answerLine, previewOf as orderingPreview, type OrderingQuestion } from './ordering'
import type { OpenQuestion, PlayerResult } from './protocol'
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

/**
 * The types a suggestion may be: Create's, an ordering for the rounds that sort and the NPCs,
 * a matching for the rounds that match, text fields only, and a pick from the list for
 * Who's That NPC?.
 */
export type SuggestedType = CustomType | 'ordering' | 'matching' | 'pick_from_list'

export const SUGGESTED_TYPE_LABELS: Record<SuggestedType, string> = {
  ...TYPE_LABELS,
  ordering: 'Put in order',
  matching: 'Match them up',
  pick_from_list: 'Pick from the list',
}

export interface QuestionContent {
  type: SuggestedType
  payload: Record<string, unknown>
  /** The NPC who asks it, for a random event's. */
  random_event?: string
  /** The round it is for, missing until the operator picks one for a question sent without. */
  mode?: string
  /** Where it was checked: either of these, or both. */
  wiki?: string
  source_url?: string
  /** The item a Drop Table question pictures, by name: the import script finds its id. */
  picture_item?: string
  /** How hard it is; none for a random event's, which every room difficulty draws alike. */
  difficulty?: QuestionDifficulty
}

/** A question's tier, as the schema's envelope allows it. */
export type QuestionDifficulty = 'easy' | 'medium' | 'hard'

/** The tiers, easiest first, as the forms offer them. */
export const QUESTION_DIFFICULTIES: { value: QuestionDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

/** Rounds whose questions take no difficulty: `NO_DIFFICULTY_MODES` on the server. */
const NO_DIFFICULTY_ROUNDS = ['random_event']

/** Whether a question for `round` carries a difficulty: a round that has no tier is drawn alike. */
export function takesDifficulty(round: string): boolean {
  return !NO_DIFFICULTY_ROUNDS.includes(round)
}

export function difficultyName(difficulty: QuestionDifficulty): string {
  return QUESTION_DIFFICULTIES.find((option) => option.value === difficulty)?.label ?? difficulty
}

/** The question as players will see it open, drawn by `QuestionStage` or `RandomEvent`. */
export function questionPreview(content: QuestionContent): OpenQuestion {
  const mode = stageMode(content.mode ?? NO_ROUND)
  if (content.type === 'ordering') return orderingPreview(content as OrderingQuestion, mode)
  if (content.type === 'matching') return matchingPreview(content as MatchingQuestion, mode)
  if (content.type === 'pick_from_list') {
    // No picture: there is none until the import finds the NPC's id.
    const open = previewOf({ type: 'multiple_choice', payload: {} }, mode)
    return {
      ...open,
      type: 'pick_from_list',
      view: { prompt: content.payload.prompt, vocab: 'npcs' },
    }
  }
  return previewOf(content as CustomQuestion, mode === 'random_event' ? undefined : mode)
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
  /** False for a question with no round, or one not built yet: no export includes it. */
  playable: boolean
  /** The questions a question looks most like, best first; none for an item. */
  matches?: QueueMatch[]
}

/** A pack question a question being written looks like: named by label, never its answer. */
/** `POST /api/suggestions/try`: the server's open view and reveal, and an answer's result. */
export interface Trial {
  view: Record<string, unknown>
  reveal: Record<string, unknown>
  result: PlayerResult | null
}

export interface SimilarMatch {
  mode: string
  label: string
  /** 0 to 100. */
  score: number
}

/** A question in the packs, or another suggestion, that a queued one looks like: whole. */
export interface QueueMatch {
  score: number
  /** The other suggestion's id, or null for a pack question. */
  suggestion: string | null
  question: QuestionContent
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
  /** Whether a question may carry an explanation: false for `NO_EXPLANATION_MODES` on the server. */
  explanation?: boolean
  /** The question a new one starts with, and whether it may be changed. */
  prompt?: RoundPrompt
  /** How many options a multiple-choice question offers, when the round says: `Mode.options` on the server. */
  options?: readonly [number, number]
  /** Whether only a wiki page proves it: `WIKI_MODES` on the server. */
  wikiOnly?: boolean
  /** Whether it may name an item to picture: `PICTURE_ITEM_MODES` on the server. */
  pictureItem?: boolean
  /**
   * Whether its answer is an NPC's name, which the import looks up: a shadow's
   * (`NAMED_MODES` on the server) or a render's right option (`RENDER_MODES`).
   */
  named?: boolean
  /** What the type picker calls a type, where the round's word says more than the type's. */
  typeLabels?: Partial<Record<SuggestedType, string>>
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
  whos_that_npc: { text: "Who's that NPC?", fixed: true },
}

/** Rounds that take four-button questions, built or not, with `ROUND_TYPES`: `QUESTION_MODES` on the server. */
const CHOICE_ROUNDS = [
  'guess_examine',
  'bestiary',
  'drop_table',
  'odd_one_out',
  'minigame_madness',
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
  bestiary: [
    'multiple_choice',
    'free_text',
    'closest_number',
    'number_slider',
    'pick_all_that_apply',
    'ordering',
    'matching',
  ],
  drop_table: [
    'multiple_choice',
    'free_text',
    'closest_number',
    'number_slider',
    'pick_all_that_apply',
    'matching',
  ],
  minigame_madness: [
    'multiple_choice',
    'free_text',
    'closest_number',
    'number_slider',
    'pick_all_that_apply',
    'ordering',
    'matching',
  ],
  know_your_content_creator: [
    'multiple_choice',
    'closest_number',
    'number_slider',
    'pick_all_that_apply',
  ],
}

/** Rounds that hold their options to a range: `Mode.options` on the server. */
const ROUND_OPTIONS: Record<string, readonly [number, number]> = { guess_examine: [4, 6] }

/** Rounds whose pack holds every question to its wiki page: `WIKI_MODES` on the server. */
const WIKI_ROUNDS = ['guess_examine', 'whos_that_npc']

/** Rounds whose questions may name an item to picture: `PICTURE_ITEM_MODES` on the server. */
const PICTURE_ITEM_ROUNDS = ['drop_table', 'minigame_madness']

/** Rounds that show a quotation under the prompt. */
const QUOTE_ROUNDS = ['who_said_that', 'know_your_content_creator']

/** Rounds whose questions carry no explanation: `NO_EXPLANATION_MODES` on the server. */
export const NO_EXPLANATION_ROUNDS = ['guess_examine', 'whos_that_npc']

/** Rounds whose questions may carry an intro, an NPC's line before the prompt: `INTRO_MODES` on the server. */
export const INTRO_ROUNDS = ['random_event']

/** Rounds whose answer is an NPC's name: `NAMED_MODES` and `RENDER_MODES` on the server. */
const NAMED_ROUNDS = ['whos_that_npc']

/** Rounds that sort: `ordering` questions, the form with its tie boxes. */
const ORDERING_ROUNDS = ['sort_it_out', 'release_order']
/** What a card says to a player thinking of a question, where the round's tagline would not. */
const ORDERING_HINTS: Record<string, string> = {
  sort_it_out: 'Something worth putting in order.',
  release_order: 'Something worth putting in release order.',
}

/**
 * The card for a question that fits no round the player can name. It is no mode: it is
 * stored with none, previewed in no round and presented by the innkeeper.
 */
export const NO_ROUND = 'no_round'

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
    types: [...CUSTOM_TYPES, 'ordering', 'matching'],
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
      explanation: !NO_EXPLANATION_ROUNDS.includes(mode.id),
      prompt: ROUND_PROMPTS[mode.id],
      options: ROUND_OPTIONS[mode.id],
      wikiOnly: WIKI_ROUNDS.includes(mode.id),
      pictureItem: PICTURE_ITEM_ROUNDS.includes(mode.id),
    })),
  ...NAMED_ROUNDS.map(choiceRound)
    .filter((mode) => mode !== undefined)
    .map((mode): Choice => ({
      id: mode.id,
      kind: 'question',
      label: mode.label,
      hint: mode.hint,
      host: mode.host,
      types: ['pick_from_list', 'multiple_choice'],
      prompt: ROUND_PROMPTS[mode.id],
      explanation: !NO_EXPLANATION_ROUNDS.includes(mode.id),
      wikiOnly: WIKI_ROUNDS.includes(mode.id),
      named: true,
      typeLabels: { pick_from_list: 'Shadow', multiple_choice: 'Render' },
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
  {
    id: NO_ROUND,
    kind: 'question',
    label: 'Not sure where it fits',
    hint: 'Any question. The innkeeper picks its round.',
    host: INNKEEPER.id,
    types: [...CUSTOM_TYPES, 'ordering', 'matching'],
  },
]

/**
 * The mode a choice's question is drawn as. A question with no round yet is drawn as the
 * host's own, so its stem prints and the innkeeper asks it.
 */
export function stageMode(choiceId: string): string {
  return choiceId === NO_ROUND ? 'custom' : choiceId
}

/** The choice a stored suggestion was written under. */
export function choiceOf(kind: SuggestionKind, content: SuggestionContent): Choice | undefined {
  const id = kind === 'question' ? ((content as QuestionContent).mode ?? NO_ROUND) : kind
  return CHOICES.find((choice) => choice.id === id)
}

/** Whether a question has its round, without which it can't be approved. */
export function hasRound(kind: SuggestionKind, content: SuggestionContent): boolean {
  return kind !== 'question' || (content as QuestionContent).mode !== undefined
}

/** The rounds the operator may move a question of `type` to: those whose editor offers it. */
export function roundsFor(type: SuggestedType): Choice[] {
  return CHOICES.filter(
    (choice) => choice.kind === 'question' && choice.id !== NO_ROUND && choice.types.includes(type),
  )
}

/**
 * A question as it opens in `round`'s editor. Only an NPC's question keeps its NPC; the rest
 * is left as written, so what the round refuses is the server's to say.
 */
export function placedIn(content: QuestionContent, round: string): QuestionContent {
  const { mode: _mode, random_event: npc, ...rest } = content
  return {
    ...rest,
    ...(round === NO_ROUND ? {} : { mode: round }),
    ...(round === 'random_event' && npc !== undefined ? { random_event: npc } : {}),
  }
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
  return choice.kind === 'question' && choice.id !== NO_ROUND ? choice.id : null
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
  return name.trim() === '' ? 'Required: a name to credit.' : nameProblem(name, CREDIT_MAX)
}

function textProblem(text: string, most: number, what: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return `Required: ${what}.`
  if (codePoints(trimmed) > most) return `At most ${most} characters.`
  return null
}

/** The longest NPC name Who's That NPC? takes: `NPC_NAME_MAX` on the server. */
export const NPC_NAME_MAX = 80

/** `asked` is the names the game already asks about, so one of them is refused before it is sent. */
export function npcNameProblem(name: string, asked: readonly string[] = []): string | null {
  const wanted = fold(name.trim())
  if (wanted !== '' && asked.some((known) => fold(known) === wanted)) return 'Already in the game.'
  return textProblem(name, NPC_NAME_MAX, 'the NPC’s name')
}

/** The item a question pictures, which it need not name. */
export function pictureItemProblem(name: string): string | null {
  return codePoints(name.trim()) > ITEM_NAME_MAX ? `At most ${ITEM_NAME_MAX} characters.` : null
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
  if (type === 'matching') return matchingLine(payload)
  if (type === 'pick_from_list') return (payload.subject as { name: string }).name
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

// --- similar questions ----------------------------------------------------------------

/**
 * What a similarity check depends on: the prompt, any quote and the answer, and Odd One
 * Out's options, which are its question. Null until the prompt and the answer are filled.
 */
export function similarKey(content: QuestionContent): string | null {
  const { type, mode, payload } = content
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  const answer = answerOf({ kind: 'question', content }).trim()
  if (prompt === '' || answer === '') return null
  const options = mode === 'odd_one_out' ? payload.options : null
  return JSON.stringify([type, prompt, payload.quote ?? null, answer, options])
}

/** One line naming a matched question as the operator reads it, without its answer. */
export function matchLine(question: QuestionContent): string {
  const { mode, payload } = question
  if (mode === 'odd_one_out') return (payload.options as string[]).join(', ')
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : ''
  return typeof payload.quote === 'string' ? `${prompt} “${payload.quote}”` : prompt
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
