/**
 * What lies on a theme's floor: one chance per tile, scattered fresh each visit.
 *
 * Each tile draws from its own generator, seeded by the visit's seed and its place on the
 * floor, so a page that grows only adds drops below the old ones. Re-rolling the whole
 * floor would make every drop jump whenever a panel opened.
 */

import animalSkull from '../assets/sprites/animal-skull.svg'
import banana from '../assets/sprites/banana.svg'
import cactus from '../assets/sprites/cactus.svg'
import camel from '../assets/sprites/camel.svg'
import coconut from '../assets/sprites/coconut.svg'
import halfCoconut from '../assets/sprites/half-coconut.svg'
import jungleSpider from '../assets/sprites/jungle-spider.svg'
import kalphiteWorker from '../assets/sprites/kalphite-worker.svg'
import kharidianCactus from '../assets/sprites/kharidian-cactus.svg'
import monkeyNuts from '../assets/sprites/monkey-nuts.svg'
import pineapple from '../assets/sprites/pineapple.svg'
import redBanana from '../assets/sprites/red-banana.svg'
import rocks from '../assets/sprites/rocks.svg'
import waterskin from '../assets/sprites/waterskin.svg'
import { mulberry32 } from './seeded'

/** The side of one flagstone, matching the squares in `party-floor.svg`. */
export const TILE = 64

/** Of what lies on the Party Room's floor, about one in six is Party Pete's red partyhat. */
export const HAT_CHANCE = 1 / 6

/** The balloon colours of the drop party, sampled from the game. */
export const BALLOON_COLOURS = [
  '#e8513f',
  '#3ddd3a',
  '#86c45a',
  '#3aa6dd',
  '#353cd6',
  '#e2df3a',
  '#d464ea',
  '#efeee8',
] as const

/** The partyhat and the balloons' ties: fixed art, the same under any palette. */
export const ART = {
  hatBack: '#7f1b0e',
  hatFront: '#a52714',
  hatLight: '#c23a20',
  hatFold: '#b8301a',
  hatShadow: '#8a1e10',
  hatOutline: '#4a0d07',
  tie: '#8a6a38',
} as const

/** The game's sprites lying on the other floors, at their size in pixels (`assets/sprites/`). */
export const SPRITES = {
  banana: { url: banana, width: 25, height: 23 },
  red_banana: { url: redBanana, width: 25, height: 23 },
  monkey_nuts: { url: monkeyNuts, width: 29, height: 17 },
  pineapple: { url: pineapple, width: 24, height: 26 },
  coconut: { url: coconut, width: 20, height: 22 },
  half_coconut: { url: halfCoconut, width: 21, height: 19 },
  jungle_spider: { url: jungleSpider, width: 35, height: 23 },
  cactus: { url: cactus, width: 14, height: 39 },
  kharidian_cactus: { url: kharidianCactus, width: 27, height: 34 },
  camel: { url: camel, width: 39, height: 42 },
  waterskin: { url: waterskin, width: 19, height: 24 },
  kalphite_worker: { url: kalphiteWorker, width: 36, height: 31 },
  animal_skull: { url: animalSkull, width: 26, height: 22 },
  rocks: { url: rocks, width: 32, height: 23 },
} as const

export type Sprite = keyof typeof SPRITES

export type Drop =
  | { kind: 'balloon'; x: number; y: number; angle: number; colour: string }
  | { kind: 'hat'; x: number; y: number; angle: number }
  | { kind: 'sprite'; x: number; y: number; sprite: Sprite; mirrored: boolean }

/** One theme's floor: how big a tile is, how often one holds something, and what. */
export interface Floor {
  tile: number
  /** The share of tiles with something on them. */
  chance: number
  /** What lies at `x`, `y`, from that tile's generator. */
  drop: (x: number, y: number, roll: () => number) => Drop
}

function party(x: number, y: number, roll: () => number): Drop {
  if (roll() < HAT_CHANCE) return { kind: 'hat', x, y, angle: roll() * 50 - 25 }
  const colour = BALLOON_COLOURS[Math.floor(roll() * BALLOON_COLOURS.length)] ?? '#e8513f'
  return { kind: 'balloon', x, y, angle: roll() * 360, colour }
}

/**
 * Sprites picked by weight, mirrored at random but never turned: pixel art turned off the
 * grid blurs. Whole pixels keep them sharp.
 */
function strew(weights: [[Sprite, number], ...[Sprite, number][]]): Floor['drop'] {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
  return (x, y, roll) => {
    let pick = roll() * total
    const found = weights.find(([, weight]) => (pick -= weight) < 0)
    const sprite = found?.[0] ?? weights[0][0]
    return { kind: 'sprite', x: Math.round(x), y: Math.round(y), sprite, mirrored: roll() < 0.5 }
  }
}

/** The themes that strew their floor, and what lies on each. */
export const FLOORS = {
  // Roughly one balloon to every two or three flagstones, as on the floor in game.
  party_room: { tile: TILE, chance: 0.4, drop: party },
  jungle: {
    tile: TILE,
    chance: 0.4,
    drop: strew([
      ['banana', 4],
      ['monkey_nuts', 4],
      ['red_banana', 1],
      ['pineapple', 1],
      ['coconut', 1],
      ['half_coconut', 1],
      ['jungle_spider', 1],
    ]),
  },
  // A third of the Party Room's: the desert is mostly sand.
  pollnivneach: {
    tile: TILE,
    chance: 0.13,
    drop: strew([
      ['cactus', 2],
      ['kharidian_cactus', 2],
      ['camel', 2],
      ['waterskin', 3],
      ['kalphite_worker', 2],
      ['animal_skull', 1],
      ['rocks', 1],
    ]),
  },
} as const satisfies Record<string, Floor>

export type FloorTheme = keyof typeof FLOORS

/** True for a theme that strews its floor. */
export function hasFloor(theme: string | undefined): theme is FloorTheme {
  return theme !== undefined && Object.hasOwn(FLOORS, theme)
}

/** `colour` in shadow, for the facets turned from the light. */
export function darker(colour: string, share: number): string {
  return shade(colour, '#000000', share)
}

/** `colour` in the light. */
export function lighter(colour: string, share: number): string {
  return shade(colour, '#ffffff', share)
}

function tileSeed(seed: number, column: number, row: number): number {
  return (seed ^ Math.imul(column + 1, 0x9e3779b1) ^ Math.imul(row + 1, 0x85ebca77)) >>> 0
}

/** Everything lying on `floor` across `width` by `height` pixels, for this visit's `seed`. */
export function scatter(floor: Floor, width: number, height: number, seed: number): Drop[] {
  const drops: Drop[] = []
  const columns = Math.ceil(width / floor.tile)
  const rows = Math.ceil(height / floor.tile)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const roll = mulberry32(tileSeed(seed, column, row))
      if (roll() >= floor.chance) continue
      // Kept off the edges so a drop rarely straddles two tiles' worth of floor.
      const x = (column + 0.2 + roll() * 0.6) * floor.tile
      const y = (row + 0.2 + roll() * 0.6) * floor.tile
      drops.push(floor.drop(x, y, roll))
    }
  }
  return drops
}

/** `hex` moved `share` of the way to `toward`, both `#rrggbb`. */
export function shade(hex: string, toward: string, share: number): string {
  const channel = (value: string, at: number): number => parseInt(value.slice(at, at + 2), 16)
  return (
    '#' +
    [1, 3, 5]
      .map((at) => Math.round(channel(hex, at) + (channel(toward, at) - channel(hex, at)) * share))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  )
}
