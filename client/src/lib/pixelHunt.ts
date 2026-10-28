/**
 * Pixel Hunt's reveals: one picture built up on a `<canvas>` over the first 17 of the
 * question's 25 seconds, then whole until the answer.
 *
 * Every screen in the room picks the same reveal and seed from the room code and the
 * question's id, with nothing on the wire: the TV, each phone, a reconnect and a restart all
 * draw the same frame at the same server time. Each reveal is a function of the picture,
 * the build-up's progress `p` from 0 to 1 and the seed, so one more is one more entry in
 * `REVEALS`. The box is empty while the host types, each reveal makes its entrance over the
 * first `ENTRY` of the build-up, and the picture is whole from `p` = 1 on, whatever the reveal.
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
  | 'globalCompositeOperation'
  | 'imageSmoothingEnabled'
  | 'createRadialGradient'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineJoin'
  | 'lineCap'
>

/** The theme's colours a reveal draws with (`--tile-dark` and the rest in `app.css`), as CSS. */
export interface Look {
  tileDark: string
  tileSeam: string
  /** Text on a panel: Sketch's lines. */
  ink: string
  /** The verdict's wrong: Sketch's pen tip. */
  bad: string
}

export interface Reveal {
  id: string
  /**
   * Draw `picture` at build-up progress `p`, 0 up to 1, on a cleared canvas of the
   * picture's own size, the same for the same `seed`, in the theme's `look`.
   */
  draw: (pen: Pen, picture: Picture, p: number, seed: number, look: Look) => void
}

/**
 * How far the build-up is at `now`: below 0 while the host types, 0 when answers open, 1 at
 * 17/25 of the way to the end.
 */
