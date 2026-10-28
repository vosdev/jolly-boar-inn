/**
 * Pixel Hunt's reveals: one picture built up on a `<canvas>` over the first 17 of the
 * question's 25 seconds, then whole until the answer.
 *
 * Every screen in the room picks the same reveal and seed from the room code and the
 * question's id, with nothing on the wire: the TV, each phone, a reconnect and a restart all
 * draw the same frame at the same server time. Each reveal is a function of the picture,
 * the build-up's progress `p` from 0 to 1 and the seed, so one more is one more entry in
 * `REVEALS`. The picture is whole from `p` = 1 on, whatever the reveal.
 *
 * The browser holds the whole picture from the first frame, so devtools give it away. That
 * is accepted: the server's step scoring is what counts.
 */

/** The share of the answer time the picture builds up over: 17 of 25 seconds. */
export const BUILD_UP = 17 / 25

/** What a question's build-up is drawn from: the room, the question and its schedule. */
export interface Build {
  room: string
  questionId: string
  /** ISO 8601, as `OpenQuestion` carries them. */
  answerableAt: string
  endsAt: string
}

/** The picture a reveal draws from: its pixels, and the image itself to draw it whole. */
export interface Picture {
  width: number
  height: number
  /** RGBA, a row at a time, as `getImageData` gives it. */
  data: Uint8ClampedArray
  image: CanvasImageSource
}

/** The part of a canvas's 2D context the reveals draw with. */
export type Pen = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'drawImage'
  | 'fillRect'
  | 'setTransform'
  | 'fillStyle'
  | 'globalAlpha'
  | 'imageSmoothingEnabled'
>

/** The theme's tile tokens (`--tile` and the rest in `app.css`), as CSS colours. */
export interface Look {
  tile: string
  tileLight: string
  tileDark: string
  tileSeam: string
}

export interface Reveal {
  id: string
  /**
   * Draw `picture` at build-up progress `p`, 0 up to 1, on a cleared canvas of the
   * picture's own size, the same for the same `seed`, in the theme's `look`.
   */
  draw: (pen: Pen, picture: Picture, p: number, seed: number, look: Look) => void
}

/** How far the build-up is at `now`: 0 when answers open, 1 at 17/25 of the way to the end. */
export function progress(answerableAt: number, endsAt: number, now: number): number {
  const span = (endsAt - answerableAt) * BUILD_UP
  if (!(span > 0)) return 1
  return Math.min(1, Math.max(0, (now - answerableAt) / span))
}

/** FNV-1a over `text`: the same 32 bits in every browser. */
function hash(text: string): number {
  let state = 2166136261
  for (const char of text) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0
  return state
}

/** The reveal a question is drawn with and its seed, from the room code and its id. */
export function revealFor(room: string, questionId: string): { reveal: Reveal; seed: number } {
  const key = `${room.toUpperCase()}:${questionId}`
  return { reveal: REVEALS[hash(key) % REVEALS.length]!, seed: hash(`${key}:seed`) }
}

/** One frame: the reveal's while it builds up, the whole picture from `p` = 1. */
export function drawFrame(
  pen: Pen,
  picture: Picture,
  reveal: Reveal,
  p: number,
  seed: number,
  look: Look,
): void {
  pen.setTransform(1, 0, 0, 1, 0, 0)
  pen.globalAlpha = 1
  pen.clearRect(0, 0, picture.width, picture.height)
  if (p >= 1) {
    pen.imageSmoothingEnabled = true
    pen.drawImage(picture.image, 0, 0)
    return
  }
  reveal.draw(pen, picture, Math.max(0, p), seed, look)
  pen.setTransform(1, 0, 0, 1, 0, 0)
  pen.globalAlpha = 1
}

const opaqueCache = new WeakMap<Uint8ClampedArray, number[]>()

/**
 * The centre of an opaque pixel picked by `seed`, as `[x, y]`, or the picture's centre for
 * one with none. Opaque is fully so: an edge's soft pixels could sit over empty background.
 */
export function opaquePixel(picture: Picture, seed: number): [number, number] {
  let opaque = opaqueCache.get(picture.data)
  if (opaque === undefined) {
    opaque = []
    for (let i = 0; i < picture.width * picture.height; i++) {
      if (picture.data[i * 4 + 3] === 255) opaque.push(i)
    }
    opaqueCache.set(picture.data, opaque)
  }
  if (opaque.length === 0) return [picture.width / 2, picture.height / 2]
  const index = opaque[seed % opaque.length]!
  return [(index % picture.width) + 0.5, Math.floor(index / picture.width) + 0.5]
}

/** Zoom out's scale at `p`: 800% down to 100%, by the same factor every moment. */
export function zoomScale(p: number): number {
  return 8 ** (1 - p)
}

