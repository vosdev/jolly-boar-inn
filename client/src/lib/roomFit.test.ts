import { describe, expect, it } from 'vitest'

import { PLAY, ROOM, roomFit, stageEdges } from './roomFit'

const BAR = 56

describe('roomFit', () => {
  it('fills a 1440×900 and a 1366×768 window at its own size', () => {
    for (const view of [
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
    ]) {
      const fit = roomFit(view, BAR)
      expect(fit?.scale).toBe(1)
      expect(fit?.width).toBeCloseTo(view.width)
      expect(fit?.height).toBe(view.height - BAR)
      expect(fit?.left).toBeCloseTo(0)
    }
  })

  it('scales up as a whole at 1920×1080 and 2560×1440, filling the window', () => {
    for (const view of [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
    ]) {
      const fit = roomFit(view, BAR)
      expect(fit?.scale).toBeGreaterThan(1)
      expect(fit?.height).toBeCloseTo(ROOM.height)
      expect((fit?.width ?? 0) * (fit?.scale ?? 0)).toBeCloseTo(view.width)
    }
  })

  it('is 16:9 of the window and centred at 3440×1440, the floor at both sides', () => {
    const fit = roomFit({ width: 3440, height: 1440 }, BAR)
    if (fit === null) throw new Error('not fitted')
    const drawn = fit.width * fit.scale
    expect(drawn).toBeCloseTo((1440 * 16) / 9)
    expect(fit.left).toBeCloseTo((3440 - drawn) / 2)
    expect(fit.left).toBeGreaterThan(0)
  })

  it('lays out at 1280×640 and scales down below it', () => {
    const fit = roomFit({ width: 1100, height: 700 }, BAR)
    expect(fit?.scale).toBeCloseTo(1100 / 1280)
    expect(fit?.width).toBeCloseTo(1280)
  })

  it('keeps the layout width on a short wide window, the floor at the sides', () => {
    const fit = roomFit({ width: 1920, height: 800 }, BAR)
    expect(fit?.scale).toBe(1)
    expect(fit?.width).toBe(ROOM.width)
    expect(fit?.left).toBe(160)
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
    const fit = { scale: 2, width: 1600, height: 920, left: 100 }
    const edges = stageEdges(fit)
    expect(edges.left).toBe(100 + PLAY.side * 2)
    expect(edges.width).toBe((1600 - 2 * PLAY.side - PLAY.gap - PLAY.tableReveal) * 2)
  })
})
