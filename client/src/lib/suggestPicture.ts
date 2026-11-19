/**
 * The picture a `picture_pin` suggestion is drawn on: the suggester's own screenshot, read in
 * the browser to preview and measure it, then sent once as base64 with the suggestion. The
 * server re-encodes it (`app/suggestion_pictures.py`), so these limits only spare a refused
 * upload; it holds the same ones.
 *
 * Every spot is a fraction of the picture, 0 to 1 from its top left, as the type grades it
 * (`lib/picturePins.ts`), so the target stays put when the server shrinks the picture.
 */

import type { WireBounds } from './pins'

export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const PICTURE_MAX_BYTES = 5 * 1024 * 1024
export const PICTURE_MIN_SIDE = 200
/** What the payload names until the server stores the picture under a name of its own. */
export const UPLOAD_NAME = 'screenshot:upload'
/** `reach` for a target near misses score on, of the picture's longer side. */
export const NEAR_REACH = 0.1
/** The smallest box across, of the longer side, as `picture_pin.py` holds it. */
export const LEAST_TARGET = 0.02
export const GRID_MAX = 16

export interface ReadPicture {
  /** An object URL to draw it by, which the caller revokes. */
  url: string
  encoded: string
  width: number
  height: number
}

export interface Cell {
  col: number
  row: number
}

/** What is wrong with `file` as a screenshot before it is opened, or null. */
export function fileProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(PICTURE_TYPES as readonly string[]).includes(file.type))
    return 'That file is not a PNG, JPEG or WebP.'
  if (file.size > PICTURE_MAX_BYTES) return 'That file is over 5 MB.'
  return null
}

/** What is wrong with a picture of this size, or null. */
export function shapeProblem(width: number, height: number): string | null {
  if (Math.min(width, height) < PICTURE_MIN_SIDE)
    return `That picture is under ${PICTURE_MIN_SIDE} pixels on a side.`
  return null
}

function base64Of(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'))
    reader.readAsDataURL(file)
  })
}

function sizeOf(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('unreadable'))
    image.src = url
  })
}

/** `file` ready to preview and send, or why it is not. */
export async function readPicture(file: File): Promise<ReadPicture | string> {
  const problem = fileProblem(file)
  if (problem !== null) return problem
  const url = URL.createObjectURL(file)
  try {
    const [{ width, height }, encoded] = await Promise.all([sizeOf(url), base64Of(file)])
    const shape = shapeProblem(width, height)
    if (shape !== null) {
      URL.revokeObjectURL(url)
      return shape
    }
    return { url, encoded, width, height }
  } catch {
    URL.revokeObjectURL(url)
    return 'That picture could not be read.'
  }
}

const tidy = (fraction: number): number =>
  Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 1000

/** The box two corners span, either way round, in fractions kept to three places. */
export function boxBetween(a: { x: number; y: number }, b: { x: number; y: number }): WireBounds {
  return {
    min_x: tidy(Math.min(a.x, b.x)),
    max_x: tidy(Math.max(a.x, b.x)),
    min_y: tidy(Math.min(a.y, b.y)),
    max_y: tidy(Math.max(a.y, b.y)),
  }
}

/** What is wrong with `box` as a target on a `width` by `height` picture, or null. */
export function boxProblem(box: WireBounds | null, width: number, height: number): string | null {
  if (box === null) return 'Drag a box around the spot.'
  const longer = Math.max(width, height, 1)
  const wide = ((box.max_x - box.min_x) * width) / longer
  const tall = ((box.max_y - box.min_y) * height) / longer
  if (Math.min(wide, tall) < LEAST_TARGET - 1e-9) return 'Make the box a little bigger.'
  return null
}

/** What is wrong with `cells` as the targets on a `cols` by `rows` grid, or null. */
export function cellsProblem(cells: readonly Cell[], cols: number, rows: number): string | null {
  const on = cells.filter((cell) => cell.col < cols && cell.row < rows)
  if (on.length === 0) return 'Tap at least one cell.'
  if (on.length >= cols * rows) return 'Leave at least one cell unpicked.'
  return null
}

/** `cells` with `cell` picked, or unpicked if it was, top left first. */
export function toggleCell(cells: readonly Cell[], cell: Cell): Cell[] {
  const kept = cells.filter((one) => one.col !== cell.col || one.row !== cell.row)
  const next = kept.length === cells.length ? [...cells, cell] : kept
  return next.sort((a, b) => a.row - b.row || a.col - b.col)
}

/** A grid side the form takes: a whole number from 1 to `GRID_MAX`. */
export function gridSide(value: number): number {
  return Number.isFinite(value) ? Math.min(GRID_MAX, Math.max(1, Math.round(value))) : 1
}