/**
 * Zoom out: one smooth pull-back from 800%. The first frame is centred on a seeded opaque
 * pixel, so it never shows empty background; that pixel slides to its own place as the
 * scale comes down, so the last frame is the picture as it is.
 */
export const ZOOM_OUT: Reveal = {
  id: 'zoom_out',
  draw(pen, picture, p, seed) {
    const [x, y] = opaquePixel(picture, seed)
    const scale = zoomScale(p)
    const along = (8 - scale) / 7
    const toX = picture.width / 2 + (x - picture.width / 2) * along
    const toY = picture.height / 2 + (y - picture.height / 2) * along
    pen.imageSmoothingEnabled = true
    pen.setTransform(scale, 0, 0, scale, toX - x * scale, toY - y * scale)
    pen.drawImage(picture.image, 0, 0)
  },
}

/** Pixelate's blocks across, coarse to fine, and the share of the build-up each starts at. */
export const PIXEL_LEVELS: readonly { blocks: number; from: number }[] = [
  { blocks: 4, from: 0 },
  { blocks: 6, from: 0.05 },
  { blocks: 8, from: 0.11 },
  { blocks: 10, from: 0.18 },
  { blocks: 16, from: 0.28 },
  { blocks: 24, from: 0.42 },
  { blocks: 32, from: 0.58 },
  { blocks: 48, from: 0.76 },
]

/** How many blocks across Pixelate shows at `p`. */
export function pixelBlocks(p: number): number {
  let blocks = PIXEL_LEVELS[0]!.blocks
  for (const level of PIXEL_LEVELS) if (p >= level.from) blocks = level.blocks
  return blocks
}

/** The colour of each of `n` by `n` blocks, row by row, as CSS, or null for an empty one. */
export function blockColours(picture: Picture, n: number): (string | null)[] {
  const across = Math.min(n, picture.width)
  const down = Math.min(n, picture.height)
  const colours: (string | null)[] = []
  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let pixels = 0
      const [x0, x1] = edges(column, across, picture.width)
      const [y0, y1] = edges(row, down, picture.height)
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * picture.width + x) * 4
          const alpha = picture.data[at + 3]!
          // Weighted by alpha, so a block's see-through pixels do not darken its colour.
          r += picture.data[at]! * alpha
          g += picture.data[at + 1]! * alpha
          b += picture.data[at + 2]! * alpha
          a += alpha
          pixels++
        }
      }
      colours.push(
        a === 0
          ? null
          : `rgba(${Math.round(r / a)}, ${Math.round(g / a)}, ${Math.round(b / a)}, ${(a / pixels / 255).toFixed(3)})`,
      )
    }
  }
  return colours
}

function edges(index: number, count: number, size: number): [number, number] {
  return [Math.floor((index * size) / count), Math.floor(((index + 1) * size) / count)]
}

const blockCache = new WeakMap<Uint8ClampedArray, Map<number, (string | null)[]>>()

/** Pixelate: hard-edged blocks, 4 across at first and 48 by the last quarter. */
export const PIXELATE: Reveal = {
  id: 'pixelate',
  draw(pen, picture, p) {
    const n = pixelBlocks(p)
    let cached = blockCache.get(picture.data)
    if (cached === undefined) blockCache.set(picture.data, (cached = new Map()))
    let colours = cached.get(n)
    if (colours === undefined) cached.set(n, (colours = blockColours(picture, n)))
    const across = Math.min(n, picture.width)
    const down = Math.min(n, picture.height)
    colours.forEach((colour, index) => {
      if (colour === null) return
      const [x0, x1] = edges(index % across, across, picture.width)
      const [y0, y1] = edges(Math.floor(index / across), down, picture.height)
      pen.fillStyle = colour
      pen.fillRect(x0, y0, x1 - x0, y1 - y0)
    })
  },
}

/** A seeded stream of numbers in [0, 1): mulberry32, the same in every browser. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * A length of the 25-second question, in build-up progress. The fades are timed for the
 * usual pace; a slower one stretches them with everything else.
 */
function seconds(length: number): number {
  return length / (25 * BUILD_UP)
}

/** One cell's box in an `n` by `n` grid over the picture, as `[x, y, width, height]`. */
function cellBox(picture: Picture, n: number, column: number, row: number): number[] {
  const width = picture.width / n
  const height = picture.height / n
  return [column * width, row * height, width, height]
}

