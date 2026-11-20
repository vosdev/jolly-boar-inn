import { describe, expect, it } from 'vitest'

import { centreOf, croppable, cropAt, sentSize } from './photoCrop'

describe('a 16:9 cut of a screenshot', () => {
  it('is the largest one, in the middle, to start with', () => {
    expect(cropAt(1920, 1080, 1)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
    expect(cropAt(1000, 1000, 1)).toEqual({ x: 4, y: 221, width: 992, height: 558 })
    expect(cropAt(2560, 1080, 1)).toEqual({ x: 320, y: 0, width: 1920, height: 1080 })
  })

  it('is always whole steps of 16 by 9', () => {
    for (const [w, h, scale] of [
      [1366, 768, 1],
      [1000, 1000, 0.55],
      [3440, 1440, 0.7],
    ] as const) {
      const crop = cropAt(w, h, scale)
      expect(crop.width / 16).toBe(crop.height / 9)
      expect(Number.isInteger(crop.width / 16)).toBe(true)
    }
  })

  it('moves to the middle asked for and stays on the picture', () => {
    const crop = cropAt(1920, 1080, 0.5, { x: 0.25, y: 0.5 })
    expect(crop).toEqual({ x: 0, y: 270, width: 960, height: 540 })
    expect(cropAt(1920, 1080, 0.5, { x: 1, y: 1 })).toEqual({
      x: 960,
      y: 540,
      width: 960,
      height: 540,
    })
    expect(centreOf(cropAt(1920, 1080, 0.5), 1920, 1080)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('never gets shorter than the server takes', () => {
    expect(cropAt(1920, 1080, 0.01).height).toBeGreaterThanOrEqual(200)
    expect(croppable(400, 400)).toBe(true)
    expect(croppable(300, 1000)).toBe(false)
  })

  it('goes up at most 1920 across, still 16:9', () => {
    expect(sentSize({ x: 0, y: 0, width: 3840, height: 2160 })).toEqual({
      width: 1920,
      height: 1080,
    })
    expect(sentSize({ x: 0, y: 0, width: 992, height: 558 })).toEqual({ width: 992, height: 558 })
  })
})
