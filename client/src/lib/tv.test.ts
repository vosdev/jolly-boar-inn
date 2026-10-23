import { describe, expect, it } from 'vitest'

import type { PlayerView } from './protocol'
import { TV_ROWS, answersOnly, crawlHeight, fitScale, tvMinHeight } from './tv'

function player(id: string, role: PlayerView['role'], connected = true): PlayerView {
  return {
    id,
    display_name: id,
    avatar: null,
    role,
    team: null,
    connected,
    ready: false,
    editing: false,
  }
}

describe('answersOnly', () => {
  const you = player('you', 'player')

  it('is on for a player while the TV is connected', () => {
    expect(answersOnly([you, player('tv', 'tv')], you)).toBe(true)
  })

  it('is on for an admin too', () => {
    const admin = player('you', 'admin')
    expect(answersOnly([admin, player('tv', 'tv')], admin)).toBe(true)
  })

  it('is off while the TV is disconnected, and with no TV', () => {
    expect(answersOnly([you, player('tv', 'tv', false)], you)).toBe(false)
    expect(answersOnly([you, player('ann', 'player')], you)).toBe(false)
  })

  it('is off for the TV itself', () => {
    const tv = player('tv', 'tv')
    expect(answersOnly([you, tv], tv)).toBe(false)
  })
})

describe('fitScale', () => {
  const box = (natural: { width: number; height: number }, view: typeof natural) => {
    const scale = fitScale(natural, view)
    return { width: natural.width * scale, height: natural.height * scale }
  }

  it('fills 80% of a landscape window along the side it reaches first', () => {
    const tall = box({ width: 740, height: 560 }, { width: 1920, height: 1080 })
    expect(tall.height).toBeCloseTo(864)
    expect(tall.width).toBeLessThanOrEqual(1536)
    const wide = box({ width: 1000, height: 300 }, { width: 1920, height: 1080 })
    expect(wide.width).toBeCloseTo(1536)
    expect(wide.height).toBeLessThanOrEqual(864)
  })

  it('fills 80% of a portrait window the same way', () => {
    const stage = box({ width: 480, height: 700 }, { width: 1080, height: 1920 })
    expect(stage.width).toBeCloseTo(864)
    expect(stage.height).toBeLessThanOrEqual(1536)
    const long = box({ width: 480, height: 1200 }, { width: 1080, height: 1920 })
    expect(long.height).toBeCloseTo(1536)
    expect(long.width).toBeLessThanOrEqual(864)
  })

  it('leaves a stage with no size yet as it is', () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 1920, height: 1080 })).toBe(1)
  })
})

describe('tvMinHeight', () => {
  it("gives the stage the window's shape, so it fills both ways at one scale", () => {
    for (const view of [
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
    ]) {
      const width = 856
      const height = tvMinHeight(width, view)
      const scale = fitScale({ width, height }, view)
      expect(width * scale).toBeCloseTo(0.8 * view.width)
      expect(height * scale).toBeCloseTo(0.8 * view.height)
    }
  })
})

describe('crawlHeight', () => {
  const bottoms = (n: number) => Array.from({ length: n }, (_, i) => 100 + (i + 1) * 30)

  it('leaves a table that fits whole', () => {
    expect(crawlHeight(100, bottoms(TV_ROWS))).toBeNull()
  })

  it('clips a longer one at the foot of its last shown row', () => {
    expect(crawlHeight(100, bottoms(TV_ROWS + 3))).toBe(TV_ROWS * 30)
  })
})
