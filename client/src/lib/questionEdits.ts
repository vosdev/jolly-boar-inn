/**
 * The operator's edits of pack questions, in `/admin`'s Questions tab
 * (`server/app/question_edits.py`).
 *
 * An edit never reaches the running server's packs. It waits as a pending change, keyed
 * by the question's id in the packs as they are, until it is downloaded, applied with
 * `make edit-packs` and committed, then marked as applied. Only the payload and the
 * fields an author checks and credits it by are edited; the type, mode, NPC and tags stay.
 */

import { questionLine, type PackQuestion } from './reports'
import { fold } from './vocab'

export type ChangeAction = 'edit' | 'delete'

/** One pending change, as `/api/admin/question-changes` lists it. */
export interface QuestionChange {
  question_id: string
  mode: string
  action: ChangeAction
  /** The question as it will be, its id recomputed; null for a delete. */
  question: PackQuestion | null
  /** The question as the packs held it when the change was made. */
  before: PackQuestion
  updated_at: string
  exported_at: string | null
  /** False once the running packs no longer hold `question_id`, as after a release. */
  in_packs: boolean
}

/** What an edit sends: the fields a question may change, and only the ones it has. */
export interface QuestionEdit {
  payload: Record<string, unknown>
  wiki?: string
  source_url?: string
  credit?: string
  credit_shown?: boolean
}

/** The rounds whose prompt carries a quotation, as `QUOTE_MODES` on the server. */
const QUOTE_MODES = new Set(['who_said_that', 'know_your_content_creator'])

export function showsQuote(mode: string): boolean {
  return QUOTE_MODES.has(mode)
}

/** The envelope fields an edit may change, as `question` has them. */
export function editOf(question: PackQuestion): QuestionEdit {
  const edit: QuestionEdit = { payload: question.payload }
  if (question.wiki !== undefined) edit.wiki = question.wiki
  if (question.source_url !== undefined) edit.source_url = question.source_url
  if (question.credit !== undefined) edit.credit = question.credit
  if (question.credit_shown !== undefined) edit.credit_shown = question.credit_shown
  return edit
}

/** The links and credit as typed into the form: trimmed, and left out when empty. */
export function envelopeOf(fields: {
  wiki: string
  sourceUrl: string
  credit: string
  creditShown: boolean
}): Omit<QuestionEdit, 'payload'> {
  const out: Omit<QuestionEdit, 'payload'> = {}
  const wiki = fields.wiki.trim()
  const source = fields.sourceUrl.trim()
  const credit = fields.credit.trim()
  if (wiki !== '') out.wiki = wiki
  if (source !== '') out.source_url = source
  if (credit !== '') {
    out.credit = credit
    if (fields.creditShown) out.credit_shown = true
  }
  return out
}

/** The questions whose line holds every word of `query`, ignoring case and accents. */
export function searchQuestions(questions: readonly PackQuestion[], query: string): PackQuestion[] {
  const wanted = fold(query).split(/\s+/u).filter(Boolean)
  if (wanted.length === 0) return [...questions]
  return questions.filter((question) => {
    const line = fold(questionLine(question))
    return wanted.every((word) => line.includes(word))
  })
}

/** Today's file for a download, so two in a day sit side by side. */
export function changesFileName(now: Date): string {
  return `question-changes-${now.toISOString().slice(0, 10)}.json`
}

/** A payload typed as JSON, or why it is not one. */
export function parsePayload(text: string): Record<string, unknown> | string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return 'Not valid JSON.'
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'The payload is a JSON object.'
  }
  return parsed as Record<string, unknown>
}
