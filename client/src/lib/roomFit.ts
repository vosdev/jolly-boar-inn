import { writable } from 'svelte/store'

/**
 * How a room sits in the window (section 8 of ideas/design.md): laid out at one size and
 * scaled as a whole, as the TV is, with the floor round it.
 *
 * At `ROOM` or larger it scales up as a whole. From `ROOM_LEAST` up to `ROOM` it fills the
 * window at its own size, the stage taking what the table leaves. Smaller, it lays out at
 * `ROOM_LEAST` and scales down. It is never wider than 16:9 of the window's height, unless
 * that is narrower than the layout itself; the floor takes the rest. Under `STACK_BELOW`
 * it is not fitted at all: the parts stack, as on a phone.
 */
export const ROOM = { width: 1600, height: 920 }
export const ROOM_LEAST = { width: 1280, height: 640 }
export const STACK_BELOW = 1024

/** The play area's padding round the stage and table, its gap, and the table's width (the column is `tableReveal` wide always, so the stage never changes width). */
export const PLAY = { top: 30, side: 40, bottom: 28, gap: 28, table: 300, tableReveal: 380 }

const WIDEST = 16 / 9

export interface RoomFit {
  /** The scale the room is drawn at. */
  scale: number
  /** The room's own size, in its px, before the scale. */
  width: number
  height: number
  /** Where the scaled room's left edge is in the window, in px. */
  left: number
}

/**
 * How to draw a room in a window `view` px in size whose top `bar` px are the top bar, or
 * null where it stacks.
 */
export function roomFit(view: { width: number; height: number }, bar: number): RoomFit | null {
  if (view.width < STACK_BELOW) return null
  const area = Math.max(1, view.height - bar)
  const scale =
    view.width >= ROOM.width && area >= ROOM.height
      ? Math.min(view.width / ROOM.width, area / ROOM.height)
      : Math.min(1, view.width / ROOM_LEAST.width, area / ROOM_LEAST.height)
  const drawn = Math.min(view.width, Math.max(ROOM.width * scale, WIDEST * view.height))
  return { scale, width: drawn / scale, height: area / scale, left: (view.width - drawn) / 2 }
}

/** The stage's edges in the window, in px, for what hangs at them from outside the room. */
export function stageEdges(fit: RoomFit): { left: number; width: number } {
  return {
    left: fit.left + PLAY.side * fit.scale,
    width: (fit.width - 2 * PLAY.side - PLAY.gap - PLAY.tableReveal) * fit.scale,
  }
}

/** The room as it is drawn now; null outside a room or stacked. */
export const roomShown = writable<{ fit: RoomFit } | null>(null)
