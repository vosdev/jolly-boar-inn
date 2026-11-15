import { describe, expect, it } from 'vitest'

import fixtures from './picturePins.fixture.json'
import {
  answerFor,
  cellOf,
  drawnAt,
  fractionAt,
  pictureCredit,
  placed,
  spotOf,
  targetBoxes,
  type Drawn,
  type PicturePinData,
} from './picturePins'

const WIDE: PicturePinData = {
  width: 1600,
  height: 900,
  target: { min_x: 0.4, max_x: 0.5, min_y: 0.4, max_y: 0.6 },
  reach: 0.2,
}

const INVENTORY: PicturePinData = {
  width: 400,
  height: 700,
  grid: { cols: 4, rows: 7 },
  cells: [{ col: 2, row: 3 }],
}

/** The one 16:9 picture as a phone, a desktop and the TV draw it, the TV scaled to 80%. */
const SCREENS: Record<string, Drawn> = {
  phone: { left: 16, top: 312, width: 343, height: 343 * (9 / 16) },
  desktop: { left: 240, top: 180, width: 960, height: 540 },
  tv: { left: 192 + 0.8 * 40, top: 108 + 0.8 * 300, width: 0.8 * 1200, height: 0.8 * 675 },
}

describe('the server grades the same way', () => {
  it.each(fixtures)('$about', (fixture) => {
    const question = fixture.question as PicturePinData
    const value = answerFor(fixture.point, question.grid)
    expect(value.x).toBeCloseTo(fixture.value.x, 9)
    expect(value.y).toBeCloseTo(fixture.value.y, 9)
    expect(pictureCredit(value, question)).toBeCloseTo(fixture.credit, 9)
  })
})

describe('a phone, a desktop and the TV place an answer on the same spot', () => {
  const answers = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0.45, y: 0.5 },
    { x: 0.137, y: 0.861 },
  ]

  it.each(Object.entries(SCREENS))('%s draws each answer where its tap would send it', (_, box) => {
    for (const answer of answers) {
      const at = drawnAt(answer, box)
      const back = fractionAt(at.x, at.y, box)
      expect(back.x).toBeCloseTo(answer.x, 9)
      expect(back.y).toBeCloseTo(answer.y, 9)
    }
  })

  it('sends one answer for a tap on the same spot of the picture on every screen', () => {
    const spot = { x: 0.62, y: 0.31 }
    const sent = Object.values(SCREENS).map((box) => {
      const at = drawnAt(spot, box)
      return fractionAt(at.x, at.y, box)
    })
    for (const one of sent) {
      expect(one.x).toBeCloseTo(spot.x, 9)
      expect(one.y).toBeCloseTo(spot.y, 9)
    }
    const credits = sent.map((one) => pictureCredit(one, WIDE))
    expect(new Set(credits.map((credit) => credit.toFixed(9))).size).toBe(1)
  })

  it('snaps a tap to the same cell on every screen', () => {
    const tall: Record<string, Drawn> = {
      phone: { left: 16, top: 200, width: 343, height: 600.25 },
      tv: { left: 700, top: 100, width: 0.8 * 500, height: 0.8 * 875 },
    }
    const cells = Object.values(tall).map((box) => {
      const at = drawnAt({ x: 0.6, y: 0.45 }, box)
      return cellOf(fractionAt(at.x, at.y, box), INVENTORY.grid!)
    })
    expect(cells).toEqual([
      { col: 2, row: 3 },
      { col: 2, row: 3 },
    ])
  })

  it('keeps a tap outside the picture on its edge', () => {
    const box = SCREENS.desktop!
    expect(fractionAt(box.left - 30, box.top + box.height + 10, box)).toEqual({ x: 0, y: 1 })
  })
})

describe('placed', () => {
  it('measures a miss on the picture and sends its line to the nearest spot of the box', () => {
    const miss = placed({ x: 0.6, y: 0.8 }, WIDE)
    expect(miss.to).toEqual({ x: 0.5, y: 0.6 })
    expect(miss.off).toBeCloseTo(Math.hypot(0.1, 0.2 * (900 / 1600)), 9)
  })

  it('is 0 off anywhere on the target', () => {
    expect(placed({ x: 0.4, y: 0.6 }, WIDE).off).toBe(0)
    expect(placed(answerFor({ x: 0.55, y: 0.44 }, INVENTORY.grid), INVENTORY).off).toBe(0)
  })

  it('goes to the nearest of several target cells', () => {
    const two = { ...INVENTORY, cells: [{ col: 0, row: 0 }, ...INVENTORY.cells!] }
    expect(targetBoxes(two)).toHaveLength(2)
    expect(placed({ x: 0.9, y: 0.5 }, two).to.x).toBeCloseTo(0.75, 9)
  })
})

describe('spotOf', () => {
  it('reads a point and nothing else', () => {
    expect(spotOf({ x: 0.2, y: 0.3 })).toEqual({ x: 0.2, y: 0.3 })
    expect(spotOf([{ x: 0.2, y: 0.3 }])).toBeNull()
    expect(spotOf(null)).toBeNull()
    expect(spotOf({ x: '0.2', y: 0.3 })).toBeNull()
  })
})
