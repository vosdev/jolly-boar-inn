/**
 * The colours of the wall lights: fixed art, the same whatever the panels around them are
 * painted.
 */

/** The inn's lantern, after the game's lit white candle lantern: iron, glass, candle and
 * flame, each face shaded as the game's model shades it. */
export const LANTERN = {
  glassEdge: '#f6d87a',
  glassLit: '#fde9a0',
  glassFar: '#f3d475',
  shadow: '#120c04',
  glassSide: '#f0cf6e',
  floor: '#8f7428',
  floorEdge: '#7a6024',
  post: '#c9a84a',
  candle: '#e9c95e',
  candleLit: '#f7e29a',
  candleFoot: '#b8952e',
  flare: '#e9c24a',
  flame: '#d9a400',
  frame: '#45403d',
  ironDark: '#2f2b29',
  iron: '#3e3936',
  roof: '#47413e',
  roofShade: '#3b3634',
  handle: '#57514d',
  shelfEdge: '#2a2624',
  shelfTop: '#5a534e',
  bracketLit: '#4a4441',
} as const

/** The Gauntlet's door logo per Gauntlet: its glow, the glow's paler core, and the dark it is
 * cut into. */
export const DOOR_LOGO = {
  gauntlet: { glow: '#1ac8d8', core: '#78f8f8', cut: '#0c1414' },
  corrupted_gauntlet: { glow: '#e2483e', core: '#ff9a80', cut: '#0c1414' },
} as const
