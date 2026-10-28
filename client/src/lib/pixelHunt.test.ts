/**
 * Pixel Hunt's reveals: every screen picks the same one from the room and the question,
 * Zoom out starts on the item, Pixelate keeps its eight levels to the minute, and the picture
 * is whole once the build-up is over.
 */

import { describe, expect, it } from 'vitest'

import {
  BUILD_UP,
  PIXEL_LEVELS,
  PIXELATE,
  REVEALS,
  ZOOM_OUT,
  drawFrame,
  opaquePixel,
  pixelBlocks,
  progress,
  revealFor,
  zoomScale,
  type Pen,
  type Picture,
} from './pixelHunt'

const IMAGE = { id: 'the image' } as unknown as CanvasImageSource

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

/** A pen that writes down what it is asked to do. */
function recorder(): Pen & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    fillStyle: '',
    imageSmoothingEnabled: true,
    clearRect: (...args: number[]) => void calls.push(['clearRect', ...args]),
    fillRect: (...args: number[]) => void calls.push(['fillRect', ...args]),
    setTransform: ((...args: number[]) =>
      void calls.push(['setTransform', ...args])) as Pen['setTransform'],
    drawImage: ((...args: unknown[]) =>
      void calls.push(['drawImage', ...args])) as Pen['drawImage'],
  }
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

  it('uses both offered reveals over a 20-question sample, with seeds of their own', () => {
    const picked = Array.from({ length: 20 }, (_, n) =>
      revealFor('WHIPLASH', `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`),
    )
    expect(new Set(picked.map(({ reveal }) => reveal.id))).toEqual(
      new Set(['zoom_out', 'pixelate']),
    )
    expect(new Set(picked.map(({ seed }) => seed)).size).toBe(20)
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
      ZOOM_OUT.draw(pen, whip, 0, seed)
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
    ZOOM_OUT.draw(pen, whip, 1, 3)
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
    PIXELATE.draw(pen, half, 0.3, 0)
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
        drawFrame(pen, whole, reveal, progress(OPENS, ENDS, OPENS + seconds * 1000), 9)
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
    )
    expect(pen.calls.filter(([name]) => name === 'fillRect')).toHaveLength(16 * 16)
  })
})
