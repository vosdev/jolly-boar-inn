/**
 * Where a `picture_pin` answer stands on its picture, and what it earned, read off the question.
 *
 * Every position is a fraction of the picture, 0 to 1 from its top left. A tap is measured
 * against the picture's box as the screen draws it (`fractionAt`), so a phone, a desktop and
 * the TV, each drawing it at its own size and the TV scaled on top, send and show the same
 * spot. `questions/types/picture_pin.py` grades the same way: distance on the picture as drawn,
 * in fractions of its longer side, and a grid's tap snapped to its cell.
 * `picturePins.fixture.json` holds both to the same answers.
 */

import { nearestTile, type WireBounds } from './pins'

/** A spot on the picture, in fractions of its width and height. */
export interface Spot {
  x: number
  y: number
}

export interface Grid {
  cols: number
  rows: number
}

export interface Cell {
  col: number
  row: number
}

/** What the open view and the reveal carry; the target, reach and cells only after close. */
export interface PicturePinData {
  prompt?: string
  /** The picture's file under `/pictures/`; missing when this install has not built it. */
  picture?: string
  /** The screenshot's pixels, for its shape. */
  width: number
  height: number
  grid?: Grid
  target?: WireBounds
  reach?: number
  cells?: Cell[]
}

/** The box a picture is drawn in, as `getBoundingClientRect` gives it. */
export interface Drawn {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value))

/** The spot a pointer at `clientX`, `clientY` is on, for a picture drawn in `box`. */
export function fractionAt(clientX: number, clientY: number, box: Drawn): Spot {
  return {
    x: clamp((clientX - box.left) / box.width),
    y: clamp((clientY - box.top) / box.height),
  }
}

/** Where `spot` is drawn, in px, on a picture drawn in `box`. */
export function drawnAt(spot: Spot, box: Drawn): Spot {
  return { x: box.left + spot.x * box.width, y: box.top + spot.y * box.height }
}

/** The cell `spot` falls in; the far edges belong to the last. */
export function cellOf(spot: Spot, grid: Grid): Cell {
  return {
    col: Math.min(Math.floor(spot.x * grid.cols), grid.cols - 1),
    row: Math.min(Math.floor(spot.y * grid.rows), grid.rows - 1),
  }
}

/** The middle of `cell`. */
export function cellMiddle(cell: Cell, grid: Grid): Spot {
  return { x: (cell.col + 0.5) / grid.cols, y: (cell.row + 0.5) / grid.rows }
}

/** What to send for a tap at `spot`: the spot, or on a grid its cell's middle, as the server keeps it. */
export function answerFor(spot: Spot, grid: Grid | undefined): Spot {
  return grid === undefined ? spot : cellMiddle(cellOf(spot, grid), grid)
}

/** A cell's box, in fractions of the picture. */
export function cellBox(cell: Cell, grid: Grid): WireBounds {
  return {
    min_x: cell.col / grid.cols,
    max_x: (cell.col + 1) / grid.cols,
    min_y: cell.row / grid.rows,
    max_y: (cell.row + 1) / grid.rows,
  }
}

/** A `value` as a spot; null for anything else. */
export function spotOf(value: unknown): Spot | null {
  const spot = value as Spot | null
  return typeof spot?.x === 'number' && typeof spot.y === 'number' ? spot : null
}

function scale(data: PicturePinData): Spot {
  const longer = Math.max(data.width, data.height)
  return { x: data.width / longer, y: data.height / longer }
}

/** The target boxes: the one box, or each target cell's. */
export function targetBoxes(data: PicturePinData): WireBounds[] {
  if (data.grid !== undefined) {
    const grid = data.grid
    return (data.cells ?? []).map((cell) => cellBox(cell, grid))
  }
  return data.target === undefined ? [] : [data.target]
}

/** How far `spot` is from `box`, in fractions of the picture's longer side; 0 inside it. */
function offBox(spot: Spot, box: WireBounds, data: PicturePinData): number {
  const to = nearestTile(spot, { ...box, name: '' })
  const across = scale(data)
  return Math.hypot((spot.x - to.x) * across.x, (spot.y - to.y) * across.y)
}

export interface Placed {
  at: Spot
  /** In fractions of the picture's longer side; 0 on the target. */
  off: number
  /** The nearest spot of the target, where the line goes. */
  to: Spot
}

/** `spot` against the nearest target. */
export function placed(spot: Spot, data: PicturePinData): Placed {
  let best: Placed = { at: spot, off: Infinity, to: spot }
  for (const box of targetBoxes(data)) {
    const off = offBox(spot, box, data)
    if (off < best.off) best = { at: spot, off, to: nearestTile(spot, { ...box, name: '' }) }
  }
  return best
}

/** The credit `spot` earns, which `grade` gives too. */
export function pictureCredit(spot: Spot, data: PicturePinData): number {
  if (data.grid !== undefined) {
    const cell = cellOf(spot, data.grid)
    return (data.cells ?? []).some((one) => one.col === cell.col && one.row === cell.row) ? 1 : 0
  }
  const { off } = placed(spot, data)
  const reach = data.reach ?? 0
  if (reach <= 0) return off === 0 ? 1 : 0
  return Math.max(0, 1 - off / reach)
}
