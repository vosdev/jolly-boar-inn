/**
 * Pixel Hunt's reveals: every screen picks the same one from the room and the question,
 * Zoom out starts on the item, Pixelate keeps its eight levels to the minute, Tiles opens the
 * item's tiles in seeded order, the puzzle box ends solved, and the picture is whole once the
 * build-up is over.
 */

import { describe, expect, it } from 'vitest'

import {
  BUILD_UP,
  PIXEL_LEVELS,
  PIXELATE,
  PUZZLE_SLIDES,
  REVEALS,
  SLIDE_PUZZLE,
  TILE_GRID,
  TILES,
  ZOOM_OUT,
  drawFrame,
  opaquePixel,
  pixelBlocks,
  progress,
  puzzleAt,
  revealFor,
  scramble,
  tileCover,
  tileOpensAt,
  tileOrder,
  zoomScale,
  type Look,
  type Pen,
  type Picture,
} from './pixelHunt'

const IMAGE = { id: 'the image' } as unknown as CanvasImageSource

const LOOK: Look = { tile: 'tile', tileLight: 'light', tileDark: 'dark', tileSeam: 'seam' }

/** A `size` square, see-through but for the pixels `opaque` names, all a reddish brown. */
function picture(size: number, opaque: (x: number, y: number) => boolean): Picture {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!opaque(x, y)) continue
      data.set([120, 60, 30, 255], (y * size + x) * 4)
    }
  }
  return { width: size, height: size, data, image: IMAGE }
}

type Call = [string, ...unknown[]]

/** A pen that writes down what it is asked to do, and each fill's colour and alpha. */
function recorder(): Pen & {
  calls: Call[]
  fills: { style: unknown; alpha: number; box: number[] }[]
} {
  const calls: Call[] = []
  const fills: { style: unknown; alpha: number; box: number[] }[] = []
  const pen = {
    calls,
    fills,
    fillStyle: '' as Pen['fillStyle'],
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: (...args: number[]) => void calls.push(['clearRect', ...args]),
    fillRect: (...args: number[]) => {
      calls.push(['fillRect', ...args])
      fills.push({ style: pen.fillStyle, alpha: pen.globalAlpha, box: args })
    },
    setTransform: ((...args: number[]) =>
      void calls.push(['setTransform', ...args])) as Pen['setTransform'],
    drawImage: ((...args: unknown[]) =>
      void calls.push(['drawImage', ...args])) as Pen['drawImage'],
  }
  return pen
}

/** Where `transform` puts the point (x, y). */
function mapped(transform: Call, x: number, y: number): [number, number] {
  const [, a, , , d, e, f] = transform as [string, number, number, number, number, number, number]
  return [a * x + e, d * y + f]
}

const OPENS = Date.parse('2026-10-28T20:00:00Z')
const ENDS = OPENS + 25_000

describe('the schedule', () => {
  it('builds up over the first 17 of 25 seconds and stays whole after', () => {
    expect(BUILD_UP).toBe(17 / 25)
    expect(progress(OPENS, ENDS, OPENS - 500)).toBe(0)
    expect(progress(OPENS, ENDS, OPENS)).toBe(0)
    expect(progress(OPENS, ENDS, OPENS + 8_500)).toBeCloseTo(0.5)
    expect(progress(OPENS, ENDS, OPENS + 17_000)).toBe(1)
    expect(progress(OPENS, ENDS, ENDS)).toBe(1)
    expect(progress(OPENS, ENDS, ENDS + 6_000)).toBe(1)
  })

  it('scales with the pace: 31 seconds at walk builds up over 21.08', () => {
    expect(progress(OPENS, OPENS + 31_000, OPENS + 21_080)).toBeCloseTo(1)
    expect(progress(OPENS, OPENS + 31_000, OPENS + 10_540)).toBeCloseTo(0.5)
  })
})

describe('the reveal a question gets', () => {
  const QUESTION = '5f0c6a4e-3c1b-4b9e-9a51-0d2f1c7e8b10'

  it('is the same on every screen and after a reconnect, by the room and the question', () => {
    const phone = revealFor('WHIPLASH', QUESTION)
    const tv = revealFor('WHIPLASH', QUESTION)
    const reconnected = revealFor('whiplash', QUESTION)
    expect(tv).toEqual(phone)
    expect(reconnected).toEqual(phone)
    expect(REVEALS).toContain(phone.reveal)
    expect(Number.isInteger(phone.seed) && phone.seed >= 0).toBe(true)
  })

  it('offers every reveal at random over a 60-question sample, with seeds of their own', () => {
    expect(REVEALS.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['zoom_out', 'pixelate', 'tiles', 'slide_puzzle']),
    )
    const picked = Array.from({ length: 60 }, (_, n) =>
      revealFor('WHIPLASH', `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`),
    )
    expect(new Set(picked.map(({ reveal }) => reveal.id))).toEqual(
      new Set(REVEALS.map(({ id }) => id)),
    )
    expect(new Set(picked.map(({ seed }) => seed)).size).toBe(60)
  })
})

