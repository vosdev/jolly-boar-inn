import L from 'leaflet'
import { describe, expect, it } from 'vitest'

import { onlyCurrentLevel } from './mapOverlay'

/** A layer whose container holds a level per zoom, as Leaflet leaves them mid-prune. */
function layerWithLevels(zIndexes: string[]): { grid: L.GridLayer; levels: HTMLElement[] } {
  const container = document.createElement('div')
  const levels = zIndexes.map((zIndex) => {
    const level = document.createElement('div')
    level.style.zIndex = zIndex
    container.append(level)
    return level
  })
  const grid = new L.GridLayer({ maxZoom: 5 })
  grid.getContainer = () => container
  return { grid, levels }
}

describe('onlyCurrentLevel', () => {
  it('hides the last zoom’s tiles once the current zoom’s are in', () => {
    const { grid, levels } = layerWithLevels(['4', '5'])
    onlyCurrentLevel(grid).fire('load')
    expect(levels.map((level) => level.style.visibility)).toEqual(['hidden', ''])
  })

  it('shows a level again when the player zooms back to it', () => {
    const { grid, levels } = layerWithLevels(['4', '5'])
    onlyCurrentLevel(grid).fire('load')
    levels[0]!.style.zIndex = '5'
    levels[1]!.style.zIndex = '4'
    grid.fire('load')
    expect(levels.map((level) => level.style.visibility)).toEqual(['', 'hidden'])
  })
})
