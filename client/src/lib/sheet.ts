/**
 * What the stage's sheet is in each theme (section 8 of ideas/design.md).
 *
 * The inn and the desert keep the quest reward scroll; the Wilderness nails up a bounty
 * poster, the Party Room hangs a card under bunting, and the TzHaar carve an obsidian slab,
 * since paper would burn. The jungle stretches bark cloth in a bamboo frame, the Gauntlet
 * keeps its board, Morytania a gravestone and Zanaris a crystal-studded stone.
 */

/**
 * The colours of the sheets' fixed pieces, which no theme changes: the bunting, the
 * poster's nails and the bamboo's lashings. They go in SVG attributes,
 * since a component's CSS may only name tokens.
 */
export const ART = {
  string: '#23263a',
  flagRed: '#d8262a',
  flagYellow: '#f2c230',
  flagGreen: '#2f9a4a',
  nail: '#1a1716',
  nailLight: '#8f8a86',
  bambooLight: '#e3d28a',
  bamboo: '#c9b46a',
  bambooDark: '#8a7a3a',
  bambooEdge: '#4a3f16',
  lashing: '#4f6b2a',
  lashingLight: '#6f8f3a',
  moss: '#6f9248',
  mossDark: '#3f5a2a',
  signShard: '#a6e2f0',
  signShardDark: '#7ccce0',
}

export type Sheet =
  'scroll' | 'poster' | 'bunting' | 'slab' | 'bamboo' | 'gauntlet' | 'gravestone' | 'sign'

/** The sheet `theme` draws. */
export function sheetFor(theme: string): Sheet {
  switch (theme) {
    case 'wilderness':
      return 'poster'
    case 'party_room':
      return 'bunting'
    case 'tzhaar':
      return 'slab'
    case 'jungle':
      return 'bamboo'
    case 'gauntlet':
    case 'corrupted_gauntlet':
      return 'gauntlet'
    case 'morytania':
      return 'gravestone'
    case 'zanaris':
      return 'sign'
    default:
      return 'scroll'
  }
}

/** The width of one swag of the Party Room's bunting, from knot to knot, at scale 1. */
export const SWAG_WIDTH = 180

/** The bunting's height at scale 1: the string's dip and an 18px flag under it. */
export const BUNTING_HEIGHT = 30

const FLAG = 18
const FLAG_STOPS = [0.2, 0.4, 0.6, 0.8]
const STRING_TOP = 3
const DIP = 7
const INSET = 4

/**
 * How many swags the bunting hangs in across `width`, two at the least.
 *
 * The count grows with the sheet rather than the flags, so a wide stage keeps them small.
 */
export function buntingSwags(width: number): number {
  return Math.max(2, Math.round(width / SWAG_WIDTH))
}

export interface Bunting {
  /** The viewBox's width; its height is `BUNTING_HEIGHT`. */
  width: number
  swags: string[]
  /** Each flag's path, rotated to the string, and its place in the colour cycle. */
  flags: { d: string; transform: string; colour: number }[]
  knots: number[]
}

/** The bunting for a sheet `width` wide at scale 1, its every piece in viewBox units. */
export function buntingLayout(width: number): Bunting {
  const n = buntingSwags(width)
  const w = width || n * SWAG_WIDTH
  const span = (w - 2 * INSET) / n
  const knots = Array.from({ length: n + 1 }, (_, i) => INSET + i * span)
  const swags = knots
    .slice(0, -1)
    .map(
      (x) =>
        `M${x} ${STRING_TOP}Q${x + span / 2} ${STRING_TOP + 2 * DIP} ${x + span} ${STRING_TOP}`,
    )
  const flags = knots.slice(0, -1).flatMap((x0, s) =>
    FLAG_STOPS.map((t, f) => {
      const x = x0 + t * span
      const y = STRING_TOP + 4 * DIP * t * (1 - t) - 1
      const tilt = (Math.atan((4 * DIP * (1 - 2 * t)) / span) * 180) / Math.PI
      return {
        d: `M${x - FLAG / 2} ${y}h${FLAG}l${-FLAG / 2} ${FLAG}z`,
        transform: `rotate(${tilt} ${x} ${y})`,
        colour: s + f,
      }
    }),
  )
  return { width: w, swags, flags, knots }
}

/** Whether the sheet hangs between the scroll's two rolls, which the stage makes room for. */
export function hasRolls(sheet: Sheet): boolean {
  return sheet === 'scroll'
}
