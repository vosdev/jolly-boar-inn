/**
 * The props a type view takes, and the props a stem takes.
 *
 * One shape per half is what lets `index.ts` hold two maps — type to view, stem id to
 * stem — instead of `Question.svelte` growing an `{#if}` per mode. A component knows what
 * its own `data` means; nothing above it does.
 *
 * The two shapes differ on purpose. A stem is what a question is *about* — a sentence, an
 * item, a quote — and it is the same whether you can answer or not, so it gets `data` and
 * whether that is the reveal, and nothing else. In particular it never sees `onAnswer`:
 * the moment a stem can send an answer, Drop Table's item and Who Said That?'s chatbox
 * start growing buttons of their own, and the one place a type's answer is shaped is no
 * longer one place.
 */

import type { PlayerResult } from '../../lib/protocol'

export interface StemProps {
  /** `client_view(payload)` while the question is open, `reveal(payload)` after close. */
  data: Record<string, unknown>
  /** Which of the two `data` is. A stem may say more once the answer is out. */
  revealed: boolean
}

export interface TypeViewProps<Value = unknown> extends StemProps {
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
