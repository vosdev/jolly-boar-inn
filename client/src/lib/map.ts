/**
 * The world map's grid: where a tile lives, and game tiles to Leaflet's coordinates and back.
 *
 * `L.CRS.Simple` has 2^zoom pixels per unit, so with `lat = y` and `lng = x` a Leaflet unit is a
 * game tile. Tile rows are the one thing that differs: the files count north, as the game's y
 * does, and Leaflet counts south. `make gen-map` renders the tiles.
 */

import pin from '../../../data/map.json'

export interface WorldPoint {
  x: number
  y: number
}

/** A rectangle of game tiles. */
export interface MapBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** 4 px per game tile, the scale the game draws its map at. Above it the browser enlarges. */
export const NATIVE_ZOOM = 2
export const LOWEST_ZOOM = -3
export const HIGHEST_ZOOM = 5
export const TILE_SIZE = 256

/** The rendered surface, oceans included. */
export const SURFACE: MapBounds = { minX: 768, maxX: 4096, minY: 1792, maxY: 4352 }
/** Where the game happens: fitting the whole surface would frame mostly ocean. */
export const PLAY_AREA: MapBounds = { minX: 1000, maxX: 3950, minY: 2400, maxY: 4100 }

/** The URL of a tile; `row` counts north, as in the file names. */
export function tileUrl(zoom: number, x: number, row: number): string {
  return `/map/${pin.cache_id}/clean/${zoom}/0_${x}_${row}.png`
}

/** A tile row as the files number it, from Leaflet's. It is its own inverse. */
export function flipRow(row: number): number {
  return -row - 1
}

/** The tile holding a game tile, at a zoom. */
export function tileAt(point: WorldPoint, zoom: number): { x: number; row: number } {
  const units = TILE_SIZE / 2 ** zoom
  return { x: Math.floor(point.x / units), row: Math.floor(point.y / units) }
}

/** The middle of a game tile, so a marker on it does not drift when zoomed in. */
export function toLatLng(point: WorldPoint): [number, number] {
  return [point.y + 0.5, point.x + 0.5]
}

/** The game tile under a point on the map. */
export function toWorld(latLng: { lat: number; lng: number }): WorldPoint {
  return { x: Math.floor(latLng.lng), y: Math.floor(latLng.lat) }
}

/** The tile nearest `point` that lies inside `area`, whose top and right edges are outside it. */
export function clampTile(point: WorldPoint, area: MapBounds): WorldPoint {
  return {
    x: Math.min(Math.max(point.x, area.minX), area.maxX - 1),
    y: Math.min(Math.max(point.y, area.minY), area.maxY - 1),
  }
}

/** The rectangle round `points`, `margin` tiles wider on every side. */
export function around(points: readonly WorldPoint[], margin: number): MapBounds {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min(...xs) - margin,
    maxX: Math.max(...xs) + margin,
    minY: Math.min(...ys) - margin,
    maxY: Math.max(...ys) + margin,
  }
}

/** Whether `area` lies wholly inside `outer`. */
export function within(area: MapBounds, outer: MapBounds): boolean {
  return (
    area.minX >= outer.minX &&
    area.maxX <= outer.maxX &&
    area.minY >= outer.minY &&
    area.maxY <= outer.maxY
  )
}
