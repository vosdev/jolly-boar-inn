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

import type { CustomQuestion, CustomType, FormWording } from './customQuestions'
import { CUSTOM_TYPES, TYPE_LABELS, previewOf } from './customQuestions'
import { pastGames } from './history'
import { WIKI_URL } from './links'
import { DEFAULT_REACH } from './mapBox'
import { HOUSE, MODES, UPCOMING_MODES, modeCopy, type SuggestCard } from './modes'
import { SUGGESTIBLE, rulesOf, suggestRulesOf, type SuggestRules } from './modeRules'
import { nameProblem } from './names'
import {
  answerLine as matchingLine,
  previewOf as matchingPreview,
  type MatchingQuestion,
} from './matching'
import { answerLine, previewOf as orderingPreview, type OrderingQuestion } from './ordering'
import type { PinTarget } from './pins'
import type { OpenQuestion, PlayerResult } from './protocol'
import { codePoints, definition, envelopeProperty, field, limit } from './questionSchema'
import { RANDOM_EVENTS } from './randomEvents'
import type { ReportChoice } from './reports'
import { fold, words, type VocabEntry } from './vocab'

/** How many finished games this browser needs before it is offered the form. */
export const SUGGEST_AFTER_GAMES = 1

export function maySuggest(): boolean {
  return pastGames().length >= SUGGEST_AFTER_GAMES
}

export type SuggestionKind = 'question' | 'item'
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'imported'

/**
 * The types a suggestion may be: Create's, an ordering for the rounds that sort and the NPCs,
 * a matching for the rounds that match, text fields only, a pick from the list for
 * Who's That NPC?, a pin on the map for the rounds that ask for a place and a pin on the
 * suggester's own screenshot.
 */
export type SuggestedType =
  CustomType | 'ordering' | 'matching' | 'pick_from_list' | 'map_pin' | 'picture_pin'

