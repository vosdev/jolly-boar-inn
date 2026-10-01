/**
 * Where the Party Room's balloons lie: one chance per flagstone, scattered fresh each visit.
 *
 * Each flagstone draws from its own generator, seeded by the visit's seed and its place on
 * the floor, so a page that grows only adds balloons below the old ones. Re-rolling the
 * whole floor would make every balloon jump whenever a panel opened.
 */

/** The side of one flagstone, matching the squares in `party-floor.svg`. */
export const TILE = 64

/** Roughly one balloon to every two or three flagstones, as on the floor in game. */
export const DROP_CHANCE = 0.4

/** Of what lies on the floor, about one in six is Party Pete's red partyhat. */
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

/** `colour` in shadow, for the facets turned from the light. */
export function darker(colour: string, share: number): string {
  return shade(colour, '#000000', share)
}

/** `colour` in the light. */
export function lighter(colour: string, share: number): string {
  return shade(colour, '#ffffff', share)
}

export type Drop =
  | { kind: 'balloon'; x: number; y: number; angle: number; colour: string }
  | { kind: 'hat'; x: number; y: number; angle: number }

/** A small, fast generator; the floor needs scatter, not secrecy. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function tileSeed(seed: number, column: number, row: number): number {
  return (seed ^ Math.imul(column + 1, 0x9e3779b1) ^ Math.imul(row + 1, 0x85ebca77)) >>> 0
}

/** Everything lying on a floor of `width` by `height` pixels, for this visit's `seed`. */
export function scatter(width: number, height: number, seed: number): Drop[] {
  const drops: Drop[] = []
  const columns = Math.ceil(width / TILE)
  const rows = Math.ceil(height / TILE)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const roll = mulberry32(tileSeed(seed, column, row))
      if (roll() >= DROP_CHANCE) continue
      // Kept off the edges so a balloon rarely straddles two flagstones' worth of floor.
      const x = (column + 0.2 + roll() * 0.6) * TILE
      const y = (row + 0.2 + roll() * 0.6) * TILE
      if (roll() < HAT_CHANCE) {
        drops.push({ kind: 'hat', x, y, angle: roll() * 50 - 25 })
      } else {
        const colour = BALLOON_COLOURS[Math.floor(roll() * BALLOON_COLOURS.length)] ?? '#e8513f'
        drops.push({ kind: 'balloon', x, y, angle: roll() * 360, colour })
      }
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
