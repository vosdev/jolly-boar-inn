import { describe, expect, it } from 'vitest'

import {
  boxBetween,
  boxProblem,
  cellsProblem,
  fileProblem,
  gridSide,
  PICTURE_MAX_BYTES,
  shapeProblem,
  toggleCell,
} from './suggestPicture'

describe('a suggested screenshot', () => {
  it('is a PNG, JPEG or WebP of up to 5 MB', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp'])
      expect(fileProblem({ type, size: PICTURE_MAX_BYTES })).toBeNull()
    expect(fileProblem({ type: 'image/gif', size: 10 })).toMatch(/PNG, JPEG or WebP/)
    expect(fileProblem({ type: 'image/png', size: PICTURE_MAX_BYTES + 1 })).toMatch(/5 MB/)
  })

  it('is at least 200 pixels each way', () => {
    expect(shapeProblem(200, 200)).toBeNull()
    expect(shapeProblem(800, 199)).toMatch(/200 pixels/)
  })
})

describe('a target box', () => {
  it('spans two corners either way round, kept on the picture', () => {
    expect(boxBetween({ x: 0.6, y: 1.2 }, { x: 0.2004, y: 0.3 })).toEqual({
      min_x: 0.2,
      max_x: 0.6,
      min_y: 0.3,
      max_y: 1,
    })
  })

  it('is at least a fiftieth of the longer side across, as the server holds it', () => {
    expect(boxProblem(null, 800, 450)).toMatch(/Drag a box/)
    const tall = { min_x: 0.4, max_x: 0.42, min_y: 0.1, max_y: 0.9 }
    expect(boxProblem(tall, 800, 450)).toBeNull()
    // 0.02 of the height is under 0.02 of the longer width.
    const flat = { min_x: 0.1, max_x: 0.9, min_y: 0.4, max_y: 0.42 }
    expect(boxProblem(flat, 800, 450)).toMatch(/bigger/)
  })
})

describe('target cells', () => {
  it('are some cells of the grid, not all of them', () => {
    expect(cellsProblem([], 2, 2)).toMatch(/at least one/)
    const all = [0, 1].flatMap((row) => [0, 1].map((col) => ({ col, row })))
    expect(cellsProblem(all, 2, 2)).toMatch(/unpicked/)
    expect(cellsProblem(all, 3, 2)).toBeNull()
    expect(cellsProblem([{ col: 5, row: 0 }], 2, 2)).toMatch(/at least one/)
  })

  it('toggle, top left first', () => {
    const cells = toggleCell(toggleCell([], { col: 1, row: 1 }), { col: 0, row: 1 })
    expect(cells).toEqual([
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ])
    expect(toggleCell(cells, { col: 0, row: 1 })).toEqual([{ col: 1, row: 1 }])
  })

  it('sit on a grid of 1 to 16 a side', () => {
    expect([gridSide(0), gridSide(4.4), gridSide(40), gridSide(Number.NaN)]).toEqual([1, 4, 16, 1])
  })
})
