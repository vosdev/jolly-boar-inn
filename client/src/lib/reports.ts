/**
 * What a player may report wrong with a pack question, and how the operator's queue reads
 * it back (`server/app/reports.py`).
 *
 * A report names a mode, then one of its questions, or for a price mode an item from the
 * roster, since those questions are generated afresh from it. "Something else" names
 * neither. The form shows on Home beside the suggestions, under the same rule: once this
 * browser has finished a game.
 *
 * A question's id is a hash of its content, so a fixed question has a new one. The queue
 * shows the snapshot the report was filed against, and says whether the pack still has it.
 */

import { MODES } from './modes'

/** `TEXT_MAX` on the server, counted in characters. */
export const REPORT_TEXT_MAX = 500
/** `ITEM_MODES` on the server: reported by item rather than by question. */
export const ITEM_MODES: readonly string[] = ['more_less', 'price_is_right']

export type ReportStatus = 'open' | 'closed'

export interface ReportChoice {
  id: string | number
  label: string
  /** Who's That NPC?'s: the NPC it shows, an id in the `npcs` list. */
  npc?: number
  /** A random event's: the NPC who asks it. */
  random_event?: string
}

/** What the form's search has picked: a choice, "Something else", or nothing yet. */
export type Picked = ReportChoice | 'other' | null

export interface ReportChoices {
  by: 'question' | 'item'
  choices: ReportChoice[]
}

export interface ReportBody {
  mode: string
  question?: string
  item?: number
  text: string
}

/** A pack question whole, as `/api/admin/questions` and a report's snapshot hold it. */
export interface PackQuestion {
  id: string
  type: string
  mode: string
  payload: Record<string, unknown>
  wiki?: string
  source_url?: string
  random_event?: string
  credit?: string
  credit_shown?: boolean
}

export interface ReportedItem {
  id: number
  name: string
}

/** One row of the operator's queue. */
export interface QueuedReport {
  id: string
  mode: string
  question_id: string | null
  /** The question as filed, the item for a price mode, or null for something else. */
  snapshot: PackQuestion | ReportedItem | null
  text: string
  status: ReportStatus
  created_at: string
}

/** The NPC on a mode's card: a random event is asked by one of them, not the innkeeper. */
export function reportHost(mode: string): string {
  if (mode === 'random_event') return 'sandwich_lady'
  return MODES[mode]?.host.id ?? 'innkeeper'
}

export function reportModeName(mode: string): string {
  if (mode === 'random_event') return 'Random events'
  return MODES[mode]?.label ?? mode
}

export function reportTextProblem(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return 'Required: what is wrong with it.'
  if ([...trimmed].length > REPORT_TEXT_MAX) return `At most ${REPORT_TEXT_MAX} characters.`
  return null
}

export function isItem(snapshot: QueuedReport['snapshot']): snapshot is ReportedItem {
  return snapshot !== null && !('type' in snapshot)
}

/** The wiki's own page for an item id, wherever the item's page is named. */
export function itemWiki(id: number): string {
  return `https://oldschool.runescape.wiki/w/Special:Lookup?type=item&id=${id}`
}

/** Whether a pack question asks about the item: a price question's subject or an option's. */
export function asksAbout(question: PackQuestion, item: number): boolean {
  const asset = `item:${item}`
  const { subject, options } = question.payload as {
    subject?: { asset?: string }
    options?: unknown[]
  }
  if (subject?.asset === asset) return true
  return (options ?? []).some(
    (option) => (option as { subject?: { asset?: string } } | null)?.subject?.asset === asset,
  )
}

interface Subject {
  name: string
}

function str(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** One line for the queue's list: what the form named the question by. */
export function reportSummary(report: QueuedReport): string {
  const { snapshot } = report
  if (snapshot === null) return 'Something else'
  if (isItem(snapshot)) return snapshot.name
  return questionLine(snapshot)
}

/** A question in one line, the way players find it in the form. */
export function questionLine(question: PackQuestion): string {
  const payload = question.payload
  if (question.mode === 'odd_one_out') return (payload.options as string[]).join(', ')
  if (question.mode === 'whos_that_npc') return (payload.subject as Subject).name
  if (question.type === 'price_is_right') return (payload.subject as Subject).name
  if (question.type === 'more_less') {
    const options = payload.options as { subject: Subject }[]
    return options.map((option) => option.subject.name).join(' or ')
  }
  const quote = payload.quote
  return typeof quote === 'string' ? `${str(payload.prompt)} “${quote}”` : str(payload.prompt)
}

/** The right answer, as the operator checks it against the wiki. */
export function packAnswer(question: PackQuestion): string {
  const payload = question.payload
  switch (question.type) {
    case 'multiple_choice':
    case 'price_is_right':
      return str((payload.options as unknown[])[payload.answer_index as number])
    case 'more_less': {
      const options = payload.options as { subject: Subject; value: number }[]
      const right = options[payload.answer_index as number]
      return right === undefined ? '' : `${right.subject.name} (${right.value})`
    }
    case 'pick_all_that_apply': {
      const options = payload.options as string[]
      return (payload.answer_indices as number[]).map((index) => options[index]).join(', ')
    }
    case 'ordering': {
      const entries = payload.entries as { text: string }[]
      return (payload.answer as number[]).map((index) => entries[index]?.text).join(' → ')
    }
    case 'free_text':
      return (payload.accepted as string[]).join(' / ')
    case 'closest_number':
      return [str(payload.answer), str(payload.unit)].filter((part) => part !== '').join(' ')
    case 'pick_from_list': {
      const subject = payload.subject as Subject | undefined
      return subject?.name ?? `entry ${str(payload.answer_id)}`
    }
    default:
      return ''
  }
}
