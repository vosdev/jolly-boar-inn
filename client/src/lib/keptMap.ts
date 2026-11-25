/**
 * One Leaflet map handed from a `keep` `MapView` to the next, so a question's map stays up
 * into its reveal and on into the next map question instead of being built again. A view
 * ending hands its map on; a view mounting in the same turn takes it over, and a map nobody
 * takes by the end of the turn is removed.
 */

import type { GridLayer, LayerGroup, Map as LeafletMap, Polygon, TileLayer } from 'leaflet'

/** A map and what it was built with. */
export interface Held {
  L: typeof import('leaflet')
  map: LeafletMap
  /** The element Leaflet draws in, which moves from one view to the next. */
  canvas: HTMLDivElement
  tiles: TileLayer
  /** The map icons, once a view has shown them: on the map only while one does. */
  icons: GridLayer | null
  outside: Polygon | null
  /** The `bounds` its limits were set for, as a key. */
  limits: string
  /** What the view holding it drew on it. */
  groups: LayerGroup[]
}

let handedOn: Held | null = null

/** Gives up `held` to whichever view mounts next in this turn. */
export function handOn(held: Held): void {
  handedOn?.map.remove()
  handedOn = held
  setTimeout(() => {
    if (handedOn !== held) return
    handedOn = null
    held.map.remove()
  }, 0)
}

/** Removes a map handed on and not yet taken over, now rather than at the end of the turn. */
export function dropHandedOn(): void {
  const held = handedOn
  handedOn = null
  held?.map.remove()
}

/** The map handed on in this turn, moved into `host` at once so it never leaves the page. */
export function takeOver(host: HTMLElement): Held | null {
  const held = handedOn
  handedOn = null
  if (held !== null) host.append(held.canvas)
  return held
}

/** A new element in `host` for Leaflet to draw a map in. */
export function canvasIn(host: HTMLElement): HTMLDivElement {
  const canvas = document.createElement('div')
  canvas.className = 'map-canvas'
  host.append(canvas)
  return canvas
}