describe('Zoom out', () => {
  // A whip in the bottom-right corner, with nothing over most of the square.
  const whip = picture(64, (x, y) => x >= 40 && y >= 44)

  it('centres its first frame on an opaque pixel the seed picks', () => {
    for (const seed of [0, 1, 7, 12_345, 4_000_000_000]) {
      const [x, y] = opaquePixel(whip, seed)
      const at = (Math.floor(y) * 64 + Math.floor(x)) * 4
      expect(whip.data[at + 3]).toBe(255)
      const pen = recorder()
      ZOOM_OUT.draw(pen, whip, 0, seed, LOOK)
      const transform = pen.calls.find(([name]) => name === 'setTransform')!
      expect(transform[1]).toBe(8)
      expect(mapped(transform, x, y)).toEqual([32, 32])
    }
  })

  it('pulls back smoothly from 800% to the picture as it is', () => {
    const scales = Array.from({ length: 101 }, (_, n) => zoomScale(n / 100))
    expect(scales[0]).toBe(8)
    expect(scales[100]).toBe(1)
    for (let n = 1; n <= 100; n++) expect(scales[n]! / scales[n - 1]!).toBeCloseTo(8 ** -0.01)
    const pen = recorder()
    ZOOM_OUT.draw(pen, whip, 1, 3, LOOK)
    const transform = pen.calls.find(([name]) => name === 'setTransform')!
    expect(mapped(transform, 0, 0)[0]).toBeCloseTo(0)
    expect(mapped(transform, 64, 64)[1]).toBeCloseTo(64)
  })

  it('starts on the middle of a picture with nothing opaque in it', () => {
    expect(
      opaquePixel(
        picture(10, () => false),
        5,
      ),
    ).toEqual([5, 5])
  })
})

describe('Pixelate', () => {
  // [seconds into a 25-second question, blocks across]: each level from its start.
  const LEVELS: [number, number][] = [
    [0, 4],
    [0.849, 4],
    [0.851, 6],
    [1.86, 6],
    [1.88, 8],
    [3.05, 8],
    [3.07, 10],
    [4.75, 10],
    [4.77, 16],
    [7.13, 16],
    [7.15, 24],
    [9.85, 24],
    [9.87, 32],
    [12.91, 32],
    [12.93, 48],
    [16.99, 48],
  ]

  it('passes its eight levels at 0, 5, 11, 18, 28, 42, 58 and 76% of the build-up', () => {
    expect(PIXEL_LEVELS.map(({ blocks }) => blocks)).toEqual([4, 6, 8, 10, 16, 24, 32, 48])
    expect(PIXEL_LEVELS.map(({ from }) => from)).toEqual([
      0, 0.05, 0.11, 0.18, 0.28, 0.42, 0.58, 0.76,
    ])
    for (const [seconds, blocks] of LEVELS) {
      expect(pixelBlocks(progress(OPENS, ENDS, OPENS + seconds * 1000)), `${seconds}s`).toBe(blocks)
    }
  })

  it('draws hard-edged blocks that tile the picture, leaving empty ones out', () => {
    const half = picture(48, (x) => x < 24)
    const pen = recorder()
    PIXELATE.draw(pen, half, 0.3, 0, LOOK)
    const blocks = pen.calls.filter(([name]) => name === 'fillRect') as [string, ...number[]][]
    expect(blocks).toHaveLength(8 * 16)
    for (const [, x, y, w, h] of blocks) {
      for (const edge of [x, y, w, h]) expect(Number.isInteger(edge)).toBe(true)
      expect(x! + w!).toBeLessThanOrEqual(24)
      expect([w, h]).toEqual([3, 3])
    }
    expect(pen.fillStyle).toBe('rgba(120, 60, 30, 1.000)')
    expect(pen.calls.some(([name]) => name === 'drawImage')).toBe(false)
  })
})

