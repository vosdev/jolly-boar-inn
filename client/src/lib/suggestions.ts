/**
 * What a player may suggest for the packs, and how the operator's queue reads it back
 * (`server/app/suggestions.py`).
 *
 * Three kinds. A `question` is what Create's editor writes, for a mode, with the wiki
 * page that proves it. An `examine` is a line for Guess the Examine and the name it
 * belongs to. An `item` is only a name not on the roster yet: the import script finds its
 * id. Every one carries a credit, a name held to a display name's rules, and whether
 * players may see it, which an item's never may: its rounds name no author.
 *
 * The form shows only once this browser has finished a game. That is a courtesy, as
 * Create's room cap is, and clearing storage gets round it; the server's hourly limit is
 * the backstop.
 */

import type { CustomQuestion, CustomType } from './customQuestions'
import { CUSTOM_TYPES } from './customQuestions'
import { pastGames } from './history'
import { MODES, UPCOMING_MODES } from './modes'
import { nameProblem } from './names'
import type { OpenQuestion } from './protocol'
import { codePoints, definition, envelopeProperty, limit } from './questionSchema'
import { fold, type VocabEntry } from './vocab'

/** How many finished games this browser needs before it is offered the form. */
export const SUGGEST_AFTER_GAMES = 1

export function maySuggest(): boolean {
  return pastGames().length >= SUGGEST_AFTER_GAMES
}

export type SuggestionKind = 'question' | 'examine' | 'item'
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'imported'

export interface QuestionContent extends CustomQuestion {
  mode: string
  wiki: string
}

export interface ExamineContent {
  name: string
  prompt: string
  wiki: string
}

export interface ItemContent {
  name: string
}

export type SuggestionContent = QuestionContent | ExamineContent | ItemContent

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
  /** The mode a question is for, or the kind itself for an examine or an item. */
  id: string
  kind: SuggestionKind
  label: string
  hint: string
  /** The NPC on its card and in its preview. */
  host: string
  /** For a question: the types its editor offers. */
  types: readonly CustomType[]
}

/** Rounds that take four-button questions, built or not: `QUESTION_MODES` on the server. */
const CHOICE_ROUNDS = [
  'bestiary',
  'drop_table',
  'odd_one_out',
  'who_said_that',
  'know_your_content_creator',
]

function choiceRound(id: string): { id: string; label: string; hint: string; host: string } | undefined {
  const built = MODES[id]
  if (built !== undefined) return { id, label: built.label, hint: built.hint, host: built.host.id }
  return UPCOMING_MODES.find((mode) => mode.id === id)
}

export const CHOICES: readonly Choice[] = [
  {
    id: 'examine',
    kind: 'examine',
    label: 'An examine line',
    hint: 'For Guess the Examine.',
    host: 'examiner',
    types: [],
  },
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
    types: CUSTOM_TYPES,
  },
  ...CHOICE_ROUNDS.map(choiceRound).filter((mode) => mode !== undefined).map(
    (mode): Choice => ({
      id: mode.id,
      kind: 'question',
      label: mode.label,
      hint: mode.hint,
      host: mode.host,
      types: ['multiple_choice'],
    }),
  ),
]

/** The choice a stored suggestion was written under. */
export function choiceOf(kind: SuggestionKind, content: SuggestionContent): Choice | undefined {
  const id = kind === 'question' ? (content as QuestionContent).mode : kind
  return CHOICES.find((choice) => choice.id === id)
}

/** A mode's name as players would read it, built or not. */
export function modeName(mode: string): string {
  return MODES[mode]?.label ?? UPCOMING_MODES.find((m) => m.id === mode)?.label ?? mode
}

// --- the fields beside a question ------------------------------------------------------

const WIKI = envelopeProperty('wiki')
const WIKI_MAX = limit(WIKI, 'maxLength') ?? 0
const WIKI_PATTERN = new RegExp(String(WIKI.pattern))
export const PROMPT_MAX = limit(definition('prompt'), 'maxLength') ?? 0
export const SUBJECT_MAX = limit(definition('short_text'), 'maxLength') ?? 0
/** `ITEM_NAME_MAX` on the server. */
export const ITEM_NAME_MAX = 80

export function wikiProblem(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed === '') return 'Required: the page you checked it on.'
  if (codePoints(trimmed) > WIKI_MAX) return `At most ${WIKI_MAX} characters.`
  if (!WIKI_PATTERN.test(trimmed)) return 'A page on oldschool.runescape.wiki, starting https://.'
  return null
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

export function examineProblems(
  content: ExamineContent,
): Record<'name' | 'prompt' | 'wiki', string | null> {
  return {
    prompt: textProblem(content.prompt, PROMPT_MAX, 'the examine text'),
    name: textProblem(content.name, SUBJECT_MAX, 'what it belongs to'),
    wiki: wikiProblem(content.wiki),
  }
}

/** `roster` is the `items` list, so a name already in the game is refused before it is sent. */
export function itemProblem(content: ItemContent, roster: readonly VocabEntry[] = []): string | null {
  const wanted = fold(content.name.trim())
  if (roster.some((entry) => fold(entry.name) === wanted)) return 'Already in the game.'
  return textProblem(content.name, ITEM_NAME_MAX, 'the item’s name')
}

/** An examine as the round would show it, for `QuestionStage` to draw. */
export function examinePreview(prompt: string): OpenQuestion {
  const opened = new Date(0).toISOString()
  return {
    question_id: 'preview',
    index: 0,
    total: 1,
    type: 'pick_from_list',
    mode: 'guess_examine',
    segment: { mode: 'guess_examine', index: 0, total: 1, start: 0, count: 1 },
    view: { prompt: prompt.trim(), vocab: 'examines' },
    random_event: null,
    opened_at: opened,
    answerable_at: opened,
    ends_at: new Date(8.64e15).toISOString(),
    you_can_answer: true,
  }
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
  if (suggestion.kind === 'examine') {
    const examine = suggestion.content as ExamineContent
    return `“${examine.prompt}” · ${examine.name}`
  }
  const prompt = (suggestion.content as QuestionContent).payload.prompt
  return typeof prompt === 'string' ? prompt : ''
}

/** The right answer, as the reviewer checks it against the wiki. */
export function answerOf(suggestion: Pick<SuggestionBody, 'kind' | 'content'>): string {
  if (suggestion.kind === 'item') return (suggestion.content as ItemContent).name
  if (suggestion.kind === 'examine') return (suggestion.content as ExamineContent).name
  const { type, payload } = suggestion.content as QuestionContent
  if (type === 'multiple_choice') {
    const options = payload.options as string[]
    return options[payload.answer_index as number] ?? ''
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