/** A tile in the theme's look: its base, a light top-left and dark bottom-right bevel. */
function drawTile(pen: Pen, look: Look, x: number, y: number, width: number, height: number) {
  const bevel = width * 0.05
  pen.fillStyle = look.tile
  pen.fillRect(x, y, width, height)
  pen.fillStyle = look.tileDark
  pen.fillRect(x, y + height - bevel, width, bevel)
  pen.fillRect(x + width - bevel, y, bevel, height)
  pen.fillStyle = look.tileLight
  pen.fillRect(x, y, width, bevel)
  pen.fillRect(x, y, bevel, height)
  drawSeam(pen, look, x, y, width, height)
}

/** The 1px seam just inside a tile's or a piece's edge, in the design's 60px tile. */
function drawSeam(pen: Pen, look: Look, x: number, y: number, width: number, height: number) {
  const seam = width / 60
  pen.fillStyle = look.tileSeam
  pen.fillRect(x, y, width, seam)
  pen.fillRect(x, y + height - seam, width, seam)
  pen.fillRect(x, y, seam, height)
  pen.fillRect(x + width - seam, y, seam, height)
}

/** Tiles across and down. */
export const TILE_GRID = 5

/** How opaque a tile must be on average to hold part of the item. */
export const TILE_THRESHOLD = 0.08

/** How long a tile takes to fade out. */
const TILE_FADE = seconds(0.25)

/** How opaque each tile of an `n` by `n` grid is on average, 0 to 1, row by row. */
export function tileCover(picture: Picture, n: number): number[] {
  const cover: number[] = []
  for (let row = 0; row < n; row++) {
    for (let column = 0; column < n; column++) {
      const [x0, x1] = edges(column, n, picture.width)
      const [y0, y1] = edges(row, n, picture.height)
      let alpha = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) alpha += picture.data[(y * picture.width + x) * 4 + 3]!
      }
      const pixels = (x1 - x0) * (y1 - y0)
      cover.push(pixels === 0 ? 0 : alpha / pixels / 255)
    }
  }
  return cover
}

const coverCache = new WeakMap<Uint8ClampedArray, number[]>()

