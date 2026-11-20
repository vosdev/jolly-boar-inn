import { describe, expect, it } from 'vitest'

import { FIT_HEIGHT, PADDING, PLAY, ROOM_HEIGHT, roomFit, stageEdges } from './roomFit'

const BAR = 56

describe('roomFit', () => {
  it('picks the largest step that leaves the room its least size', () => {
    const cases: [number, number, number][] = [
      [1512, 980, 1],
      [1512, 807, 7 / 8],
      [1512, 774, 7 / 8],
      [1366, 768, 7 / 8],
      [1280, 700, 3 / 4],
    ]
    for (const [width, height, scale] of cases) {
      const fit = roomFit({ width, height }, BAR)
      expect(fit?.scale, `${width}×${height}`).toBe(scale)
      expect(fit?.height).toBeGreaterThanOrEqual(FIT_HEIGHT)
    }
  })

  it('keeps the last step below it, laid out at the fit height so the page scrolls', () => {
    for (const view of [
      { width: 1280, height: 600 },
      { width: 1280, height: 450 },
      { width: 1100, height: 450 },
      { width: 1132, height: 340 },
    ]) {
      const fit = roomFit(view, BAR)
      expect(fit?.scale, `${view.width}×${view.height}`).toBe(3 / 4)
      expect(fit?.height).toBe(FIT_HEIGHT)
    }
  })

  it('lays out at the window’s own height between the fit height and the full one', () => {
    const fit = roomFit({ width: 1440, height: 900 }, BAR)
    expect(fit?.scale).toBe(1)
    expect(fit?.height).toBe(900 - BAR)
  })

  it('is compact under 920px of layout height and not at 920', () => {
    expect(roomFit({ width: 1512, height: ROOM_HEIGHT - 1 + BAR }, BAR)?.compact).toBe(true)
    expect(roomFit({ width: 1512, height: ROOM_HEIGHT + BAR }, BAR)?.compact).toBe(false)
    expect(roomFit({ width: 1512, height: 774 }, BAR)?.compact).toBe(true)
    expect(roomFit({ width: 2560, height: 1440 }, BAR)?.compact).toBe(false)
  })

  it('never draws above 1, laying out no taller than 920 and leaving the rest to the floor', () => {
    for (const view of [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 3440, height: 1440 },
    ]) {
      const fit = roomFit(view, BAR)
      expect(fit?.scale, `${view.width}×${view.height}`).toBe(1)
      expect(fit?.height).toBe(ROOM_HEIGHT)
    }
  })

  it('stands the table 28px right of the stage at every step, the floor taking the rest', () => {
    const views = [
      { width: 1512, height: 980 },
      { width: 1512, height: 774 },
      { width: 1280, height: 700 },
      { width: 1280, height: 600 },
      { width: 1100, height: 450 },
      { width: 1920, height: 800 },
      { width: 3440, height: 1440 },
    ]
    for (const view of views) {
      const fit = roomFit(view, BAR)
      if (fit === null) throw new Error('not fitted')
      const side = (fit.compact ? PADDING.compact : PADDING.full).side
      const stage = stageEdges(fit)
      const tableLeft = fit.left + (fit.width - side - PLAY.tableReveal) * fit.scale
      expect(tableLeft - (stage.left + stage.width)).toBeCloseTo(PLAY.gap * fit.scale)
      expect(stage.width).toBeLessThanOrEqual(PLAY.stageWide * fit.scale + 1e-9)
      expect(fit.left).toBeGreaterThanOrEqual(0)
      expect(fit.left * 2 + fit.width * fit.scale).toBeCloseTo(view.width)
    }
  })

  it('gives the extra width of a wide window to the floor, not the gap', () => {
    const fit = roomFit({ width: 1920, height: 1080 }, BAR)
    if (fit === null) throw new Error('not fitted')
    expect(fit.width).toBe(2 * PADDING.full.side + PLAY.stageWide + PLAY.gap + PLAY.tableReveal)
    expect(stageEdges(fit).width).toBeCloseTo(PLAY.stageWide * fit.scale)
    expect(fit.left).toBeCloseTo((1920 - fit.width * fit.scale) / 2)
  })

  it('fits a 1024px wide window at 3/4 with no sideways scroll, however short', () => {
    for (const height of [1400, 800, 600, 400]) {
      const fit = roomFit({ width: 1024, height }, BAR)
      if (fit === null) throw new Error('not fitted')
      expect(fit.scale, `1024×${height}`).toBeGreaterThanOrEqual(3 / 4)
      expect(fit.left).toBeGreaterThanOrEqual(0)
      expect(fit.width * fit.scale).toBeLessThanOrEqual(1024)
    }
  })

  it('stacks under 1024px wide, whatever the shape', () => {
    expect(roomFit({ width: 1023, height: 1400 }, BAR)).toBeNull()
    expect(roomFit({ width: 800, height: 600 }, BAR)).toBeNull()
  })

  it('keeps a portrait monitor on the desktop layout', () => {
    expect(roomFit({ width: 1080, height: 1920 }, BAR)).not.toBeNull()
  })
})

describe('stageEdges', () => {
  it('leaves the gap and a column as wide as the reveal needs on the right', () => {
    const fit = { scale: 2, width: 1448, height: 920, left: 100, compact: false }
    const edges = stageEdges(fit)
    expect(edges.left).toBe(100 + PADDING.full.side * 2)
    expect(edges.width).toBe(PLAY.stageWide * 2)
  })

  it('stands the stage in the middle of a room with no table column', () => {
    const fit = { scale: 2, width: 1448, height: 920, left: 100, compact: false }
    const edges = stageEdges(fit, true)
    expect(edges.width).toBe(PLAY.stageWide * 2)
    expect(edges.left * 2 + edges.width).toBe(100 * 2 + 1448 * 2)
  })

  it('keeps a centred stage inside a narrow room’s padding', () => {
    const fit = { scale: 1, width: 1000, height: 800, left: 12, compact: true }
    const edges = stageEdges(fit, true)
    expect(edges.left).toBe(12 + PADDING.compact.side)
    expect(edges.width).toBe(1000 - 2 * PADDING.compact.side)
  })

  it('measures from the compact padding on a compact room', () => {
    const fit = { scale: 1, width: 1280, height: 800, left: 0, compact: true }
    const edges = stageEdges(fit)
    expect(edges.left).toBe(PADDING.compact.side)
    expect(edges.width).toBe(1280 - 2 * PADDING.compact.side - PLAY.gap - PLAY.tableReveal)
  })
})
