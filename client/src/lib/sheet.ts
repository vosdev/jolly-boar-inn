/**
 * What the stage's sheet is in each theme (section 8 of ideas/design.md).
 *
 * The inn and the desert keep the quest reward scroll; the Wilderness nails up a bounty
 * poster, the Party Room hangs a card under bunting, and the TzHaar carve an obsidian slab,
 * since paper would burn. The jungle stretches bark cloth in a bamboo frame, the Gauntlet
 * keeps its board, Morytania a gravestone and Zanaris the Cosmic altar's sign. Home's sheet in the inn is a
 * notice board instead, so the inn's front door looks different from its games.
 */

/**
 * The colours of the sheets' fixed pieces, which no theme changes: the bunting, the board's
 * planks and frame, the poster's nails and the board's tacks. They go in SVG attributes,
 * since a component's CSS may only name tokens.
 */
export const ART = {
  string: '#23263a',
  flagRed: '#d8262a',
  flagYellow: '#f2c230',
  flagGreen: '#2f9a4a',
  frame: '#5a3d1f',
  frameEdge: '#24180b',
  plank: '#8a6236',
  plankGap: '#5f4222',
  nail: '#1a1716',
  nailLight: '#8f8a86',
  tack: '#8a1a14',
  tackLight: '#e66a5c',
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

/** Where the board's planks meet, every 38px down, enough for any note on Home. */
export const PLANK_SEAMS = Array.from({ length: 16 }, (_, plank) => (plank + 1) * 38 - 2)

export type Sheet =
  'scroll' | 'board' | 'poster' | 'bunting' | 'slab' | 'bamboo' | 'gauntlet' | 'gravestone' | 'sign'

/** The sheet `theme` draws; `board` asks for Home's notice board, which only the inn has. */
export function sheetFor(theme: string, board = false): Sheet {
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
    case 'pollnivneach':
      return 'scroll'
    default:
      return board ? 'board' : 'scroll'
  }
}

/** Whether the sheet hangs between the scroll's two rolls, which the stage makes room for. */
export function hasRolls(sheet: Sheet): boolean {
  return sheet === 'scroll'
}