/** The tiles that hold part of the item, in the order the seed opens them. */
export function tileOrder(picture: Picture, seed: number): number[] {
  let cover = coverCache.get(picture.data)
  if (cover === undefined) coverCache.set(picture.data, (cover = tileCover(picture, TILE_GRID)))
  const order = cover.flatMap((share, cell) => (share > TILE_THRESHOLD ? [cell] : []))
  const next = random(seed)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

/** When each tile starts to open: the item's evenly over the build-up, the rest at its end. */
export function tileOpensAt(order: readonly number[]): number[] {
  const opens = Array.from({ length: TILE_GRID * TILE_GRID }, () => 1 - TILE_FADE)
  order.forEach((cell, index) => (opens[cell] = index / order.length))
  return opens
}

/**
 * Tiles: a 5×5 cover over the picture. The tiles that hold part of the item open one at a
 * time in seeded order, each fading out with no flip; the empty ones go with the end.
 */
export const TILES: Reveal = {
  id: 'tiles',
  draw(pen, picture, p, seed, look) {
    pen.imageSmoothingEnabled = true
    pen.drawImage(picture.image, 0, 0)
    tileOpensAt(tileOrder(picture, seed)).forEach((opensAt, cell) => {
      const left = 1 - clamp01((p - opensAt) / TILE_FADE)
      if (left <= 0) return
      pen.globalAlpha = left
      const [x, y, width, height] = cellBox(
        picture,
        TILE_GRID,
        cell % TILE_GRID,
        Math.floor(cell / TILE_GRID),
      )
      drawTile(pen, look, x!, y!, width!, height!)
    })
    pen.globalAlpha = 1
  },
}

/** The puzzle box's pieces across and down; the bottom-right one is missing. */
export const PUZZLE_GRID = 5

/** How many slides scramble the puzzle box. */
export const PUZZLE_SLIDES = 36

/** The share of a slide's slot it moves in; it rests for the rest. */
const SLIDE_MOVES = 0.6

/** How long the last piece takes to drop in and the seams to fade, ending the build-up. */
const PUZZLE_SETTLE = seconds(0.8)

const HOLE = PUZZLE_GRID * PUZZLE_GRID - 1

/** The slots next to `slot` on the puzzle box. */
function neighbours(slot: number): number[] {
  const row = Math.floor(slot / PUZZLE_GRID)
  const column = slot % PUZZLE_GRID
  const around: number[] = []
  if (row > 0) around.push(slot - PUZZLE_GRID)
  if (row < PUZZLE_GRID - 1) around.push(slot + PUZZLE_GRID)
  if (column > 0) around.push(slot - 1)
  if (column < PUZZLE_GRID - 1) around.push(slot + 1)
  return around
}

/**
 * The seeded scramble, as the hole's slots from the solved box on: 37 of them, each next to
 * the one before, and never back where it was one slide ago.
 */
export function scramble(seed: number): number[] {
  const next = random(seed)
  const holes = [HOLE]
  for (let slide = 0; slide < PUZZLE_SLIDES; slide++) {
    const at = holes[holes.length - 1]!
    const choices = neighbours(at).filter((slot) => slot !== holes[holes.length - 2])
    holes.push(choices[Math.floor(next() * choices.length)]!)
  }
  return holes
}

/** One piece where the playback has it: its own number, and its column and row, maybe between two. */
export interface Placed {
  piece: number
  column: number
  row: number
}

/**
 * The puzzle box at `p`: the scramble played back in reverse up to the settle, each slide
 * eased over the start of its slot. `holes` is the open slot, or with a slide under way,
 * both slots the moving piece spans.
 */
export function puzzleAt(seed: number, p: number): { pieces: Placed[]; holes: number[] } {
  const holes = scramble(seed)
  const board = Array.from({ length: PUZZLE_GRID * PUZZLE_GRID }, (_, slot) =>
    slot === HOLE ? -1 : slot,
  )
  for (let slide = 0; slide < PUZZLE_SLIDES; slide++) {
    board[holes[slide]!] = board[holes[slide + 1]!]!
    board[holes[slide + 1]!] = -1
  }
  const played = clamp01(p / (1 - PUZZLE_SETTLE)) * PUZZLE_SLIDES
  const done = Math.floor(played)
  for (let slide = 0; slide < done; slide++) {
    const to = holes[PUZZLE_SLIDES - slide]!
    const from = holes[PUZZLE_SLIDES - slide - 1]!
    board[to] = board[from]!
    board[from] = -1
  }
  let moving: { from: number; to: number; along: number } | null = null
  if (done < PUZZLE_SLIDES) {
    const along = clamp01((played - done) / SLIDE_MOVES)
    moving = {
      from: holes[PUZZLE_SLIDES - done - 1]!,
      to: holes[PUZZLE_SLIDES - done]!,
      along: along * along * (3 - 2 * along),
    }
  }
  const pieces: Placed[] = []
  board.forEach((piece, slot) => {
    if (piece < 0) return
    let column = slot % PUZZLE_GRID
    let row = Math.floor(slot / PUZZLE_GRID)
    if (moving !== null && slot === moving.from) {
      column += ((moving.to % PUZZLE_GRID) - column) * moving.along
      row += (Math.floor(moving.to / PUZZLE_GRID) - row) * moving.along
    }
    pieces.push({ piece, column, row })
  })
  const open = board.indexOf(-1)
  return { pieces, holes: moving === null ? [open] : [moving.from, moving.to] }
}

/**
 * Slide puzzle: a clue-scroll puzzle box solving itself, its seeded scramble played back
 * in reverse. Solved, the last piece drops in and the seams fade as the build-up ends.
 */
export const SLIDE_PUZZLE: Reveal = {
  id: 'slide_puzzle',
  draw(pen, picture, p, seed, look) {
    const settled = clamp01((p - (1 - PUZZLE_SETTLE)) / PUZZLE_SETTLE)
    const { pieces, holes } = puzzleAt(seed, p)
    const width = picture.width / PUZZLE_GRID
    const height = picture.height / PUZZLE_GRID
    pen.imageSmoothingEnabled = true
    pen.globalAlpha = 1 - settled
    pen.fillStyle = look.tileDark
    for (const slot of holes) {
      pen.fillRect(
        (slot % PUZZLE_GRID) * width,
        Math.floor(slot / PUZZLE_GRID) * height,
        width,
        height,
      )
    }
    for (const { piece, column, row } of pieces) {
      const sourceX = (piece % PUZZLE_GRID) * width
      const sourceY = Math.floor(piece / PUZZLE_GRID) * height
      pen.globalAlpha = 1
      // The hole's colour would show through the see-through parts of a piece over it.
      pen.clearRect(column * width, row * height, width, height)
      pen.drawImage(
        picture.image,
        sourceX,
        sourceY,
        width,
        height,
        column * width,
        row * height,
        width,
        height,
      )
      pen.globalAlpha = 0.8 * (1 - settled)
      drawSeam(pen, look, column * width, row * height, width, height)
    }
    pen.globalAlpha = settled
    const [x, y] = cellBox(picture, PUZZLE_GRID, HOLE % PUZZLE_GRID, Math.floor(HOLE / PUZZLE_GRID))
    if (settled > 0) pen.drawImage(picture.image, x!, y!, width, height, x!, y!, width, height)
    pen.globalAlpha = 1
  },
}

/** The reveals a question may be drawn with. */
export const REVEALS: readonly Reveal[] = [ZOOM_OUT, PIXELATE, TILES, SLIDE_PUZZLE]
