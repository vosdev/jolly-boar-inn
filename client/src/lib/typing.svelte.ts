/**
 * The clocks behind the scroll typing itself in (`lib/interlude.ts`): how much of each line
 * shows, and whether a server moment such as `answerable_at` has passed. Each wakes once,
 * at the moment something is due, rather than ticking. They set up effects, so they are
 * made while a component initialises.
 */

import { fromStore } from 'svelte/store'

import { typedAt, type Interlude } from './interlude'
import { serverOffsetMs } from './stores'

/** A run of a line's text, with the class a stem gives a word of it. */
export interface Part {
  text: string
  class?: string
}

/** A line on the scroll: plain text, or runs of it. */
export type Line = string | Part[]

/** A line as runs. */
export function partsOf(line: Line): Part[] {
  return typeof line === 'string' ? [{ text: line }] : line
}

/** How many letters a line types: by code point, so an emoji is one letter, never half. */
export function lettersOf(line: Line): number {
  return partsOf(line).reduce((sum, part) => sum + [...part.text].length, 0)
}

/**
 * A whole millisecond at least: a timer that fires inside the millisecond it was armed
 * in leaves the clock as it was, and then nothing arms the next one.
 */
function wakeIn(ms: number, tick: () => void): () => void {
  const timer = setTimeout(tick, Math.max(1, Math.ceil(ms)))
  return () => clearTimeout(timer)
}

/** A backgrounded tab's timers are throttled; coming back to it should not wait on one. */
function onVisible(tick: () => void): void {
  $effect(() => {
    document.addEventListener('visibilitychange', tick)
    return () => document.removeEventListener('visibilitychange', tick)
  })
}

/**
 * Whether the server's clock has reached `at()`, in ms; never, for NaN. It is measured
 * from the moment the wake-up is armed and not from the last tick: every `pong` moves the
 * offset and arms it again, and the part already waited must not be waited twice.
 */
export class Until {
  #now = $state(Date.now())
  #offset = fromStore(serverOffsetMs)
  #at: () => number
  passed = $derived.by(() => {
    const at = this.#at()
    return !Number.isNaN(at) && at - (this.#now + this.#offset.current) <= 0
  })

  constructor(at: () => number) {
    this.#at = at
    $effect(() => {
      const at = this.#at()
      if (Number.isNaN(at) || this.passed) return
      return wakeIn(at - (Math.max(this.#now, Date.now()) + this.#offset.current), this.#tick)
    })
    onVisible(this.#tick)
  }

  #tick = (): void => {
    this.#now = Date.now()
  }
}

/**
 * How many letters of each of `letters()` lines show, typed by `plan` on this browser's
 * clock from `startedAt`: a letter at a time, each at the moment it is due, whichever line
 * it is in. A line the plan has nothing for shows whole.
 */
export class Typist {
  #now = $state(Date.now())
  #letters: () => number[]
  #plan: Interlude
  #startedAt: number
  shown = $derived.by(() =>
    this.#letters().map((count, i) =>
      typedAt(this.#plan.lines[i], count, this.#now - this.#startedAt),
    ),
  )
  typing = $derived.by(() => this.#letters().some((count, i) => (this.shown[i] ?? 0) < count))

  constructor(letters: () => number[], plan: Interlude, startedAt: number) {
    this.#letters = letters
    this.#plan = plan
    this.#startedAt = startedAt
    $effect(() => {
      if (!this.typing) return
      let due = Infinity
      this.#letters().forEach((count, i) => {
        const typing = this.#plan.lines[i]
        const shown = this.shown[i] ?? 0
        if (typing === undefined || shown >= count) return
        due = Math.min(due, this.#startedAt + typing.from + ((shown + 1) / count) * typing.for)
      })
      return wakeIn(due - Math.max(this.#now, Date.now()), this.#tick)
    })
    onVisible(this.#tick)
  }

  #tick = (): void => {
    this.#now = Date.now()
  }
}