describe('the end of the build-up', () => {
  it('draws the picture whole, whichever the reveal, through to the answer', () => {
    const whole = picture(16, () => true)
    for (const reveal of REVEALS) {
      for (const seconds of [17, 20, 25]) {
        const pen = recorder()
        drawFrame(pen, whole, reveal, progress(OPENS, ENDS, OPENS + seconds * 1000), 9, LOOK)
        expect(pen.calls).toEqual([
          ['setTransform', 1, 0, 0, 1, 0, 0],
          ['clearRect', 0, 0, 16, 16],
          ['drawImage', IMAGE, 0, 0],
        ])
      }
    }
  })

  it('draws the reveal before then', () => {
    const pen = recorder()
    drawFrame(
      pen,
      picture(16, () => true),
      PIXELATE,
      0.5,
      9,
      LOOK,
    )
    expect(pen.calls.filter(([name]) => name === 'fillRect')).toHaveLength(16 * 16)
  })
})

/** Build-up progress at `seconds` into a 25-second question. */
const at = (seconds: number): number => progress(OPENS, ENDS, OPENS + seconds * 1000)

describe('Tiles', () => {
  // A pickaxe across the diagonal of a 50px square, and two corner tiles only 6% covered.
  const pickaxe = picture(
    50,
    (x, y) => Math.abs(x - y) < 6 || (x >= 40 && x < 43 && y < 2) || (x < 2 && y >= 40 && y < 43),
  )
  const cover = tileCover(pickaxe, TILE_GRID)
  const item = cover.flatMap((share, cell) => (share > 0.08 ? [cell] : []))

  /** The cells that still carry a tile, by where `TILES` drew their base. */
  function closed(p: number, seed: number): number[] {
    const pen = recorder()
    TILES.draw(pen, pickaxe, p, seed, LOOK)
    return pen.fills
      .filter(({ style, alpha }) => style === 'tile' && alpha > 0)
      .map(({ box: [x, y] }) => Math.round(y! / 10) * TILE_GRID + Math.round(x! / 10))
  }

  it('counts as the item only the tiles more than 8% opaque', () => {
    expect(cover[0]).toBeCloseTo(0.8)
    expect(cover[1]).toBeCloseTo(0.15)
    expect(cover[4]).toBeCloseTo(0.06)
    expect(cover[20]).toBeCloseTo(0.06)
    expect(cover[2]).toBe(0)
    expect(item).toEqual([0, 1, 5, 6, 7, 11, 12, 13, 17, 18, 19, 23, 24])
  })

  it('opens the item tiles in the same seeded order on every screen', () => {
    for (const seed of [0, 9, 4_000_000_000]) {
      const order = tileOrder(pickaxe, seed)
      expect(tileOrder(pickaxe, seed)).toEqual(order)
      expect([...order].sort((a, b) => a - b)).toEqual(item)
    }
    expect(tileOrder(pickaxe, 1)).not.toEqual(tileOrder(pickaxe, 2))
  })

  it('opens one item tile at a time, evenly, and the empty ones only at the end', () => {
    const order = tileOrder(pickaxe, 9)
    const opens = tileOpensAt(order)
    order.forEach((cell, index) => expect(opens[cell]).toBeCloseTo(index / order.length))
    for (let cell = 0; cell < TILE_GRID * TILE_GRID; cell++) {
      if (!order.includes(cell)) expect(opens[cell]).toBeCloseTo(1 - 0.25 / 17)
    }
    expect(closed(0, 9)).toHaveLength(25)
    const beforeEnd = closed(at(16.7), 9)
    expect(beforeEnd.filter((cell) => item.includes(cell))).toEqual([])
    expect(beforeEnd).toHaveLength(25 - item.length)
    const midway = closed(at(8.5), 9)
    for (const cell of order.slice(Math.ceil(order.length / 2) + 1)) expect(midway).toContain(cell)
  })

  it('fades a tile out over 0.25 s with no flip', () => {
    const order = tileOrder(pickaxe, 9)
    const second = order[1]!
    const opensAt = 17 / order.length
    const alphaAt = (seconds: number): number => {
      const pen = recorder()
      TILES.draw(pen, pickaxe, at(seconds), 9, LOOK)
      const [x, y] = [(second % 5) * 10, Math.floor(second / 5) * 10]
      return (
        pen.fills.find(({ style, box }) => style === 'tile' && box[0] === x && box[1] === y)
          ?.alpha ?? 0
      )
    }
    expect(alphaAt(opensAt - 0.01)).toBe(1)
    expect(alphaAt(opensAt + 0.125)).toBeCloseTo(0.5)
    expect(alphaAt(opensAt + 0.26)).toBe(0)
    const pen = recorder()
    TILES.draw(pen, pickaxe, at(opensAt + 0.1), 9, LOOK)
    expect(pen.calls.filter(([name]) => name === 'setTransform')).toEqual([])
  })

  it('draws each tile with its bevel and seam in the theme', () => {
    const pen = recorder()
    TILES.draw(pen, pickaxe, 0, 9, LOOK)
    const styles = new Set(pen.fills.map(({ style }) => style))
    expect(styles).toEqual(new Set(['tile', 'light', 'dark', 'seam']))
    expect(pen.calls[0]).toEqual(['drawImage', IMAGE, 0, 0])
  })
})