export function progress(answerableAt: number, endsAt: number, now: number): number {
  const span = (endsAt - answerableAt) * BUILD_UP
  if (!(span > 0)) return 1
  return Math.min(1, (now - answerableAt) / span)
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

/**
 * One frame: nothing before answers open, so nobody gets a look while the host types; the
 * reveal's while it builds up; the whole picture from `p` = 1.
 */
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
  if (p < 0) return
  if (p >= 1) {
    pen.imageSmoothingEnabled = true
    pen.drawImage(picture.image, 0, 0)
    return
  }
  reveal.draw(pen, picture, p, seed, look)
  pen.setTransform(1, 0, 0, 1, 0, 0)
  pen.globalAlpha = 1
  pen.globalCompositeOperation = 'source-over'
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
 * Zoom out: one smooth pull-back from 800%, fading in as it starts. The first frame is
 * centred on a seeded opaque pixel, so it never shows empty background; that pixel slides
 * to its own place as the scale comes down, so the last frame is the picture as it is.
 */
export const ZOOM_OUT: Reveal = {
  id: 'zoom_out',
  draw(pen, picture, p, seed) {
    pen.globalAlpha = entered(p)
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

/** Pixelate: hard-edged blocks fading in 4 across, and 48 across by the last quarter. */
export const PIXELATE: Reveal = {
  id: 'pixelate',
  draw(pen, picture, p) {
    pen.globalAlpha = entered(p)
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

/** How long a reveal takes to make its entrance once answers open: within the first step. */
export const ENTRY = seconds(0.5)

/** How far the eased share of `length` from `start` is at `p`, 0 to 1. */
function eased(p: number, start: number, length: number): number {
  const along = clamp01((p - start) / length)
  return along * along * (3 - 2 * along)
}

/** How far the entrance is at `p`, eased, 0 to 1. */
export function entered(p: number): number {
  return eased(p, 0, ENTRY)
}

/** The share of `ENTRY` one of `count` tiles or pieces takes to arrive; the rest staggers them. */
const ARRIVAL = 0.4

/** How far the `index`th of `count` tiles or pieces dealt in at the entrance is at `p`, 0 to 1. */
export function arrived(p: number, index: number, count: number): number {
  const stagger = count > 1 ? index / (count - 1) : 0
  return eased(p, stagger * (1 - ARRIVAL) * ENTRY, ARRIVAL * ENTRY)
}

/** `p` on the clock that starts once the entrance is done, still ending at 1. */
function afterEntry(p: number): number {
  return clamp01((p - ENTRY) / (1 - ENTRY))
}

/** One cell's box in an `n` by `n` grid over the picture, as `[x, y, width, height]`. */
function cellBox(picture: Picture, n: number, column: number, row: number): number[] {
  const width = picture.width / n
  const height = picture.height / n
  return [column * width, row * height, width, height]
}

/** The 1px seam just inside a cell's or a piece's edge, in the design's 60px tile. */
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

/** How opaque a cell must be on average to hold part of the item. */
export const TILE_THRESHOLD = 0.08

/** How long a cell takes to fade in. */
const TILE_FADE = seconds(0.25)

/** How long the grid takes to fade, ending the build-up. */
const GRID_SETTLE = seconds(0.8)

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

/**
 * When each tile starts to open: the item's evenly over the build-up after the entrance,
 * the rest at its end.
 */
export function tileOpensAt(order: readonly number[]): number[] {
  const opens = Array.from({ length: TILE_GRID * TILE_GRID }, () => 1 - TILE_FADE)
  order.forEach((cell, index) => (opens[cell] = ENTRY + (1 - ENTRY) * (index / order.length)))
  return opens
}

/**
 * Tiles: a 5×5 grid of seams drawn onto the empty box cell by cell, over nothing but the
 * stage. The cells that hold part of the item then fade in one at a time in seeded order;
 * the empty ones go with the end, and the grid fades as the build-up ends.
 */
export const TILES: Reveal = {
  id: 'tiles',
  draw(pen, picture, p, seed, look) {
    const settled = clamp01((p - (1 - GRID_SETTLE)) / GRID_SETTLE)
    pen.imageSmoothingEnabled = true
    tileOpensAt(tileOrder(picture, seed)).forEach((opensAt, cell) => {
      const [x, y, width, height] = cellBox(
        picture,
        TILE_GRID,
        cell % TILE_GRID,
        Math.floor(cell / TILE_GRID),
      )
      const open = clamp01((p - opensAt) / TILE_FADE)
      if (open > 0) {
        pen.globalAlpha = open
        pen.drawImage(picture.image, x!, y!, width!, height!, x!, y!, width!, height!)
      }
      pen.globalAlpha = 0.8 * arrived(p, cell, TILE_GRID * TILE_GRID) * (1 - settled)
      if (pen.globalAlpha > 0) drawSeam(pen, look, x!, y!, width!, height!)
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
 * The puzzle box at `p`: the scramble played back in reverse from the end of the entrance
 * up to the settle, each slide eased over the start of its slot. `holes` is the open slot, or with a slide under way,
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
  const played = clamp01(afterEntry(p) / afterEntry(1 - PUZZLE_SETTLE)) * PUZZLE_SLIDES
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
 * in reverse. Its pieces drop into the empty box first, row by row, and the hole shows once
 * they are in. Solved, the last piece drops in and the seams fade as the build-up ends.
 */
export const SLIDE_PUZZLE: Reveal = {
  id: 'slide_puzzle',
  draw(pen, picture, p, seed, look) {
    const settled = clamp01((p - (1 - PUZZLE_SETTLE)) / PUZZLE_SETTLE)
    const { pieces, holes } = puzzleAt(seed, p)
    const width = picture.width / PUZZLE_GRID
    const height = picture.height / PUZZLE_GRID
    pen.imageSmoothingEnabled = true
    pen.globalAlpha = (1 - settled) * entered(p)
    pen.fillStyle = look.tileDark
    for (const slot of holes) {
      pen.fillRect(
        (slot % PUZZLE_GRID) * width,
        Math.floor(slot / PUZZLE_GRID) * height,
        width,
        height,
      )
    }
    for (const { piece, column, row: resting } of pieces) {
      const sourceX = (piece % PUZZLE_GRID) * width
      const sourceY = Math.floor(piece / PUZZLE_GRID) * height
      const slot = Math.round(resting) * PUZZLE_GRID + Math.round(column)
      const dropped = arrived(p, slot, PUZZLE_GRID * PUZZLE_GRID)
      if (dropped <= 0) continue
      const row = resting - 0.35 * (1 - dropped)
      pen.globalAlpha = dropped
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
      pen.globalAlpha = 0.8 * (1 - settled) * dropped
      drawSeam(pen, look, column * width, row * height, width, height)
    }
    pen.globalAlpha = settled
    const [x, y] = cellBox(picture, PUZZLE_GRID, HOLE % PUZZLE_GRID, Math.floor(HOLE / PUZZLE_GRID))
    if (settled > 0) pen.drawImage(picture.image, x!, y!, width, height, x!, y!, width, height)
    pen.globalAlpha = 1
  },
}

/** How long the room takes to light up, ending the build-up. */
const LANTERN_SETTLE = seconds(0.8)

/** The lantern light's radius at `p` before it flickers, as a share of the picture: 13% to 45%. */
export function lanternRadius(p: number): number {
  return 0.13 + 0.32 * p * p
}

/**
 * Where the lantern is at `p` and how far it reaches, as shares of the picture: a wander on
 * two slow waves whose phases the seed sets, swaying less as the light grows, and a flicker.
 */
export function lanternLight(p: number, seed: number): { x: number; y: number; radius: number } {
  const next = random(seed)
  const [wanderX, wanderY, flickerA, flickerB] = [next(), next(), next(), next()].map(
    (share) => share * 2 * Math.PI,
  )
  // Seconds at the usual pace, so the waves keep the design's speed whatever the length.
  const t = p * 25 * BUILD_UP
  const sway = 1 - 0.6 * p
  const flicker = 1 + 0.035 * Math.sin(t * 17 + flickerA!) + 0.02 * Math.sin(t * 7.3 + flickerB!)
  return {
    x: 0.5 + 0.3 * Math.sin(t * 0.9 + wanderX!) * sway,
    y: 0.5 + 0.26 * Math.sin(t * 1.27 + wanderY!) * sway,
    radius: lanternRadius(p) * flicker,
  }
}

/**
 * Lantern: a warm light flares up on the stage and wanders a seeded path, flickering and
 * growing as it goes. Only what it falls on of the item shows: outside it is the stage, not
 * a dark box, and never the item's shape. As the build-up ends the whole item lights up.
 */
export const LANTERN: Reveal = {
  id: 'lantern',
  draw(pen, picture, p, seed) {
    pen.imageSmoothingEnabled = true
    pen.drawImage(picture.image, 0, 0)
    const dark = 1 - clamp01((p - (1 - LANTERN_SETTLE)) / LANTERN_SETTLE)
    if (dark <= 0) return
    const { x, y, radius } = lanternLight(p, seed)
    const reach = radius * entered(p) * Math.max(picture.width, picture.height)
    const cx = x * picture.width
    const cy = y * picture.height
    pen.globalAlpha = 1
    if (reach > 0) {
      const tint = pen.createRadialGradient(cx, cy, 0, cx, cy, reach)
      tint.addColorStop(0, `rgba(255, 180, 80, ${0.14 * dark})`)
      tint.addColorStop(0.55, 'rgba(255, 180, 80, 0)')
      pen.globalCompositeOperation = 'source-atop'
      pen.fillStyle = tint
      pen.fillRect(0, 0, picture.width, picture.height)
    }
    const shown = pen.createRadialGradient(cx, cy, 0, cx, cy, Math.max(reach, 1e-3))
    shown.addColorStop(0, '#000')
    shown.addColorStop(0.55, '#000')
    shown.addColorStop(1, `rgba(0, 0, 0, ${1 - dark})`)
    pen.globalCompositeOperation = 'destination-in'
    pen.fillStyle = shown
    pen.fillRect(0, 0, picture.width, picture.height)
    // The pool on the stage fades out before the canvas's edge, so the box never shows.
    const pool = Math.min(reach * 1.15, cx, cy, picture.width - cx, picture.height - cy)
    if (pool > 0) {
      const glow = pen.createRadialGradient(cx, cy, 0, cx, cy, pool)
      glow.addColorStop(0, `rgba(255, 190, 100, ${0.32 * dark})`)
      glow.addColorStop(0.5, `rgba(255, 170, 80, ${0.14 * dark})`)
      glow.addColorStop(1, 'rgba(255, 160, 70, 0)')
      pen.globalCompositeOperation = 'destination-over'
      pen.fillStyle = glow
      pen.fillRect(0, 0, picture.width, picture.height)
    }
    pen.globalCompositeOperation = 'source-over'
  },
}

export type Point = [number, number]

/** How opaque a pixel must be to count as the item's, for its outline. */
const SOLID = 128

/** How far a simplified outline may stray from the pixel edge, in pixels. */
const OUTLINE_TOLERANCE = 0.8

/** A part smaller than this share of the biggest is a speck, and gets no outline. */
const SPECK = 0.02

/**
 * The outer edges of the item's opaque parts, from the alpha: each a closed loop of pixel
 * edges going clockwise, with its area. Holes run the other way and are left out.
 */
function edgeLoops(picture: Picture): { points: Point[]; area: number }[] {
  const { width, height, data } = picture
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3]! >= SOLID
  // Each pixel side between the item and the outside, clockwise around its pixel, so the
  // item is on its right; keyed by the corner it starts from.
  const from = new Map<number, number[]>()
  const ends: number[] = []
  const corner = (x: number, y: number): number => y * (width + 1) + x
  const add = (x0: number, y0: number, x1: number, y1: number): void => {
    const start = corner(x0, y0)
    let out = from.get(start)
    if (out === undefined) from.set(start, (out = []))
    out.push(ends.length / 4)
    ends.push(x0, y0, x1, y1)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solid(x, y)) continue
      if (!solid(x, y - 1)) add(x, y, x + 1, y)
      if (!solid(x + 1, y)) add(x + 1, y, x + 1, y + 1)
      if (!solid(x, y + 1)) add(x + 1, y + 1, x, y + 1)
      if (!solid(x - 1, y)) add(x, y + 1, x, y)
    }
  }
  const sides = ends.length / 4
  const used = new Uint8Array(sides)
  const loops: { points: Point[]; area: number }[] = []
  for (let first = 0; first < sides; first++) {
    if (used[first]) continue
    const points: Point[] = []
    let side = first
    while (!used[side]) {
      used[side] = 1
      const [x0, y0, x1, y1] = ends.slice(side * 4, side * 4 + 4) as [
        number,
        number,
        number,
        number,
      ]
      // The middle of each side, so the pixel staircase reads as a slope.
      points.push([(x0 + x1) / 2, (y0 + y1) / 2])
      const dx = x1 - x0
      const dy = y1 - y0
      const next = (from.get(corner(x1, y1)) ?? []).filter((n) => !used[n])
      if (next.length === 0) break
      // Two ways on where parts only touch at a corner: turning right keeps them apart.
      const turn = (n: number): number => {
        const ndx = ends[n * 4 + 2]! - ends[n * 4]!
        const ndy = ends[n * 4 + 3]! - ends[n * 4 + 1]!
        return ndx === -dy && ndy === dx ? 0 : ndx === dx && ndy === dy ? 1 : 2
      }
      side = next.reduce((best, n) => (turn(n) < turn(best) ? n : best))
    }
    let area = 0
    points.forEach(([x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length]!
      area += x * ny - nx * y
    })
    if (area > 0) loops.push({ points, area: area / 2 })
  }
  return loops
}

/** `line` with the points that lie within `tolerance` of a straight run dropped, ends kept. */
function simplify(line: Point[], tolerance: number): Point[] {
  const keep = new Uint8Array(line.length)
  keep[0] = 1
  keep[line.length - 1] = 1
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    const [ax, ay] = line[start]!
    const [bx, by] = line[end]!
    const length = Math.hypot(bx - ax, by - ay)
    let far = -1
    let farthest = tolerance
    for (let i = start + 1; i < end; i++) {
      const [x, y] = line[i]!
      const off =
        length === 0
          ? Math.hypot(x - ax, y - ay)
          : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length
      if (off > farthest) [far, farthest] = [i, off]
    }
    if (far < 0) continue
    keep[far] = 1
    stack.push([start, far], [far, end])
  }
  return line.filter((_, i) => keep[i])
}

const loopCache = new WeakMap<Uint8ClampedArray, { points: Point[]; area: number }[]>()

/**
 * The outline Sketch's pen traces: a closed loop round each of the item's parts, the
 * biggest first, specks left out. Each starts and ends at a point on its edge the seed
 * picks, the biggest's being where the pen sets down.
 */
export function sketchOutline(picture: Picture, seed: number): Point[][] {
  let loops = loopCache.get(picture.data)
  if (loops === undefined) {
    loops = edgeLoops(picture).sort((a, b) => b.area - a.area)
    const biggest = loops[0]?.area ?? 0
    loops = loops.filter(({ area }) => area >= biggest * SPECK)
    loopCache.set(picture.data, loops)
  }
  return loops.map(({ points }) => {
    const start = seed % points.length
    const round = [...points.slice(start), ...points.slice(0, start), points[start]!]
    return simplify(round, OUTLINE_TOLERANCE)
  })
}

/** How strong a colour edge must be, in luminance per pixel, to begin to show as a line. */
const LINE_FROM = 48

/** How much stronger again it must be to show as a full line. */
const LINE_RANGE = 112

/**
 * How dark each pixel's inner line is, 0 to 255, row by row: where the picture's colours
 * change sharply inside the item, by a Sobel filter over its brightness on white paper.
 */
export function innerLines(picture: Picture): Uint8ClampedArray {
  const { width, height, data } = picture
  const paper = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3]! / 255
    const lum = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!
    paper[i] = lum * a + 255 * (1 - a)
  }
  const at = (x: number, y: number): number =>
    paper[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]!
  const lines = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < SOLID) continue
      const gx =
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1)
      const gy =
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1)
      lines[y * width + x] = 255 * clamp01((Math.hypot(gx, gy) - LINE_FROM) / LINE_RANGE)
    }
  }
  return lines
}

