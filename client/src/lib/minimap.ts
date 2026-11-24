/**
 * A minimap round a spot, as `scripts/minimap.py` bakes it: the circle `MINIMAP_RADIUS` game tiles
 * round the middle of the spot's tile, at 4 px a tile, turned clockwise by its angle. `/suggest`
 * draws the same circle from the same zoom 2 tiles, so its preview is the picture players get.
 * The square under the circle is wide enough to turn without a corner showing.
 */

import { NATIVE_ZOOM, SURFACE, TILE_SIZE, tileUrl, type WorldPoint } from './map'

export const MINIMAP_RADIUS = 19
export const PIXELS_PER_TILE = 4
/** The picture across, in pixels. */
export const MINIMAP_SIDE = 2 * MINIMAP_RADIUS * PIXELS_PER_TILE
/** The square drawn before it turns, in pixels; even, as the circle's middle is between pixels. */
export const TURNABLE = 2 * Math.ceil(MINIMAP_SIDE / Math.SQRT2)
export interface MinimapSpot extends WorldPoint {
  /** Degrees clockwise, 0 to 359. */
  angle: number
}

/** A zoom 2 tile and where its top left lands on the square, in pixels. */
export interface PlacedTile {
  url: string
  left: number
  top: number
}

/** The tiles under the square round `spot`, each where it is drawn. */
export function minimapTiles(spot: WorldPoint): PlacedTile[] {
  const half = TURNABLE / 2
  // Pixels east of x 0 and south of y 0: a tile's row counts north.
  const left = spot.x * PIXELS_PER_TILE + PIXELS_PER_TILE / 2 - half
  const top = -(spot.y * PIXELS_PER_TILE + PIXELS_PER_TILE / 2) - half
  const placed: PlacedTile[] = []
  const firstColumn = Math.floor(left / TILE_SIZE)
  const lastColumn = Math.floor((left + TURNABLE - 1) / TILE_SIZE)
  const firstRow = Math.floor((-top - TURNABLE) / TILE_SIZE)
  const lastRow = Math.floor((-top - 1) / TILE_SIZE)
  for (let column = firstColumn; column <= lastColumn; column++) {
    for (let row = firstRow; row <= lastRow; row++) {
      placed.push({
        url: tileUrl(NATIVE_ZOOM, column, row),
        left: column * TILE_SIZE - left,
        top: -TILE_SIZE * (row + 1) - top,
      })
    }
  }
  return placed
}

/** A whole angle from 0 to 359, the way any turn of the dial wraps. */
export function wrapAngle(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360
}

/** Whether a minimap round `spot` is on the rendered surface, as the schema holds it. */
export function onSurface(spot: WorldPoint): boolean {
  return (
    spot.x >= SURFACE.minX &&
    spot.x < SURFACE.maxX &&
    spot.y >= SURFACE.minY &&
    spot.y < SURFACE.maxY
  )
}

/** The round target the minimap covers, named, as `map_pin.py` sets it. */
export function minimapTarget(spot: WorldPoint, name: string) {
  return {
    name,
    min_x: spot.x - MINIMAP_RADIUS,
    max_x: spot.x + MINIMAP_RADIUS,
    min_y: spot.y - MINIMAP_RADIUS,
    max_y: spot.y + MINIMAP_RADIUS,
    round: true,
  }
}
