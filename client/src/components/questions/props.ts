/**
 * The props every question component takes.
 *
 * One shape for all of them is what lets `Room.svelte` hold a map from question type to
 * component instead of a chain of `{#if}`s that has to grow with the registry. A
 * component knows what its own `data` means; nothing above it does.
 */

import type { PlayerResult } from '../../lib/protocol'

export interface QuestionProps<Value = unknown> {
  /** `client_view(payload)` while the question is open, `reveal(payload)` after close. */
  data: Record<string, unknown>
  /** Which of the two `data` is. The reveal has the answer in it; the open view does not. */
  revealed: boolean
  /** What we answered, optimistic or acked; null if we have not. */
  yourValue: unknown
  /**
   * False for a `host_only` question, and for our own room question in Phase 2. Stays the
   * question's own `you_can_answer` during the reveal — what the buttons do then is
   * decided by `revealed`, and this stays the reason we were left out.
   */
  canAnswer: boolean
  /** Our row out of `question_closed.results`; null while open, or if we sat it out. */
  result?: PlayerResult | null
  /**
   * Send this answer. `Value` is the component's own answer type — an option index, a
   * string, a number — and defaults to `unknown` so the registry in `index.ts` can hold
   * components that disagree about it: a handler taking `unknown` is usable as one
   * taking an index, which is the direction the registry needs.
   */
  onAnswer: (value: Value) => void
}