const lineCache = new WeakMap<Uint8ClampedArray, { ink: string; layer: CanvasImageSource | null }>()

/** The inner lines in `ink` on a see-through layer the picture's size, once per picture. */
function lineLayer(picture: Picture, ink: string): CanvasImageSource | null {
  const cached = lineCache.get(picture.data)
  if (cached?.ink === ink) return cached.layer
  let layer: CanvasImageSource | null = null
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(picture.width, picture.height)
    const pen = canvas.getContext('2d')
    if (pen !== null) {
      pen.fillStyle = ink
      pen.fillRect(0, 0, 1, 1)
      const [r, g, b] = pen.getImageData(0, 0, 1, 1).data
      const strength = innerLines(picture)
      const pixels = new ImageData(picture.width, picture.height)
      strength.forEach((alpha, i) => {
        pixels.data[i * 4] = r!
        pixels.data[i * 4 + 1] = g!
        pixels.data[i * 4 + 2] = b!
        pixels.data[i * 4 + 3] = alpha
      })
      pen.putImageData(pixels, 0, 0)
      layer = canvas
    }
  }
  lineCache.set(picture.data, { ink, layer })
  return layer
}

/** How long the pen takes over the outline: about 6 seconds, at most 40% of the build-up. */
export const OUTLINE_TIME = Math.min(seconds(6), 0.4)

