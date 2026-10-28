/**
 * Pixel Hunt's reveals: every screen picks the same one from the room and the question,
 * the box is empty while the host types and each reveal makes its entrance, Zoom out starts on the item, Pixelate keeps its eight levels to the minute, Tiles opens the
 * item's tiles in seeded order, the puzzle box ends solved, the lantern wanders the same way on
 * every screen, Sketch's pen goes round the item, and the picture is whole once the build-up is
 * over.
 */

import { describe, expect, it } from 'vitest'

import {
  BUILD_UP,
  ENTRY,
  LANTERN,
  OUTLINE_TIME,
  PIXEL_LEVELS,
  PIXELATE,
  PUZZLE_SLIDES,
  REVEALS,
  SKETCH,
  SKETCH_SETTLE,
  SLIDE_PUZZLE,
  TILE_GRID,
  WASH_FROM,
  TILES,
  ZOOM_OUT,
  arrived,
  drawFrame,
  entered,
  innerLines,
  lanternLight,
  lanternRadius,
  opaquePixel,
  pixelBlocks,
  progress,
  puzzleAt,
  revealFor,
  scramble,
  sketchOutline,
  sketchPhase,
  tileCover,
  tileOpensAt,
  tileOrder,
  zoomScale,
  type Look,
  type Pen,
  type Picture,
} from './pixelHunt'

const IMAGE = { id: 'the image' } as unknown as CanvasImageSource

