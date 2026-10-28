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
  'clearRect' | 'drawImage' | 'fillRect' | 'setTransform' | 'fillStyle' | 'imageSmoothingEnabled'
>

export interface Reveal {
  id: string
  /**
   * Draw `picture` at build-up progress `p`, 0 up to 1, on a cleared canvas of the
   * picture's own size, the same for the same `seed`.
   */
  draw: (pen: Pen, picture: Picture, p: number, seed: number) => void
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
): void {
  pen.setTransform(1, 0, 0, 1, 0, 0)
  pen.clearRect(0, 0, picture.width, picture.height)
  if (p >= 1) {
    pen.imageSmoothingEnabled = true
    pen.drawImage(picture.image, 0, 0)
    return
  }
  reveal.draw(pen, picture, Math.max(0, p), seed)
  pen.setTransform(1, 0, 0, 1, 0, 0)
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

/** The reveals a question may be drawn with. */
export const REVEALS: readonly Reveal[] = [ZOOM_OUT, PIXELATE]