/** How long the inner lines take to fade in once the outline is done. */
const LINES_FADE = seconds(1.5)

/** When the colour starts to wash in: over the last 65% of the time after the outline. */
export const WASH_FROM = OUTLINE_TIME + (1 - OUTLINE_TIME) * 0.35

/** How long the colour takes from 85% to whole and the lines to fade, ending the build-up. */
export const SKETCH_SETTLE = seconds(0.8)

/** Where Sketch is at `p`: the share of the outline traced, and each layer's opacity. */
export function sketchPhase(p: number): {
  traced: number
  tip: boolean
  outline: number
  lines: number
  colour: number
} {
  const drawing = clamp01(p / OUTLINE_TIME)
  const settled = clamp01((p - (1 - SKETCH_SETTLE)) / SKETCH_SETTLE)
  const washed = clamp01((p - WASH_FROM) / (1 - SKETCH_SETTLE - WASH_FROM))
  return {
    // The hand hurries and hesitates a little, never going back.
    traced: clamp01(drawing + 0.015 * Math.sin(drawing * 40)),
    tip: drawing < 1,
    outline: 1 - settled,
    lines: clamp01((p - OUTLINE_TIME) / LINES_FADE) * (1 - settled),
    colour: 0.85 * washed + 0.15 * settled,
  }
}

