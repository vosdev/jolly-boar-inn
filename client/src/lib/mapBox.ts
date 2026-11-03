/**
 * A place's box being set on the map (`PlaceField`), and what its reach is worth. A box's edges
 * are inside it, as on a target; `questions/types/map_pin.py` holds a saved one to the same rules.
 */

import { clampTile, type MapBounds, SURFACE, type WorldPoint } from './map'

/** `LEAST_TARGET` on the server. */
export const LEAST_BOX = 10
/** Big enough to grab each corner once the map closes in on it. */
export const START_BOX = 30
/** `WORLD_REACH` on the server, which a payload then leaves out. */
export const DEFAULT_REACH = 100
/** `PLACE_REACH` on the server. */
export const PLACE_REACH = { min: 50, max: 200, step: 10 }

export type Corner = 'sw' | 'se' | 'nw' | 'ne'
export const CORNERS: readonly Corner[] = ['sw', 'se', 'nw', 'ne']

/** A box of `wide` by `tall` tiles round `middle`, slid back onto the surface if it hangs off. */
export function boxAt(middle: WorldPoint, wide: number, tall: number): MapBounds {
  const minX = Math.min(
    Math.max(middle.x - Math.floor(wide / 2), SURFACE.minX),
    SURFACE.maxX - 1 - wide,
  )
  const minY = Math.min(
    Math.max(middle.y - Math.floor(tall / 2), SURFACE.minY),
    SURFACE.maxY - 1 - tall,
  )
  return { minX, maxX: minX + wide, minY, maxY: minY + tall }
}

/** `box` moved so its middle is on `middle`. */
export function moveBox(box: MapBounds, middle: WorldPoint): MapBounds {
  return boxAt(middle, box.maxX - box.minX, box.maxY - box.minY)
}

export function middleOf(box: MapBounds): WorldPoint {
  return {
    x: box.minX + Math.floor((box.maxX - box.minX) / 2),
    y: box.minY + Math.floor((box.maxY - box.minY) / 2),
  }
}

export function cornerOf(box: MapBounds, corner: Corner): WorldPoint {
  return {
    x: corner.endsWith('w') ? box.minX : box.maxX,
    y: corner.startsWith('s') ? box.minY : box.maxY,
  }
}

/** `box` with `corner` pulled to `tile`, stopping short of a box too small to hold. */
export function pullCorner(box: MapBounds, corner: Corner, tile: WorldPoint): MapBounds {
  const { x, y } = clampTile(tile, SURFACE)
  return {
    minX: corner.endsWith('w') ? Math.min(x, box.maxX - LEAST_BOX) : box.minX,
    maxX: corner.endsWith('e') ? Math.max(x, box.minX + LEAST_BOX) : box.maxX,
    minY: corner.startsWith('s') ? Math.min(y, box.maxY - LEAST_BOX) : box.minY,
    maxY: corner.startsWith('n') ? Math.max(y, box.minY + LEAST_BOX) : box.maxY,
  }
}

/** Points on each quarter of a rounded corner: enough to look round at any zoom. */
const ARC_STEPS = 8

/** The line `reach` tiles from `box` all round, where a pin stops earning points. */
export function reachLine(box: MapBounds, reach: number): WorldPoint[] {
  const corners = [
    { x: box.maxX, y: box.maxY, from: 0 },
    { x: box.minX, y: box.maxY, from: 90 },
    { x: box.minX, y: box.minY, from: 180 },
    { x: box.maxX, y: box.minY, from: 270 },
  ]
  return corners.flatMap(({ x, y, from }) =>
    Array.from({ length: ARC_STEPS + 1 }, (_, step) => {
      const angle = ((from + (90 * step) / ARC_STEPS) * Math.PI) / 180
      return { x: x + reach * Math.cos(angle), y: y + reach * Math.sin(angle) }
    }),
  )
}

/** What a pin earns at each quarter of `reach` outside the box, as the server grades it. */
export function reachPoints(reach: number): { tiles: number; points: number }[] {
  return [0, 0.25, 0.5, 0.75, 1].map((share) => {
    const tiles = Math.round(reach * share)
    return { tiles, points: Math.round(1000 * (1 - tiles / reach)) }
  })
}