const LOOK: Look = {
  tile: 'tile',
  tileLight: 'light',
  tileDark: 'dark',
  tileSeam: 'seam',
  ink: 'ink',
  bad: 'bad',
}

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
  fills: { style: unknown; alpha: number; box: number[]; op: string }[]
  images: { alpha: number; box: unknown[] }[]
} {
  const calls: Call[] = []
  const fills: { style: unknown; alpha: number; box: number[]; op: string }[] = []
  const images: { alpha: number; box: unknown[] }[] = []
  const pen = {
    calls,
    fills,
    images,
    fillStyle: '' as Pen['fillStyle'],
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as Pen['globalCompositeOperation'],
    imageSmoothingEnabled: true,
    clearRect: (...args: number[]) => void calls.push(['clearRect', ...args]),
    fillRect: (...args: number[]) => {
      calls.push(['fillRect', ...args])
      fills.push({
        style: pen.fillStyle,
        alpha: pen.globalAlpha,
        box: args,
        op: pen.globalCompositeOperation,
      })
    },
    setTransform: ((...args: number[]) =>
      void calls.push(['setTransform', ...args])) as Pen['setTransform'],
    drawImage: ((...args: unknown[]) => {
      calls.push(['drawImage', ...args])
      images.push({ alpha: pen.globalAlpha, box: args.slice(1) })
    }) as Pen['drawImage'],
    createRadialGradient: ((...args: number[]) => {
      const stops: [number, string][] = []
      calls.push(['createRadialGradient', ...args, stops])
      return { addColorStop: (at: number, colour: string) => void stops.push([at, colour]) }
    }) as unknown as Pen['createRadialGradient'],
    strokeStyle: '' as Pen['strokeStyle'],
    lineWidth: 1,
    lineJoin: 'miter' as Pen['lineJoin'],
    lineCap: 'butt' as Pen['lineCap'],
    beginPath: () => void calls.push(['beginPath']),
    moveTo: (...args: number[]) => void calls.push(['moveTo', ...args]),
    lineTo: (...args: number[]) => void calls.push(['lineTo', ...args]),
    arc: ((...args: unknown[]) => void calls.push(['arc', ...args])) as Pen['arc'],
    stroke: () => void calls.push(['stroke', pen.strokeStyle, pen.globalAlpha]),
    fill: () => void calls.push(['fill', pen.fillStyle, pen.globalAlpha]),
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
    expect(progress(OPENS, ENDS, OPENS - 500)).toBeLessThan(0)
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
      expect.arrayContaining([
        'zoom_out',
        'pixelate',
        'tiles',
        'slide_puzzle',
        'lantern',
        'sketch',
      ]),
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

/** Build-up progress at `seconds` into a 25-second question. */
const at = (seconds: number): number => progress(OPENS, ENDS, OPENS + seconds * 1000)

/** Whether `pen` put anything visible on the canvas. */
const drewAnything = (pen: ReturnType<typeof recorder>): boolean =>
  pen.images.some(({ alpha }) => alpha > 0) ||
  pen.fills.some(({ alpha }) => alpha > 0) ||
  pen.calls.some(([name]) => name === 'lineTo') ||
  pen.calls.some(([name, , , radius]) => name === 'arc' && Number(radius) > 0)

describe('while the host types', () => {
  it('leaves the box empty, whichever the reveal, until answers open', () => {
    const whole = picture(16, () => true)
    for (const reveal of REVEALS) {
      for (const seconds of [-3, -0.01]) {
        const pen = recorder()
        drawFrame(pen, whole, reveal, at(seconds), 9, LOOK)
        expect(pen.calls).toEqual([
          ['setTransform', 1, 0, 0, 1, 0, 0],
          ['clearRect', 0, 0, 16, 16],
        ])
      }
    }
  })
})

describe('the entrance', () => {
  const whole = picture(50, (x, y) => Math.abs(x - y) < 6)

  it('takes the first half second of the build-up, within the first step', () => {
    expect(ENTRY).toBeCloseTo(0.5 / 17)
    expect(entered(0)).toBe(0)
    expect(entered(ENTRY / 2)).toBeCloseTo(0.5)
    expect(entered(ENTRY)).toBe(1)
    expect(arrived(0, 0, 25)).toBe(0)
    expect(arrived(ENTRY * 0.4, 0, 25)).toBe(1)
    expect(arrived(ENTRY * 0.6, 24, 25)).toBe(0)
    expect(arrived(ENTRY, 24, 25)).toBe(1)
  })

  it('starts every reveal from the empty box as answers open', () => {
    // Lantern draws the picture and masks it all away; its own tests cover the mask.
    for (const reveal of REVEALS.filter(({ id }) => id !== 'lantern')) {
      const pen = recorder()
      drawFrame(pen, whole, reveal, 0, 9, LOOK)
      expect(drewAnything(pen), reveal.id).toBe(false)
      const later = recorder()
      drawFrame(later, whole, reveal, at(0.3), 9, LOOK)
      expect(drewAnything(later), reveal.id).toBe(true)
    }
  })

  it('fades Zoom out and Pixelate in', () => {
    for (const seconds of [0.1, 0.25, 0.5]) {
      const zoom = recorder()
      ZOOM_OUT.draw(zoom, whole, at(seconds), 9, LOOK)
      expect(zoom.images[0]!.alpha).toBeCloseTo(entered(at(seconds)))
      const blocks = recorder()
      PIXELATE.draw(blocks, whole, at(seconds), 9, LOOK)
      expect(blocks.fills[0]!.alpha).toBeCloseTo(entered(at(seconds)))
    }
  })

  it('grows the Sketch pen tip in', () => {
    const tip = (seconds: number): number => {
      const pen = recorder()
      SKETCH.draw(pen, whole, at(seconds), 9, LOOK)
      return pen.calls.find(([name]) => name === 'arc')![3] as number
    }
    expect(tip(0.25)).toBeCloseTo(50 * 0.016 * 0.5)
    expect(tip(1)).toBeCloseTo(50 * 0.016)
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

  it('deals the tiles onto the empty box row by row, growing, before showing the picture', () => {
    const tiles = (seconds: number) => {
      const pen = recorder()
      TILES.draw(pen, pickaxe, at(seconds), 9, LOOK)
      return { pen, bases: pen.fills.filter(({ style, alpha }) => style === 'tile' && alpha > 0) }
    }
    expect(tiles(0).bases).toEqual([])
    const dealing = tiles(0.25)
    expect(dealing.pen.images).toEqual([])
    expect(dealing.bases.length).toBeGreaterThan(0)
    expect(dealing.bases.length).toBeLessThan(25)
    expect(dealing.bases[0]!.box[2]).toBeGreaterThan(6)
    expect(dealing.bases.at(-1)!.box[2]).toBeLessThan(10)
    const dealt = tiles(0.55)
    // The first item tile starts to open as the last one lands.
    expect(dealt.bases).toHaveLength(25)
    expect(dealt.bases.every(({ box }) => box[2] === 10)).toBe(true)
    expect(dealt.pen.calls[0]).toEqual(['drawImage', IMAGE, 0, 0])
  })

  it('opens one item tile at a time, evenly after the entrance, and the empty ones only at the end', () => {
    const order = tileOrder(pickaxe, 9)
    const opens = tileOpensAt(order)
    order.forEach((cell, index) =>
      expect(opens[cell]).toBeCloseTo(at(0.5 + (16.5 * index) / order.length)),
    )
    for (let cell = 0; cell < TILE_GRID * TILE_GRID; cell++) {
      if (!order.includes(cell)) expect(opens[cell]).toBeCloseTo(1 - 0.25 / 17)
    }
    expect(closed(at(0.5), 9)).toHaveLength(25)
    const beforeEnd = closed(at(16.7), 9)
    expect(beforeEnd.filter((cell) => item.includes(cell))).toEqual([])
    expect(beforeEnd).toHaveLength(25 - item.length)
    const midway = closed(at(8.5), 9)
    for (const cell of order.slice(Math.ceil(order.length / 2) + 1)) expect(midway).toContain(cell)
  })

  it('fades a tile out over 0.25 s with no flip', () => {
    const order = tileOrder(pickaxe, 9)
    const second = order[1]!
    const opensAt = 0.5 + 16.5 / order.length
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
    TILES.draw(pen, pickaxe, at(0.6), 9, LOOK)
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

  it('drops its pieces into the empty box row by row before the hole shows', () => {
    const draw = (seconds: number) => {
      const pen = recorder()
      SLIDE_PUZZLE.draw(
        pen,
        picture(50, () => true),
        at(seconds),
        77,
        LOOK,
      )
      return pen
    }
    expect(draw(0).images).toEqual([])
    const dropping = draw(0.25)
    expect(dropping.images.length).toBeGreaterThan(0)
    expect(dropping.images.length).toBeLessThan(24)
    expect(dropping.fills.find(({ style }) => style === 'dark')!.alpha).toBeCloseTo(0.5)
    const dropped = draw(0.5)
    expect(dropped.images.map(({ alpha }) => alpha)).toEqual(Array(24).fill(1))
    const { pieces } = puzzleAt(77, at(0.5))
    for (const { column, row } of pieces) {
      expect(dropped.images).toContainEqual({
        alpha: 1,
        box: [expect.any(Number), expect.any(Number), 10, 10, column * 10, row * 10, 10, 10],
      })
    }
  })

  it('waits for the entrance, then eases each slide over 60% of its slot', () => {
    const slot = (17 - 0.8 - 0.5) / PUZZLE_SLIDES
    const moving = (seconds: number) =>
      puzzleAt(77, at(seconds)).pieces.find(
        ({ column, row }) => !Number.isInteger(column) || !Number.isInteger(row),
      )
    expect(puzzleAt(77, at(0.5))).toEqual(puzzleAt(77, 0))
    expect(moving(0.5 + slot * 3)).toBeUndefined()
    expect(moving(0.5 + slot * 3.3)).toBeDefined()
    expect(moving(0.5 + slot * 3.61)).toBeUndefined()
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

describe('Lantern', () => {
  it('grows its light from 9% to 36% of the picture, with p squared', () => {
    expect(lanternRadius(0)).toBeCloseTo(0.09)
    expect(lanternRadius(0.5)).toBeCloseTo(0.09 + 0.27 / 4)
    expect(lanternRadius(1)).toBeCloseTo(0.36)
    for (const seed of [0, 5, 4_000_000_000]) {
      // The flicker moves it by 5.5% at most.
      for (const [p, radius] of [
        [0, 0.09],
        [1, 0.36],
      ] as const) {
        expect(lanternLight(p, seed).radius).toBeGreaterThanOrEqual(radius * 0.945)
        expect(lanternLight(p, seed).radius).toBeLessThanOrEqual(radius * 1.055)
      }
    }
  })

  it('wanders the same seeded path on every screen, swaying less as it grows', () => {
    const path = (seed: number) => Array.from({ length: 50 }, (_, n) => lanternLight(n / 50, seed))
    expect(path(31)).toEqual(path(31))
    expect(path(31)).not.toEqual(path(32))
    for (const seed of [1, 2, 3, 4]) {
      for (let n = 0; n <= 100; n++) {
        const { x, y } = lanternLight(n / 100, seed)
        const sway = 1 - 0.6 * (n / 100)
        expect(Math.abs(x - 0.5)).toBeLessThanOrEqual(0.3 * sway + 1e-9)
        expect(Math.abs(y - 0.5)).toBeLessThanOrEqual(0.26 * sway + 1e-9)
      }
    }
  })

  /** What Lantern draws at `seconds`: each fill's way of compositing and its gradient. */
  const lantern = (seconds: number) => {
    const pen = recorder()
    LANTERN.draw(
      pen,
      picture(40, () => true),
      at(seconds),
      7,
      LOOK,
    )
    const gradients = pen.calls.filter(([name]) => name === 'createRadialGradient')
    return { pen, gradients }
  }

  /** The alpha a gradient's last stop leaves outside it. */
  const outside = (gradient: Call): number =>
    Number(/([\d.]+)\)$/.exec((gradient.at(-1) as [number, string][]).at(-1)![1])![1])

  it('shows the item only in the light, never dark over the stage or the shape of the item', () => {
    const { pen, gradients } = lantern(3)
    const { x, y, radius } = lanternLight(at(3), 7)
    expect(pen.calls[0]).toEqual(['drawImage', IMAGE, 0, 0])
    const mask = pen.fills.find(({ op }) => op === 'destination-in')!
    expect(mask.box).toEqual([0, 0, 40, 40])
    const shown = gradients[1]!
    expect(shown.slice(1, 7)).toEqual([x * 40, y * 40, 0, x * 40, y * 40, radius * 40])
    expect(outside(shown)).toBe(0)
    expect(pen.fills.filter(({ op }) => op === 'source-over')).toEqual([])
    expect(pen.globalCompositeOperation).toBe('source-over')
  })

  it('casts a warm pool on the stage behind the item that fades out inside the box', () => {
    for (const seconds of [0.5, 3, 9, 15]) {
      const { pen, gradients } = lantern(seconds)
      const { x, y } = lanternLight(at(seconds), 7)
      expect(pen.fills.at(-1)!.op).toBe('destination-over')
      const pool = gradients.at(-1)!
      const reach = pool[6] as number
      expect(reach).toBeGreaterThan(0)
      expect(reach).toBeLessThanOrEqual(Math.min(x, y, 1 - x, 1 - y) * 40 + 1e-9)
      expect(outside(pool)).toBe(0)
    }
  })

  it('flares up as answers open, and lights the whole item up over the last 0.8 s', () => {
    expect(lantern(0).gradients[0]![6]).toBe(1e-3)
    expect(lantern(0.25).gradients[1]![6]).toBeCloseTo(lanternLight(at(0.25), 7).radius * 40 * 0.5)
    expect(outside(lantern(16.1).gradients[1]!)).toBe(0)
    expect(outside(lantern(16.6).gradients[1]!)).toBeCloseTo(0.5)
    expect(outside(lantern(16.995).gradients[1]!)).toBeGreaterThan(0.99)
  })
})

describe('Sketch', () => {
  // A plus sign: a 12px bar each way, crossing in the middle of a 40px square.
  const plus = picture(
    40,
    (x, y) => (x >= 14 && x < 26 && y >= 4 && y < 36) || (y >= 14 && y < 26 && x >= 4 && x < 36),
  )
  const onEdge = ([x, y]: [number, number]): boolean => {
    const solid = (px: number, py: number) =>
      plus.data[(Math.floor(py) * 40 + Math.floor(px)) * 4 + 3] === 255
    return [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ].some(([dx, dy]) => solid(x + dx!, y + dy!) !== solid(x - dx!, y - dy!))
  }

  it('outlines a shape with one closed path round it, from the seeded point on its edge', () => {
    for (const seed of [0, 17, 4_000_000_000]) {
      const loops = sketchOutline(plus, seed)
      expect(loops).toHaveLength(1)
      const loop = loops[0]!
      expect(loop[0]).toEqual(loop.at(-1))
      for (const point of loop) expect(onEdge(point), `${point}`).toBe(true)
      // The shoelace area: the path goes all the way round the plus's 12 × 32 × 2 − 12².
      let area = 0
      loop.forEach(([x, y], i) => {
        const [nx, ny] = loop[(i + 1) % loop.length]!
        area += (x * ny - nx * y) / 2
      })
      expect(area).toBeGreaterThan(624 - 40)
      expect(area).toBeLessThan(624)
      expect(sketchOutline(plus, seed)).toEqual(loops)
    }
    const starts = [0, 1, 2, 50, 99].map((seed) => sketchOutline(plus, seed)[0]![0])
    expect(new Set(starts.map(String)).size).toBe(5)
  })

  it('outlines each part, biggest first, leaving out specks and holes', () => {
    const parts = picture(
      40,
      (x, y) =>
        (x >= 2 && x < 22 && y >= 2 && y < 22 && !(x >= 8 && x < 16 && y >= 8 && y < 16)) ||
        (x >= 28 && x < 36 && y >= 28 && y < 36) ||
        (x === 38 && y === 2),
    )
    const loops = sketchOutline(parts, 3)
    expect(loops).toHaveLength(2)
    expect(Math.min(...loops[0]!.map(([x]) => x))).toBeLessThan(3)
    expect(Math.min(...loops[1]!.map(([x]) => x))).toBeGreaterThan(27)
  })

  it('finds inner lines where the colours change, and not in a flat colour', () => {
    const halves = picture(20, () => true)
    for (let y = 0; y < 20; y++) {
      for (let x = 10; x < 20; x++) halves.data.set([240, 230, 200, 255], (y * 20 + x) * 4)
    }
    const lines = innerLines(halves)
    expect(lines[10 * 20 + 9]).toBe(255)
    expect(lines[10 * 20 + 10]).toBe(255)
    expect(lines[10 * 20 + 4]).toBe(0)
    expect(lines[10 * 20 + 15]).toBe(0)
    expect(innerLines(picture(20, () => false)).every((dark) => dark === 0)).toBe(true)
  })

  it('traces the outline over 6 s, fades the lines in, then washes the colour in', () => {
    expect(OUTLINE_TIME).toBeCloseTo(6 / 17)
    expect(WASH_FROM).toBeCloseTo(OUTLINE_TIME + (1 - OUTLINE_TIME) * 0.35)
    expect(SKETCH_SETTLE).toBeCloseTo(0.8 / 17)
    const phase = (seconds: number) => sketchPhase(at(seconds))
    expect(phase(0)).toEqual({ traced: 0, tip: true, outline: 1, lines: 0, colour: 0 })
    expect(phase(3).traced).toBeCloseTo(0.5, 1)
    expect(phase(5.9).tip).toBe(true)
    expect(phase(5.9).lines).toBe(0)
    let traced = 0
    for (let n = 0; n <= 600; n++) {
      const now = phase(n / 100).traced
      expect(now).toBeGreaterThanOrEqual(traced)
      traced = now
    }
    expect(phase(6)).toMatchObject({ traced: 1, tip: false, lines: 0, colour: 0 })
    expect(phase(6.75).lines).toBeCloseTo(0.5)
    expect(phase(7.5).lines).toBeCloseTo(1)
    expect(phase(9.84).colour).toBe(0)
    expect(phase(9.9).colour).toBeGreaterThan(0)
    expect(phase(16.2)).toMatchObject({ outline: 1, lines: 1 })
    expect(phase(16.2).colour).toBeCloseTo(0.85)
    expect(phase(16.6).lines).toBeCloseTo(0.5)
    expect(phase(16.6).colour).toBeCloseTo(0.925)
    expect(phase(16.999).outline).toBeLessThan(0.01)
    expect(phase(16.999).colour).toBeGreaterThan(0.99)
  })

  it('draws the pen tip where the traced line ends, in the theme, until the outline is done', () => {
    const draw = (seconds: number) => {
      const pen = recorder()
      SKETCH.draw(pen, plus, at(seconds), 17, LOOK)
      return pen.calls
    }
    const start = sketchOutline(plus, 17)[0]![0]!
    const early = draw(0.05)
    expect(early.find(([name]) => name === 'moveTo')).toEqual(['moveTo', ...start])
    expect(early.find(([name]) => name === 'stroke')).toEqual(['stroke', 'ink', 1])
    const lastLine = early.findLast(([name]) => name === 'lineTo')!
    const tip = early.find(([name]) => name === 'arc')!
    expect(tip.slice(1, 3)).toEqual(lastLine.slice(1, 3))
    expect(early.find(([name]) => name === 'fill')).toEqual(['fill', 'bad', 1])
    expect(early.some(([name]) => name === 'drawImage')).toBe(false)
    const outlined = draw(6.5)
    expect(outlined.some(([name]) => name === 'arc')).toBe(false)
    const lines = outlined.filter(([name]) => name === 'lineTo')
    expect(lines.at(-1)!.slice(1)).toEqual(start)
    expect(draw(12).filter(([name]) => name === 'drawImage')[0]).toEqual(['drawImage', IMAGE, 0, 0])
  })
})
