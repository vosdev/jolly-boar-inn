/**
 * The host's own questions, kept in this browser so the ones a host tried out in one room
 * are there for the next. Each question is its own entry, `jbi:own-question:<n>` in
 * list order, under a count in `jbi:own-questions`: one the rules no longer pass, or that storage
 * mangled, is dropped alone rather than taking the whole list with it.
 */

import { hostProblems, type HostQuestion } from './customQuestions'
import { dropStored, readStored, writeStored } from './session'

const COUNT_KEY = 'jbi:own-questions'
const QUESTION_PREFIX = 'jbi:own-question:'

/** How many questions were last saved, or 0 for none or a count that is not one. */
function savedCount(): number {
  const count = Number(readStored(COUNT_KEY) ?? 0)
  return Number.isInteger(count) && count > 0 ? count : 0
}

export interface Loaded {
  questions: HostQuestion[]
  /** Saved questions left out because the server would refuse them now. */
  dropped: number
}

/** The saved questions that still pass, in their saved order. */
export function loadQuestions(): Loaded {
  const questions: HostQuestion[] = []
  let dropped = 0
  const count = savedCount()
  for (let at = 0; at < count; at += 1) {
    let question: unknown
    try {
      question = JSON.parse(readStored(QUESTION_PREFIX + at) ?? 'null')
    } catch {
      question = null
    }
    if (hostProblems(question).length === 0) questions.push(question as HostQuestion)
    else dropped += 1
  }
  return { questions, dropped }
}

/** Save `questions` as the list, forgetting any saved past its end. */
export function saveQuestions(questions: readonly HostQuestion[]): void {
  const before = savedCount()
  questions.forEach((question, at) => {
    const text = JSON.stringify(question)
    if (readStored(QUESTION_PREFIX + at) !== text) writeStored(QUESTION_PREFIX + at, text)
  })
  for (let at = questions.length; at < before; at += 1) dropStored(QUESTION_PREFIX + at)
  if (questions.length === 0) dropStored(COUNT_KEY)
  else writeStored(COUNT_KEY, String(questions.length))
}
