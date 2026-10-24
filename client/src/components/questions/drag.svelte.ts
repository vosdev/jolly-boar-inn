/**
 * Dragging options between places and a tray, by pointer or keyboard: what `ordering` and
 * `matching` share. The type keeps its places (`lib/slots.ts`) and says what a drop does;
 * this keeps what is lifted, where a drag is.
 *
 * A mouse drags the whole row, a finger only its handle, so the rest of the row still
 * scrolls the page. A drag near the window's edge scrolls it. The drop lands on the place
 * or tray nearest the pointer, marked as `data-place` or `data-tray` inside `area`. The
 * handle is a button for the keyboard: Space lifts the row, the arrows move it, Space
 * drops it and Escape puts it back; each move is announced.
 */

import { tick, untrack } from 'svelte'
import { get } from 'svelte/store'

import { msUntil } from '../../lib/clock'
import { toTray, type Slots } from '../../lib/slots'
import type { TypeViewProps } from './props'

/** A place by index, or the tray. */
export type Target = number | 'tray'

export interface Board {
  slots(): Slots
  set(next: Slots): void
  /** Whether rows may move now. */
  movable(): boolean
  /** `shown` dropped on place `at`, from another place or the tray. */
  drop(slots: Slots, shown: number, at: number): Slots
  /** One keyboard step, up (-1) or down (1). */
  step(slots: Slots, shown: number, by: -1 | 1): Slots
  /** The element holding the places and the tray. */
  area(): HTMLElement | undefined
}

/** How close to the window's edge a dragged row scrolls the page. */
const EDGE_PX = 48

export class Dragging {
  /** The row the keyboard holds, and the places as they were when it was lifted. */
  lifted = $state<{ shown: number; before: Slots } | null>(null)
  /** The row under a pointer, and how far it has come. */
  drag = $state<{
    shown: number
    pointer: number
    startX: number
    startY: number
    /** The row's own px per screen px: a room scaled to the window scales its rows. */
    scale: number
    dx: number
    dy: number
  } | null>(null)
  /** Where the dragged row would land. */
  over = $state<Target | null>(null)

  #board: Board

  constructor(board: Board) {
    this.#board = board
  }

  /** Moving a row between places and the tray redraws its handle, which loses focus. */
  async refocus(shown: number): Promise<void> {
    await tick()
    this.#board.area()?.querySelector<HTMLElement>(`[data-handle="${shown}"]`)?.focus()
  }

  key(event: KeyboardEvent, shown: number): void {
    const board = this.#board
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (this.lifted?.shown === shown) {
        this.lifted = null
      } else {
        this.lifted = { shown, before: [...board.slots()] }
      }
    } else if (
      this.lifted?.shown === shown &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault()
      board.set(board.step(board.slots(), shown, event.key === 'ArrowUp' ? -1 : 1))
      void this.refocus(shown)
    } else if (this.lifted?.shown === shown && event.key === 'Escape') {
      event.preventDefault()
      board.set(this.lifted.before)
      this.lifted = null
      void this.refocus(shown)
    }
  }

  /** A lifted row is let go when focus leaves for something else on the page. */
  blur(event: FocusEvent, shown: number): void {
    if (this.lifted?.shown === shown && event.relatedTarget !== null) this.lifted = null
  }

  /** The place or the tray nearest the viewport point (`x`, `y`). */
  targetAt(x: number, y: number): Target | null {
    let best: Target | null = null
    let distance = Infinity
    const found = this.#board.area()?.querySelectorAll<HTMLElement>('[data-place], [data-tray]')
    for (const element of found ?? []) {
      const { top, bottom, left, right } = element.getBoundingClientRect()
      const offY = y < top ? top - y : y > bottom ? y - bottom : 0
      const offX = x < left ? left - x : x > right ? x - right : 0
      const off = Math.hypot(offX, offY)
      if (off < distance) {
        distance = off
        best = element.dataset.place === undefined ? 'tray' : Number(element.dataset.place)
      }
    }
    return best
  }

  grab(event: PointerEvent, shown: number): void {
    if (!this.#board.movable() || event.button !== 0) return
    const target = event.target as Element
    // A button of its own on the row, such as one that sends it back, is pressed, not dragged.
    if (target.closest('button:not(.handle)') !== null) return
    if (event.pointerType !== 'mouse' && target.closest('.handle') === null) return
    event.preventDefault()
    const row = event.currentTarget as HTMLElement
    row.setPointerCapture?.(event.pointerId)
    const drawn = row.getBoundingClientRect().width
    this.lifted = null
    this.drag = {
      shown,
      pointer: event.pointerId,
      startX: event.clientX + window.scrollX,
      startY: event.clientY + window.scrollY,
      scale: row.offsetWidth > 0 && drawn > 0 ? drawn / row.offsetWidth : 1,
      dx: 0,
      dy: 0,
    }
  }

  follow(event: PointerEvent): void {
    const drag = this.drag
    if (drag === null || event.pointerId !== drag.pointer) return
    if (event.clientY < EDGE_PX) window.scrollBy(0, -EDGE_PX / 4)
    else if (event.clientY > window.innerHeight - EDGE_PX) window.scrollBy(0, EDGE_PX / 4)
    drag.dx = (event.clientX + window.scrollX - drag.startX) / drag.scale
    drag.dy = (event.clientY + window.scrollY - drag.startY) / drag.scale
    this.over = this.targetAt(event.clientX, event.clientY)
  }

  release(event: PointerEvent): void {
    if (this.drag === null || event.pointerId !== this.drag.pointer) return
    const { shown } = this.drag
    const target = this.targetAt(event.clientX, event.clientY)
    this.letGo()
    const slots = this.#board.slots()
    if (target === 'tray') this.#board.set(toTray(slots, shown))
    else if (target !== null) this.#board.set(this.#board.drop(slots, shown, target))
  }

  letGo(): void {
    this.drag = null
    this.over = null
  }
}

/** How long before `ends_at` an unsent answer goes, to land before the server stops taking it. */
const EARLY_MS = 1000

/**
 * Sends `answer()` a second before `ends_at` while `waiting()` holds, since the server
 * takes nothing from `ends_at` on: it scores what it can. Call it while the component is
 * set up.
 */
export function sendBeforeEnd(
  waiting: () => boolean,
  timing: () => TypeViewProps['timing'],
  answer: () => unknown,
  send: (value: unknown) => void,
): void {
  $effect(() => {
    const schedule = timing()
    if (!waiting() || schedule === undefined) return
    const left = msUntil(schedule.endsAt, get(schedule.now))
    if (left === 0) return
    const timer = setTimeout(() => send(untrack(answer)), Math.max(0, left - EARLY_MS))
    return () => clearTimeout(timer)
  })
}