/**
 * Sketch: the pen tip pops onto the empty box, traces the item's outline from a seeded
 * point, the inner lines fade in, and the colour washes in under them. As the build-up ends
 * the colour is whole and the lines go.
 */
export const SKETCH: Reveal = {
  id: 'sketch',
  draw(pen, picture, p, seed, look) {
    const { traced, tip, outline, lines, colour } = sketchPhase(p)
    const size = Math.max(picture.width, picture.height)
    // Found on the first frame, so a slow phone stalls as the question opens, not mid-sketch.
    const layer = lineLayer(picture, look.ink)
    pen.imageSmoothingEnabled = true
    if (colour > 0) {
      pen.globalAlpha = colour
      pen.drawImage(picture.image, 0, 0)
    }
    if (lines > 0 && layer !== null) {
      pen.globalAlpha = lines
      pen.drawImage(layer, 0, 0)
    }
    if (outline <= 0) return
    const loops = sketchOutline(picture, seed)
    const total = loops.reduce((sum, loop) => sum + pathLength(loop), 0)
    let left = traced * total
    let tipAt: Point | null = null
    pen.globalAlpha = outline
    pen.strokeStyle = look.ink
    pen.lineWidth = size * 0.009
    pen.lineJoin = 'round'
    pen.lineCap = 'round'
    pen.beginPath()
    for (const loop of loops) {
      if (left <= 0) break
      pen.moveTo(...loop[0]!)
      tipAt = loop[0]!
      for (let i = 1; i < loop.length && left > 0; i++) {
        const [ax, ay] = loop[i - 1]!
        const [bx, by] = loop[i]!
        const step = Math.hypot(bx - ax, by - ay)
        const along = step === 0 ? 1 : Math.min(1, left / step)
        tipAt = [ax + (bx - ax) * along, ay + (by - ay) * along]
        pen.lineTo(...tipAt)
        left -= step
      }
    }
    pen.stroke()
    if (tip && tipAt !== null) {
      pen.fillStyle = look.bad
      pen.beginPath()
      pen.arc(tipAt[0], tipAt[1], size * 0.016 * entered(p), 0, 2 * Math.PI)
      pen.fill()
    }
    pen.globalAlpha = 1
  },
}

function pathLength(line: Point[]): number {
  let length = 0
  for (let i = 1; i < line.length; i++) {
    length += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1])
  }
  return length
}

/** The reveals a question may be drawn with. */
export const REVEALS: readonly Reveal[] = [ZOOM_OUT, PIXELATE, TILES, SLIDE_PUZZLE, LANTERN, SKETCH]
