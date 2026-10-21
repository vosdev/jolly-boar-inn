import { describe, expect, it } from 'vitest'

import {
  BALLOON_COLOURS,
  type Drop,
  FLOORS,
  type FloorTheme,
  hasFloor,
  scatter,
  shade,
  SPRITES,
} from './floor'

const THEMES = Object.keys(FLOORS) as FloorTheme[]

const kinds = (drops: Drop[]): Set<string> =>
  new Set(drops.map((drop) => (drop.kind === 'sprite' ? drop.sprite : drop.kind)))

describe.each(THEMES)('scatter on the %s floor', (theme) => {
  const floor = FLOORS[theme]

  it('lays the same floor for the same seed and size', () => {
    expect(scatter(floor, 900, 1300, 31)).toEqual(scatter(floor, 900, 1300, 31))
  })

  it('scatters differently each visit', () => {
    expect(scatter(floor, 1280, 1280, 1)).not.toEqual(scatter(floor, 1280, 1280, 2))
  })

  it('leaves what already lies there when the page grows', () => {
    const short = scatter(floor, 1280, 1280, 77)
    const tall = scatter(floor, 1280, 2560, 77)
    expect(tall.slice(0, short.length)).toEqual(short)
    expect(tall.length).toBeGreaterThan(short.length)
  })

  it('keeps everything on the floor', () => {
    for (const drop of scatter(floor, 333, 517, 9)) {
      expect(drop.x).toBeGreaterThan(0)
      expect(drop.y).toBeGreaterThan(0)
      expect(drop.x).toBeLessThan(Math.ceil(333 / floor.tile) * floor.tile)
      expect(drop.y).toBeLessThan(Math.ceil(517 / floor.tile) * floor.tile)
    }
  })

  it('drops on about its share of tiles', () => {
    const tiles = (2560 / floor.tile) * (5120 / floor.tile)
    const share = scatter(floor, 2560, 5120, 4242).length / tiles
    expect(Math.abs(share - floor.chance)).toBeLessThan(0.03)
  })

  it('lays nothing on a floor with no size', () => {
    expect(scatter(floor, 0, 0, 5)).toEqual([])
  })
})

describe('what lies on each floor', () => {
  const large = (theme: FloorTheme): Drop[] => scatter(FLOORS[theme], 2560, 5120, 99)

  it('strews the Party Room with balloons in the game colours and about one partyhat in six', () => {
    const drops = large('party_room')
    expect(kinds(drops)).toEqual(new Set(['balloon', 'hat']))
    const hats = drops.filter((drop) => drop.kind === 'hat').length
    expect(hats / drops.length).toBeGreaterThan(0.12)
    expect(hats / drops.length).toBeLessThan(0.22)
    const colours = new Set(drops.flatMap((drop) => (drop.kind === 'balloon' ? [drop.colour] : [])))
    expect([...colours].sort()).toEqual([...BALLOON_COLOURS].sort())
  })

  it('lays the Party Room exactly as before the other floors came', () => {
    const drops = scatter(FLOORS.party_room, 320, 192, 2024)
    expect(drops.map((drop) => [drop.kind, Math.round(drop.x), Math.round(drop.y)])).toEqual([
      ['balloon', 77, 37],
      ['balloon', 44, 88],
      ['hat', 282, 83],
      ['balloon', 207, 150],
    ])
    expect(drops[0]).toMatchObject({ colour: '#3ddd3a' })
    expect(drops[2]).toMatchObject({ angle: expect.closeTo(-13.9119, 4) })
  })

  it('strews the jungle with fruit, monkey nuts and the odd spider, mostly bananas and nuts', () => {
    const drops = large('jungle')
    expect(kinds(drops)).toEqual(
      new Set([
        'banana',
        'red_banana',
        'monkey_nuts',
        'pineapple',
        'coconut',
        'half_coconut',
        'jungle_spider',
      ]),
    )
    const staples = drops.filter(
      (drop) => drop.kind === 'sprite' && ['banana', 'monkey_nuts'].includes(drop.sprite),
    )
    expect(staples.length / drops.length).toBeGreaterThan(0.55)
  })

  it('strews the desert with its own finds', () => {
    expect(kinds(large('pollnivneach'))).toEqual(
      new Set([
        'cactus',
        'kharidian_cactus',
        'camel',
        'waterskin',
        'kalphite_worker',
        'animal_skull',
        'rocks',
      ]),
    )
  })

  it('keeps the desert at about a third of the Party Room', () => {
    const ratio = large('pollnivneach').length / large('party_room').length
    expect(ratio).toBeGreaterThan(0.25)
    expect(ratio).toBeLessThan(0.42)
  })

  it('lays sprites on whole pixels, mirrored at random but never turned', () => {
    const sprites = large('jungle').flatMap((drop) => (drop.kind === 'sprite' ? [drop] : []))
    for (const drop of sprites) {
      expect(Number.isInteger(drop.x) && Number.isInteger(drop.y)).toBe(true)
      expect(drop).not.toHaveProperty('angle')
    }
    const mirrored = sprites.filter((drop) => drop.mirrored).length / sprites.length
    expect(mirrored).toBeGreaterThan(0.4)
    expect(mirrored).toBeLessThan(0.6)
  })
})

describe('SPRITES', () => {
  const files = import.meta.glob<string>('../assets/sprites/*.svg', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it.each(Object.keys(SPRITES) as (keyof typeof SPRITES)[])(
    'gives %s the size its file draws at',
    (name) => {
      const source = files[`../assets/sprites/${name.replaceAll('_', '-')}.svg`]
      const size = /width="(\d+)" height="(\d+)"/.exec(source ?? '')
      expect(size?.slice(1).map(Number)).toEqual([SPRITES[name].width, SPRITES[name].height])
    },
  )
})

describe('hasFloor', () => {
  it('knows the themes that strew their floor', () => {
    expect(THEMES.every(hasFloor)).toBe(true)
    expect(hasFloor('jolly')).toBe(false)
    expect(hasFloor('toString')).toBe(false)
    expect(hasFloor(undefined)).toBe(false)
  })
})

describe('shade', () => {
  it('moves a colour toward another by a share', () => {
    expect(shade('#e8513f', '#ffffff', 0)).toBe('#e8513f')
    expect(shade('#e8513f', '#000000', 1)).toBe('#000000')
    expect(shade('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
