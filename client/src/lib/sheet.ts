/**
 * What the stage's sheet is in each theme (section 8 of ideas/design.md).
 *
 * The inn and the desert keep the quest reward scroll; the Wilderness nails up a bounty
 * poster, the Party Room hangs a card under bunting, and the TzHaar carve an obsidian slab,
 * since paper would burn. The jungle stretches bark cloth in a bamboo frame, the Gauntlet
 * keeps its board, Morytania a gravestone and Zanaris the Cosmic altar's sign.
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
  earth: '#1f3324',
  signEdge: '#3f8394',
  signLight: '#7cbfd0',
  sign: '#6bacbd',
  signDark: '#5f9aaa',
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

/** The width in pixels of one swag of the Party Room's bunting, from knot to knot. */
export const SWAG_WIDTH = 180

/**
 * How many swags the bunting hangs in across `width` pixels, two at the least.
 *
 * The count grows with the sheet rather than the flags, so a wide stage keeps them small.
 */
export function buntingSwags(width: number): number {
  return Math.max(2, Math.round(width / SWAG_WIDTH))
}

/** Whether the sheet hangs between the scroll's two rolls, which the stage makes room for. */
export function hasRolls(sheet: Sheet): boolean {
  return sheet === 'scroll'
}