export const SUGGESTED_TYPE_LABELS: Record<SuggestedType, string> = {
  ...TYPE_LABELS,
  ordering: 'Put in order',
  matching: 'Match them up',
  pick_from_list: 'Pick from the list',
  map_pin: 'Pin on the map',
  picture_pin: 'Pin on a picture',
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

/** Whether a question for `round` carries a difficulty: a round that has no tier is drawn alike. */
export function takesDifficulty(round: string): boolean {
  return suggestRulesOf(round)?.difficulty ?? true
}

/** Whether a question for `round` may carry an intro, an NPC's line before the prompt. */
export function takesIntro(round: string): boolean {
  return suggestRulesOf(round)?.intro ?? false
}

export function difficultyName(difficulty: QuestionDifficulty): string {
  return QUESTION_DIFFICULTIES.find((option) => option.value === difficulty)?.label ?? difficulty
}

/**
 * The question as players will see it open, drawn by `QuestionStage` or `RandomEvent`. A
 * picture pin draws `picture`, a URL of the suggester's own picture, which no server names.
 */
export function questionPreview(content: QuestionContent, picture?: string | null): OpenQuestion {
  const mode = stageMode(content.mode ?? NO_ROUND)
  if (content.type === 'ordering') return orderingPreview(content as OrderingQuestion, mode)
  if (content.type === 'matching') return matchingPreview(content as MatchingQuestion, mode)
  if (content.type === 'pick_from_list') {
    // No picture or list: neither exists until the import finds the answer's id.
    const open = previewOf({ type: 'multiple_choice', payload: {} }, mode)
    const clues = content.payload.clues
    return {
      ...open,
      type: 'pick_from_list',
      view: { prompt: content.payload.prompt, ...(Array.isArray(clues) ? { clues } : {}) },
    }
  }
  if (content.type === 'map_pin') {
    const open = previewOf({ type: 'multiple_choice', payload: {} }, mode)
    return { ...open, type: 'map_pin', view: { prompt: content.payload.prompt, pins: 1 } }
  }
  if (content.type === 'picture_pin') {
    const open = previewOf({ type: 'multiple_choice', payload: {} }, mode)
    const { prompt, width, height, grid } = content.payload
    const view = { prompt, width, height, ...(grid === undefined ? {} : { grid }) }
    return { ...open, type: 'picture_pin', view: { ...view, ...(picture ? { picture } : {}) } }
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
  /** A picture pin's own picture, base64, sent once with it: the server stores it apart. */
  picture?: string
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

/**
 * A form of its own: `shadow`, an NPC's name (`named` on the server); `verse`, a verse and
 * the item it describes (`verse`); `place`, a place on the world map, so this server needs
 * its tiles; `picture`, a spot on a screenshot the suggester sends with it; `item`, an item;
 * `riddle`, five clues and the subject they describe (`clued`).
 * `components/suggest/forms.ts` maps each to its component.
 */
export type EditorKind = 'shadow' | 'verse' | 'riddle' | 'place' | 'picture' | 'item'

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
  /** Whether a multiple-choice question may carry a quotation: `quote` on the server. */
  quote?: boolean
  /** Whether a question may carry an explanation: `explanation` on the server. */
  explanation?: boolean
  /** The question a new one starts with, and whether it may be changed. */
  prompt?: RoundPrompt
  /** How many options a multiple-choice question offers, when the round says: `Mode.options` on the server. */
  options?: readonly [number, number]
  /** What the form calls the prompt and the options, where the round turns them round. */
  wording?: FormWording
  /** Whether only a wiki page proves it: `wiki_only` on the server. */
  wikiOnly?: boolean
  /** Whether it may name an item to picture: `picture_item` on the server. */
  pictureItem?: boolean
  /** The form of its own that writes it, where the shared question forms do not. */
  editor?: EditorKind
  /** A line under the question in the shared forms, where the round asks more of it. */
  questionHint?: string
  /** What the type picker calls a type, where the round's word says more than the type's. */
  typeLabels?: Partial<Record<SuggestedType, string>>
}

export interface RoundPrompt {
  text: string
  /** `fixed_prompt` on the server: the round asks only this. */
  fixed: boolean
}

/**
 * The order a type picker offers a round's types in: the shadow before the buttons, as Who's
 * That NPC? asks, then Create's, then the rest.
 */
const TYPE_ORDER: readonly SuggestedType[] = [
  'pick_from_list',
  ...CUSTOM_TYPES,
  'ordering',
  'matching',
  'map_pin',
  'picture_pin',
]

function inTypeOrder(types: readonly string[]): SuggestedType[] {
  return TYPE_ORDER.filter((type) => types.includes(type))
}

/** Rounds whose form names its fields otherwise: on the buttons, ScapeRune plays questions. */
const ROUND_WORDING: Record<string, FormWording> = modeCopy('wording')
const CARDS: Record<string, SuggestCard> = modeCopy('card')

/** What a round's card says and who presents it: its card's own copy, else the mode's. */
function cardCopy(id: string): { label: string; hint: string; host: string } | undefined {
  const card = CARDS[id]
  const built = MODES[id]
  const upcoming = UPCOMING_MODES.find((mode) => mode.id === id)
  const label = card?.label ?? built?.label ?? upcoming?.label
  const hint = card?.hint ?? built?.hint ?? upcoming?.hint
  const host = card?.host ?? built?.host.id ?? upcoming?.host
  if (label === undefined || hint === undefined || host === undefined) return undefined
  return { label, hint, host }
}

/**
 * Which form a round's card opens, and so which fields its choice carries: the shared forms
 * with nothing a round adds (`plain`) for the NPCs' questions and the rounds that only sort.
 */
function formOf(id: string, rules: SuggestRules): Exclude<EditorKind, 'item'> | 'choice' | 'plain' {
  const only = rules.types.length === 1 ? rules.types[0] : undefined
  if (rules.verse) return 'verse'
  if (rules.clued) return 'riddle'
  if (rules.named !== null) return 'shadow'
  if (only === 'map_pin') return 'place'
  if (only === 'picture_pin') return 'picture'
  if (!(rulesOf(id)?.is_round ?? true) || only === 'ordering') return 'plain'
  return 'choice'
}

/** The card for a round a player may suggest for, or undefined for one with no copy. */
function roundChoice(id: string, rules: SuggestRules): Choice | undefined {
  const copy = cardCopy(id)
  if (copy === undefined) return undefined
  const card = CARDS[id]
  const base: Choice = { id, kind: 'question', ...copy, types: inTypeOrder(rules.types) }
  const explanation = rules.explanation
  const prompt: RoundPrompt | undefined =
    rules.fixed_prompt !== null
      ? { text: rules.fixed_prompt, fixed: true }
      : card?.prompt !== undefined
        ? { text: card.prompt, fixed: false }
        : undefined
  switch (formOf(id, rules)) {
    case 'plain':
      return base
    case 'choice':
      return {
        ...base,
        quote: rules.quote,
        explanation,
        prompt,
        options: rulesOf(id)?.options ?? undefined,
        wording: ROUND_WORDING[id],
        wikiOnly: rules.wiki_only,
        pictureItem: rules.picture_item,
      }
    case 'shadow':
      return {
        ...base,
        prompt,
        explanation,
        wikiOnly: rules.wiki_only,
        editor: 'shadow',
        questionHint: "Players see the right answer's render. Name it as the wiki does.",
        typeLabels: { pick_from_list: 'Shadow', multiple_choice: 'Render' },
      }
    case 'verse':
      return { ...base, explanation, editor: 'verse' }
    case 'riddle':
      return { ...base, prompt, explanation, editor: 'riddle' }
    case 'place':
      return { ...base, explanation, wikiOnly: rules.wiki_only, editor: 'place' }
    case 'picture':
      return { ...base, prompt, explanation, editor: 'picture' }
  }
}

/** The rounds a player may suggest for, as cards, in their cards' order. */
const ROUND_CHOICES: Choice[] = [...SUGGESTIBLE]
  .map(([id, rules]) => ({ place: CARDS[id]?.place ?? Infinity, choice: roundChoice(id, rules) }))
  .filter((entry): entry is { place: number; choice: Choice } => entry.choice !== undefined)
  .sort((a, b) => a.place - b.place)
  .map((entry) => entry.choice)

/**
 * The card for a question that fits no round the player can name. It is no mode: it is
 * stored with none, previewed in no round and presented by the house.
 */
export const NO_ROUND = 'no_round'

export const CHOICES: readonly Choice[] = [
  {
    id: 'item',
    kind: 'item',
    label: 'A popular item',
    hint: 'For More or Less, The Price is Right and Pixel Hunt.',
    host: 'grand_exchange_clerk',
    types: [],
    editor: 'item',
  },
  ...ROUND_CHOICES,
  {
    id: NO_ROUND,
    kind: 'question',
    label: 'Not sure where it fits',
    hint: 'Any question. Reldo picks its round.',
    host: HOUSE.id,
    types: [...CUSTOM_TYPES, 'ordering', 'matching'],
  },
]

/**
 * The mode a choice's question is drawn as. A question with no round yet is drawn as the
 * host's own, so its stem prints and the house asks it.
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
 * A question as it opens in `round`'s editor. Only an NPC's question keeps its NPC, and only
 * a round that shows an intro keeps it, since no other editor has a field to take it out. The
 * rest is left as written, so what the round refuses is the server's to say.
 */
export function placedIn(content: QuestionContent, round: string): QuestionContent {
  const { mode: _mode, random_event: npc, payload, ...rest } = content
  const { intro: _intro, ...plain } = payload
  return {
    ...rest,
    payload: takesIntro(round) ? payload : plain,
    ...(round === NO_ROUND ? {} : { mode: round }),
    ...(round === 'random_event' && npc !== undefined ? { random_event: npc } : {}),
  }
}

/** The NPC a stored suggestion shows: a random event's own, else its choice's host. */
export function hostOf(kind: SuggestionKind, content: SuggestionContent): string {
  const event = kind === 'question' ? (content as QuestionContent).random_event : undefined
  return event ?? choiceOf(kind, content)?.host ?? 'house'
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
  return name.trim() === '' ? 'Required: a name to credit.' : nameProblem(name)
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

/** The rungs of a riddle's ladder, vaguest first, as the form labels them. */
export const CLUE_RUNGS = [
  'Vague / atmospheric',
  'Domain / context',
  'Specific trait',
  'Strong giveaway',
  'Punchline',
] as const

/** A clue's limit: the schema's `pick_from_list.clues` items. */
export const CLUE_MAX = 120

/** What is wrong with one of a riddle's clues, or null. */
export function clueProblem(clue: string): string | null {
  return textProblem(clue, CLUE_MAX, 'a clue')
}

/** A verse's limit: the schema's `pick_from_list` prompt. */
export const VERSE_MAX = limit(field('pick_from_list', 'prompt'), 'maxLength') ?? 0

/** What the server's `normalize` keeps of a name, near enough to warn before a send. */
function bareWords(text: string): string {
  return words(text.replace(/\p{P}/gu, '')).join(' ')
}

/** A verse, which may not give away the item it is about. */
export function verseProblem(verse: string, item: string): string | null {
  const name = bareWords(item)
  if (name !== '' && bareWords(verse).includes(name)) return 'The verse gives its answer away.'
  return textProblem(verse, VERSE_MAX, 'a verse')
}

/** The item a verse is about, never a variant such as `Dragon scimitar (or)`. */
export function verseItemProblem(name: string): string | null {
  if (name.includes('(')) return 'Name the plain item, with no variant or dose.'
  return textProblem(name, ITEM_NAME_MAX, 'the item')
}

/** What a verse may be about: the list without its variants and doses. */
export function plainItems(entries: readonly VocabEntry[]): VocabEntry[] {
  return entries.filter((entry) => !entry.name.includes('('))
}

/** Whether `name` is on `entries`, so the preview can be answered from the list. */
export function onList(name: string, entries: readonly VocabEntry[]): boolean {
  const wanted = fold(name.trim())
  return entries.some((entry) => fold(entry.name) === wanted)
}

/** The wiki page an item's name spells, or nothing for no name. */
export function itemPage(name: string): string {
  const trimmed = name.trim()
  return trimmed === '' ? '' : `${WIKI_URL}/w/${encodeURI(trimmed.replaceAll(' ', '_'))}`
}

/** What a place's round asks, from the name a player gives it. */
export function placePrompt(name: string): string {
  return name.trim() === '' ? '' : `Where is ${name.trim()}?`
}

/** The longest name a target takes: the schema's. */
const PLACE_MAX = limit(definition('short_text'), 'maxLength') ?? 0

export function placeProblem(name: string): string | null {
  return textProblem(name, PLACE_MAX, 'the place’s name')
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

// --- steps in the suggestion form ------------------------------------------------------

/** One step in the editor's progress line and step cards. */
export interface SuggestStep {
  title: string
  optional?: boolean
  done: boolean
  missing?: boolean
}

/** Whether a choice asks where it was checked: an item is held to the roster, a picture is its own proof. */
export function needsSource(choice: Choice): boolean {
  return choice.kind !== 'item' && choice.editor !== 'picture'
}

/** Whether a question choice offers the optional extras card (intro, picture item, or explanation). */
export function hasExtras(choice: Choice): boolean {
  if (choice.kind !== 'question') return false
  return (choice.explanation ?? true) || Boolean(choice.pictureItem) || takesIntro(choice.id)
}

/** The steps a suggestion editor walks through, with their completion and missing state. */
export function stepsFor(state: {
  choice: Choice
  attempted: boolean
  questionDone: boolean
  difficultyDone?: boolean
  extrasFilled: boolean
  extrasValid: boolean
  sourceDone: boolean
  creditDone: boolean
}): SuggestStep[] {
  const {
    choice,
    attempted,
    questionDone,
    difficultyDone = false,
    extrasFilled,
    extrasValid,
    sourceDone,
    creditDone,
  } = state
  if (choice.kind === 'item') {
    return [
      { title: 'Item', done: questionDone, missing: attempted && !questionDone },
      { title: 'Credit', done: creditDone, missing: attempted && !creditDone },
    ]
  }
  const steps: SuggestStep[] = [
    { title: 'Question', done: questionDone, missing: attempted && !questionDone },
  ]
  if (takesDifficulty(choice.id)) {
    steps.push({
      title: 'Difficulty',
      done: difficultyDone,
      missing: attempted && !difficultyDone,
    })
  }
  if (hasExtras(choice)) {
    steps.push({
      title: 'Extras',
      optional: true,
      done: extrasFilled && extrasValid,
      missing: attempted && !extrasValid,
    })
  }
  if (needsSource(choice)) {
    steps.push({
      title: choice.wikiOnly ? 'Wiki page' : 'Source',
      done: sourceDone,
      missing: attempted && !sourceDone,
    })
  }
  steps.push({ title: 'Credit', done: creditDone, missing: attempted && !creditDone })
  return steps
}

// --- the queue -------------------------------------------------------------------------

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  imported: 'Imported',
}

/** One line for the queue's list. A fixed prompt tells questions apart by nothing, so those show what differs. */
export function summary(suggestion: Pick<SuggestionBody, 'kind' | 'content'>): string {
  if (suggestion.kind === 'item') return (suggestion.content as ItemContent).name
  const content = suggestion.content as QuestionContent
  if (rulesOf(content.mode ?? NO_ROUND)?.report === 'npc') return answerOf(suggestion)
  return matchLine(content)
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
  if (type === 'map_pin') {
    const [place] = payload.targets as PinTarget[]
    if (place === undefined) return ''
    const box = `x ${place.min_x}–${place.max_x}, y ${place.min_y}–${place.max_y}`
    const reach = payload.reach ?? DEFAULT_REACH
    return `${place.name} (${box}, reach ${String(reach)})`
  }
  if (type === 'picture_pin') return pictureAnswer(payload)
  return [String(payload.answer), payload.unit].filter((part) => part !== undefined).join(' ')
}

const percent = (fraction: unknown): string => `${Math.round(Number(fraction) * 100)}%`

function pictureAnswer(payload: Record<string, unknown>): string {
  const cells = payload.cells as { col: number; row: number }[] | undefined
  if (cells !== undefined) {
    const grid = payload.grid as { cols: number; rows: number }
    const named = cells.map((cell) => `column ${cell.col + 1} row ${cell.row + 1}`)
    return `${named.join(', ')} of ${grid.cols} by ${grid.rows}`
  }
  const box = payload.target as { min_x: number; max_x: number; min_y: number; max_y: number }
  const across = `${percent(box.min_x)}–${percent(box.max_x)} across`
  const down = `${percent(box.min_y)}–${percent(box.max_y)} down`
  const reach = payload.reach === 0 ? 'the box only' : `near misses to ${percent(payload.reach)}`
  return `${across}, ${down}, ${reach}`
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
  const options = rulesOf(mode ?? NO_ROUND)?.compare === 'options' ? payload.options : null
  return JSON.stringify([type, prompt, payload.quote ?? null, answer, options])
}

/** One line naming a matched question as the operator reads it, without its answer. */
export function matchLine(question: QuestionContent): string {
  const { mode, payload } = question
  if (rulesOf(mode ?? NO_ROUND)?.report === 'options')
    return (payload.options as string[]).join(', ')
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
