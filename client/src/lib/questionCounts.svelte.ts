/**
 * How many questions the game holds, from `GET /api/question-counts`, for the footer and
 * its sheet. Fetched once per page load and kept: the packs change only on a redeploy. A
 * failed fetch leaves it null, and the footer simply leaves the count out.
 */

import { getQuestionCounts, type QuestionCounts } from './api'
import { modeLabel } from './modes'
import { randomEventFor } from './randomEvents'

export const questionCounts = $state<{ counts: QuestionCounts | null }>({ counts: null })

let loading: Promise<void> | null = null

/** Fetch the counts unless this page already has. */
export function loadQuestionCounts(): Promise<void> {
  loading ??= getQuestionCounts().then(
    (counts) => {
      questionCounts.counts = counts
    },
    () => {
      loading = null
    },
  )
  return loading
}

/** Every round's questions and every NPC's, added up. */
export function totalQuestions(counts: QuestionCounts): number {
  const sum = (byId: Record<string, number>) => Object.values(byId).reduce((a, b) => a + b, 0)
  return sum(counts.modes) + sum(counts.random_events)
}

/** A count as the footer prints it: `1,578`. */
export function formatCount(count: number): string {
  return count.toLocaleString('en-US')
}

export interface CountRow {
  id: string
  label: string
  questions: number
}

/** Rows for the sheet, most questions first, then by label. */
function rows(byId: Record<string, number>, label: (id: string) => string): CountRow[] {
  return Object.entries(byId)
    .map(([id, questions]) => ({ id, label: label(id), questions }))
    .sort((a, b) => b.questions - a.questions || a.label.localeCompare(b.label))
}

/** The rounds, by their labels. */
export function modeRows(counts: QuestionCounts): CountRow[] {
  return rows(counts.modes, modeLabel)
}

/** The NPCs, by the names their cards print. */
export function npcRows(counts: QuestionCounts): CountRow[] {
  return rows(counts.random_events, (id) => randomEventFor(id).name)
}
