/**
 * The host's question bank, kept in this browser: every question they wrote or imported,
 * each ticked or not for the room being made, so the ones tried out in one room are there,
 * still ticked, for the next. Each is its own entry, `jbi:own-question:<n>` in bank order,
 * under a count in `jbi:own-questions`: one the rules no longer pass, or that storage
 * mangled, is dropped alone rather than taking the whole bank with it.
 */

import { hostProblems, type HostQuestion } from './customQuestions'
import { dropStored, readStored, writeStored } from './session'

const COUNT_KEY = 'jbi:own-questions'
const QUESTION_PREFIX = 'jbi:own-question:'

/** The most questions a bank holds: a list a host can still scroll through. */
export const BANK_MAX = 100

export interface Banked {
  question: HostQuestion
  /** Whether the room being made asks it. */
  used: boolean
}

/** How many questions were last saved, or 0 for none or a count that is not one. */
function savedCount(): number {
  const count = Number(readStored(COUNT_KEY) ?? 0)
  return Number.isInteger(count) && count > 0 ? count : 0
}

export interface Loaded {
  bank: Banked[]
  /** Saved questions left out because the server would refuse them now. */
  dropped: number
}

function entryOf(text: string | null): Banked | null {
  let entry: unknown
  try {
    entry = JSON.parse(text ?? 'null')
  } catch {
    return null
  }
  if (typeof entry !== 'object' || entry === null) return null
  const { question, used } = entry as Record<string, unknown>
  if (typeof used !== 'boolean' || hostProblems(question).length > 0) return null
  return { question: question as HostQuestion, used }
}

/** The saved bank, in its order, without the questions that no longer pass. */
export function loadBank(): Loaded {
  const bank: Banked[] = []
  const count = Math.min(savedCount(), BANK_MAX)
  for (let at = 0; at < count; at += 1) {
    const entry = entryOf(readStored(QUESTION_PREFIX + at))
    if (entry !== null) bank.push(entry)
  }
  return { bank, dropped: count - bank.length }
}

/** Save `bank`, forgetting any entries saved past its end. */
export function saveBank(bank: readonly Banked[]): void {
  const before = savedCount()
  bank.forEach((entry, at) => {
    const text = JSON.stringify({ question: entry.question, used: entry.used })
    if (readStored(QUESTION_PREFIX + at) !== text) writeStored(QUESTION_PREFIX + at, text)
  })
  for (let at = bank.length; at < before; at += 1) dropStored(QUESTION_PREFIX + at)
  if (bank.length === 0) dropStored(COUNT_KEY)
  else writeStored(COUNT_KEY, String(bank.length))
}

/** Whether two questions are the same, field for field. */
export function sameQuestion(a: HostQuestion, b: HostQuestion): boolean {
  return canonical(a) === canonical(b)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).sort()
    const record = value as Record<string, unknown>
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