describe('Slide puzzle', () => {
  const adjacent = (a: number, b: number): boolean =>
    (Math.floor(a / 5) === Math.floor(b / 5) && Math.abs(a - b) === 1) || Math.abs(a - b) === 5

  it('scrambles with 36 legal slides from the solved box, never undoing the last', () => {
    for (const seed of [0, 1, 77, 123_456, 4_000_000_000]) {
      const holes = scramble(seed)
      expect(holes).toEqual(scramble(seed))
      expect(holes).toHaveLength(PUZZLE_SLIDES + 1)
      expect(holes[0]).toBe(24)
      for (let slide = 1; slide <= PUZZLE_SLIDES; slide++) {
        expect(adjacent(holes[slide - 1]!, holes[slide]!), `slide ${slide}`).toBe(true)
        if (slide >= 2) expect(holes[slide]).not.toBe(holes[slide - 2])
      }
    }
    expect(scramble(1)).not.toEqual(scramble(2))
  })

  it('starts scrambled and plays it back one slide at a time', () => {
    const start = puzzleAt(77, 0)
    expect(start.pieces).toHaveLength(24)
    const home = start.pieces.filter(
      ({ piece, column, row }) => column === piece % 5 && row === Math.floor(piece / 5),
    )
    expect(home.length).toBeLessThan(24)
    let previous = start.pieces
    for (let n = 1; n <= 400; n++) {
      const { pieces } = puzzleAt(77, n / 400)
      const moved = pieces.filter(
        ({ piece, column, row }) =>
          previous.find((was) => was.piece === piece)!.column !== column ||
          previous.find((was) => was.piece === piece)!.row !== row,
      )
      expect(moved.length).toBeLessThanOrEqual(1)
      previous = pieces
    }
  })

  it('eases each slide over 60% of its slot', () => {
    const slot = (1 - 0.8 / 17) / PUZZLE_SLIDES
    const moving = (p: number) =>
      puzzleAt(77, p).pieces.find(
        ({ column, row }) => !Number.isInteger(column) || !Number.isInteger(row),
      )
    expect(moving(slot * 3)).toBeUndefined()
    expect(moving(slot * 3.3)).toBeDefined()
    expect(moving(slot * 3.61)).toBeUndefined()
  })

  it('ends solved at the end of the build-up, then the last piece drops in', () => {
    for (const seed of [0, 1, 77, 123_456]) {
      for (const p of [at(16.3), at(16.99)]) {
        const { pieces, holes } = puzzleAt(seed, p)
        expect(holes).toEqual([24])
        for (const { piece, column, row } of pieces) {
          expect([column, row]).toEqual([piece % 5, Math.floor(piece / 5)])
        }
      }
    }
    const last = (p: number): Call | undefined => {
      const pen = recorder()
      SLIDE_PUZZLE.draw(
        pen,
        picture(50, () => true),
        p,
        77,
        LOOK,
      )
      return pen.calls.findLast(([name]) => name === 'drawImage')
    }
    const corner = ['drawImage', IMAGE, 40, 40, 10, 10, 40, 40, 10, 10]
    expect(last(at(16.1))).not.toEqual(corner)
    expect(last(at(16.9))).toEqual(corner)
  })

  it('fades the hole and the seams as the last piece drops in', () => {
    const fills = (seconds: number) => {
      const pen = recorder()
      SLIDE_PUZZLE.draw(
        pen,
        picture(50, () => true),
        at(seconds),
        77,
        LOOK,
      )
      return pen.fills
    }
    const hole = (seconds: number) => fills(seconds).find(({ style }) => style === 'dark')!.alpha
    const seam = (seconds: number) => fills(seconds).find(({ style }) => style === 'seam')!.alpha
    expect([hole(16.1), seam(16.1)]).toEqual([1, 0.8])
    expect(hole(16.6)).toBeCloseTo(0.5)
    expect(seam(16.6)).toBeCloseTo(0.4)
    expect(hole(16.99)).toBeLessThan(0.02)
  })
})
