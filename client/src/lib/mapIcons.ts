/**
 * The game's map icons, drawn over the clean tiles as the wiki draws them: at the sprite's own
 * size from zoom 0 up, and none below, where they would hide the map. `make gen-map` writes
 * where each one stands and a sheet of their sprites beside the tiles.
 */

import pin from '../../../data/map.json'
import { TILE_SIZE } from './map'

/** The lowest zoom the icons show at: a game tile a pixel across. */
export const ICONS_FROM_ZOOM = 0

/** `icons.json`: each sprite's cell on the sheet, and each icon's game tile and sprite. */
export interface IconIndex {
  sprites: [left: number, top: number, width: number, height: number][]
  icons: [x: number, y: number, sprite: number][]
}

export interface IconLayer extends IconIndex {
  sheet: CanvasImageSource
}

/** One sprite to copy from the sheet onto a tile, at its top-left corner in the tile. */
export interface Placed {
  sprite: number
  left: number
  top: number
}

const ROOT = `/map/${pin.cache_id}/icons`

/**
 * The icons on the Leaflet tile at `zoom`, column `x` and Leaflet's `row`, which counts south.
 * An icon is centred on its game tile and kept whole on a pixel, so one that straddles a tile's
 * edge is drawn on both.
 */
export function iconsOnTile(index: IconIndex, zoom: number, x: number, row: number): Placed[] {
  if (zoom < ICONS_FROM_ZOOM) return []
  const scale = 2 ** zoom
  const placed: Placed[] = []
  for (const [tileX, tileY, sprite] of index.icons) {
    const cell = index.sprites[sprite]
    if (cell === undefined) continue
    const [, , width, height] = cell
    const left = Math.round((tileX + 0.5) * scale - width / 2) - x * TILE_SIZE
    const top = Math.round(-(tileY + 0.5) * scale - height / 2) - row * TILE_SIZE
    if (left < TILE_SIZE && top < TILE_SIZE && left + width > 0 && top + height > 0) {
      placed.push({ sprite, left, top })
    }
  }
  return placed
}

let loading: Promise<IconLayer | null> | null = null

/**
 * The icon layer, fetched once however many maps show it. Null on an install whose map
 * predates the icons, which then shows none.
 */
export function loadIcons(): Promise<IconLayer | null> {
  loading ??= Promise.all([
    fetch(`${ROOT}/icons.json`).then((response) =>
      response.ok ? (response.json() as Promise<IconIndex>) : null,
    ),
    new Promise<HTMLImageElement>((done, failed) => {
      const sheet = new Image()
      sheet.onload = () => done(sheet)
      sheet.onerror = failed
      sheet.src = `${ROOT}/sheet.png`
    }),
  ])
    .then(([index, sheet]) => (index === null ? null : { ...index, sheet }))
    // A dev server answers a missing file with a page, which is no JSON.
    .catch(() => null)
  return loading
}
