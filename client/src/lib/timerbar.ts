/**
 * What the timer bar under the top bar is counting down, if anything (section 7.2).
 *
 * The bar is drawn by `App.svelte`, directly under `TopBar`, because that is where the
 * design puts it: full width, outside the 42rem column every screen sits in, and sticky
 * under the bar above it. The screen that knows what is being timed is `Room`, three
 * components further in, so Room says what to count here and App draws it. Null draws
 * nothing, and Room clears it on the way out so the bar never outlives the room.
 */

import { writable } from 'svelte/store'

export interface TimerBarState {
  /** ISO 8601, from `question.ends_at` or `room.next_at`. */
  endsAt: string
  /** What a full bar means, in seconds. */
  totalSeconds: number
  /** What the time is for, for a screen reader: "to answer", "to the next question". */
  label: string
  /** Which question of the round this is, as `2/3`, for the tab on the bar's left end. */
  progress?: string
  /** Hang the tabs at the stage's edges with no number to say so: a daily's question. */
  stage?: boolean
  /** What follows, counted down to rather than answered in: "Standings in 6s", quietly. */
  next?: string
  /** The quiet fill alone, the tab plain seconds: the standings, whose panel says what is next. */
  quiet?: boolean
  /** A button in the seconds' place over a full track: a daily's reveal, which waits on Next. */
  action?: TimerBarAction
}

/** The tab a player presses to move on, where nothing is counting. */
export interface TimerBarAction {
  /** What the tab shows: "Next ›". */
  text: string
  /** Its accessible name: "Next question". */
  name: string
  press: () => void
}

export const timerBar = writable<TimerBarState | null>(null)
