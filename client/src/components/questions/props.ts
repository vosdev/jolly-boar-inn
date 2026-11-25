/**
 * The props a type view takes, and the props a stem takes.
 *
 * One shape per half is what lets `index.ts` hold two maps — type to view, stem id to
 * stem — instead of `Question.svelte` growing an `{#if}` per mode. A component knows what
 * its own `data` means; nothing above it does.
 *
 * The two shapes differ on purpose. A stem is what a question is *about* — a sentence, an
 * item, a quote — and it is the same whether you can answer or not, so it gets `data`,
 * whether that is the reveal and the question's schedule, and nothing else. In particular
 * it never sees `onAnswer`: the moment a stem can send an answer, Drop Table's item and
 * Who Said That?'s chatbox start growing buttons of their own, and the one place a type's
 * answer is shaped is no longer one place.
 */

import type { Readable } from 'svelte/store'

import type { PlayerResult } from '../../lib/protocol'

/** What both halves draw from. */
interface Drawn {
  /** `client_view(payload)` while the question is open, `reveal(payload)` after close. */
  data: Record<string, unknown>
  /** Which of the two `data` is. A stem may say more once the answer is out. */
  revealed: boolean
}

/** The question's schedule, for whatever shows more of itself as time runs out. */
export interface StemTiming {
  /** ISO 8601: when answers open and the clock starts; `opened_at` from an older server. */
  answerableAt: string
  /** ISO 8601: when the question closes. */
  endsAt: string
  /** The server's time in ms (`lib/clock.ts`), which the schedule is counted against. */
  now: Readable<number>
  /** The mode's steps, for a stem that shows a clue a step; null for a mode without. */
  steps?: { build: number; of: number } | null
}

export interface StemProps extends Drawn {
  timing: StemTiming
  /**
   * How many letters of each of the stem's `lines` the scroll has typed (`index.ts`);
   * left out, the stem shows whole.
   */
  shown?: number[]
}

export interface TypeViewProps<Value = unknown> extends Drawn {
  /** What we answered, optimistic or acked; null if we have not. */
  yourValue: unknown
  /**
   * False for a `host_only` question. Stays the
   * question's own `you_can_answer` during the reveal — what the buttons do then is
   * decided by `revealed`, and this stays the reason we were left out.
   */
  canAnswer: boolean
  /** Our row out of `question_closed.results`; null while open, or if we sat it out. */
  result?: PlayerResult | null
  /** Every row of `question_closed.results`, for how the room split; null while open. */
  results?: Record<string, PlayerResult> | null
  /** The question's schedule, for a view that sends what it has before time runs out. */
  timing?: StemTiming
  /** The mode's options are long: one a row on a phone. Only `multiple_choice` reads it. */
  stacked?: boolean
  /** The mode draws the map's icons while open, as every map does at the reveal. Only `map_pin` reads it. */
  mapIcons?: boolean
  /**
   * The options our item took off the question (`OpenQuestion.removed`), struck through and
   * out of reach, open and revealed. Only `multiple_choice` reads it.
   */
  removed?: readonly number[]
  /**
   * Send this answer. `Value` is the component's own answer type — an option index, a
   * string, a number — and defaults to `unknown` so the registry in `index.ts` can hold
   * components that disagree about it: a handler taking `unknown` is usable as one
   * taking an index, which is the direction the registry needs.
   */
  onAnswer: (value: Value) => void
}
