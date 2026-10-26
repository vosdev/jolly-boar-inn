import { writable } from 'svelte/store'

/**
 * How a room sits in the window (section 8 of ideas/design.md): laid out at one size and
 * scaled as a whole, as the TV is, with the floor round it.
 *
 * At `ROOM` or larger it scales up as a whole. From `ROOM_LEAST_WIDTH` by `FIT_HEIGHT` up to
 * `ROOM` it lays out at the window's own size, compact under `ROOM.height`. A window short
 * of that draws the room at the largest of `STEPS` that leaves it both, and under the last
 * step scales smoothly. The room is never wider than its stage and table need; the floor
 * takes the rest. Under `STACK_BELOW` it is not fitted at all: the parts stack, as on a phone.
 */
export const ROOM = { width: 1600, height: 920 }
export const ROOM_LEAST_WIDTH = 1280
/** The layout height every mode's tallest screen fits on the compact stage. */
export const FIT_HEIGHT = 760
export const STEPS = [1, 7 / 8, 3 / 4, 5 / 8]
export const STACK_BELOW = 1024

/** The gap between stage and table, the table's width (the column is `tableReveal` wide always, so the stage never changes width), and the widest a stage grows. */
export const PLAY = { gap: 28, table: 300, tableReveal: 380, stageWide: 960 }

/** The play area's padding round the stage and table, at full size and compact. */
export const PADDING = {
  full: { top: 30, side: 40, bottom: 28 },
  compact: { top: 16, side: 32, bottom: 16 },
}

export interface RoomFit {
  /** The scale the room is drawn at. */
  scale: number
  /** The room's own size, in its px, before the scale. */
  width: number
  height: number
  /** Where the scaled room's left edge is in the window, in px. */
  left: number
  /** Laid out under `ROOM.height`: the smaller chathead and padding. */
  compact: boolean
}

/** The scale for a window `width` px wide with `area` px under the bar. */
function scaleFor(width: number, area: number): number {
  if (width >= ROOM.width && area >= ROOM.height) {
    return Math.min(width / ROOM.width, area / ROOM.height)
  }
  const step = STEPS.find((s) => width / s >= ROOM_LEAST_WIDTH && area / s >= FIT_HEIGHT)
  return step ?? Math.min(width / ROOM_LEAST_WIDTH, area / FIT_HEIGHT)
}

/**
 * How to draw a room in a window `view` px in size whose top `bar` px are the top bar, or
 * null where it stacks.
 */
export function roomFit(view: { width: number; height: number }, bar: number): RoomFit | null {
  if (view.width < STACK_BELOW) return null
  const area = Math.max(1, view.height - bar)
  const scale = scaleFor(view.width, area)
  const height = area / scale
  const compact = height < ROOM.height
  const side = (compact ? PADDING.compact : PADDING.full).side
  const widest = 2 * side + PLAY.stageWide + PLAY.gap + PLAY.tableReveal
  const width = Math.min(view.width / scale, widest)
  return { scale, width, height, left: (view.width - width * scale) / 2, compact }
}

/** The stage's edges in the window, in px, for what hangs at them from outside the room. */
export function stageEdges(fit: RoomFit): { left: number; width: number } {
  const side = (fit.compact ? PADDING.compact : PADDING.full).side
  return {
    left: fit.left + side * fit.scale,
    width: (fit.width - 2 * side - PLAY.gap - PLAY.tableReveal) * fit.scale,
  }
}

/** The room as it is drawn now; null outside a room or stacked. */
export const roomShown = writable<{ fit: RoomFit } | null>(null)

/** The frame for the window as it is now; the bar's height is the shell's, from app.css. */
export function measureRoom(): RoomFit | null {
  const root = document.documentElement
  const bar = parseFloat(getComputedStyle(root).getPropertyValue('--topbar-height')) || 56
  return roomFit({ width: root.clientWidth, height: innerHeight }, bar)
}

/** Call `refit` whenever the window's size changes; returns the way to stop. */
export function watchRoomSize(refit: () => void): () => void {
  // A scrollbar coming or going changes the width without resizing the window.
  const watch = new ResizeObserver(refit)
  watch.observe(document.documentElement)
  addEventListener('resize', refit)
  return () => {
    watch.disconnect()
    removeEventListener('resize', refit)
  }
}
