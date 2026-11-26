/**
 * What the see-through layers over the map's tiles (icons, place names) need from Leaflet
 * beyond what a tile layer does.
 */

import type { GridLayer, GridLayerOptions } from 'leaflet'

/**
 * Shows only the current zoom's tiles of `grid` once they are in. Leaflet fades new tiles in
 * and prunes the last zoom's once, on a timer the fade can outlast, so the last zoom's tiles may
 * stay under the new ones: an opaque map hides them, a see-through layer shows them twice over,
 * at two sizes. Leaflet lifts the current level to the layer's `maxZoom`.
 */
export function onlyCurrentLevel<Grid extends GridLayer>(grid: Grid): Grid {
  grid.on('load', () => {
    const current = String((grid.options as GridLayerOptions).maxZoom)
    for (const level of grid.getContainer()?.children ?? []) {
      if (!(level instanceof HTMLElement)) continue
      level.style.visibility = level.style.zIndex === current ? '' : 'hidden'
    }
  })
  return grid
}
