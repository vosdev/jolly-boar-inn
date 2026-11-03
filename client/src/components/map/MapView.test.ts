/**
 * The map on real Leaflet: the tiles it asks for are the only thing it does that jsdom can show,
 * so these read the `<img>`s it adds. The frame needs a size, which jsdom never lays out.
 */

import { render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import pin from '../../../../data/map.json'
import type { MapBounds } from '../../lib/map'
import MapView from './MapView.svelte'

const REGION: MapBounds = { minX: 2800, maxX: 2900, minY: 3100, maxY: 3200 }
const TILE = new RegExp(`/map/${pin.cache_id}/clean/(-?\\d+)/0_(\\d+)_(\\d+)\\.png$`)

/** Each tile the map holds, as the game tiles it covers. */
function tiles(
  container: HTMLElement,
): { minX: number; maxX: number; minY: number; maxY: number }[] {
  return [...container.querySelectorAll('img')].map((image) => {
    const match = TILE.exec(image.src)
    if (match === null) throw new Error(`not a tile: ${image.src}`)
    const units = 256 / 2 ** Number(match[1])
    const [x, row] = [Number(match[2]), Number(match[3])]
    return {
      minX: x * units,
      maxX: (x + 1) * units,
      minY: row * units,
      maxY: (row + 1) * units,
    }
  })
}

describe('MapView', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requests only tiles that touch its bounds', async () => {
    const { container } = render(MapView, { bounds: REGION })
    await waitFor(() => expect(tiles(container).length).toBeGreaterThan(0))
    for (const tile of tiles(container)) {
      expect(tile.maxX).toBeGreaterThan(REGION.minX)
      expect(tile.minX).toBeLessThan(REGION.maxX)
      expect(tile.maxY).toBeGreaterThan(REGION.minY)
      expect(tile.minY).toBeLessThan(REGION.maxY)
    }
  })

  it('opens on tiles of the surface without bounds', async () => {
    const { container } = render(MapView)
    await waitFor(() => expect(tiles(container).length).toBeGreaterThan(0))
    const north = Math.max(...tiles(container).map((tile) => tile.maxY))
    expect(north).toBeGreaterThan(3000)
    expect(north).toBeLessThanOrEqual(4352)
  })

  it('opens close on an opening and keeps the rest of the surface', async () => {
    const zoomOf = async (props: Record<string, unknown>) => {
      const { container, unmount } = render(MapView, props)
      const map = container.querySelector<HTMLElement>('.map')!
      await waitFor(() => expect(map.dataset.zoom).toBeDefined())
      const found = {
        zoom: Number(map.dataset.zoom),
        masked: !!container.querySelector('.map-outside'),
      }
      unmount()
      return found
    }
    const wide = await zoomOf({})
    const close = await zoomOf({ opening: REGION })
    expect(close.zoom).toBeGreaterThan(wide.zoom)
    expect(close.masked).toBe(false)
  })

  it('never asks for a zoom it has no tiles for', async () => {
    const { container } = render(MapView, { bounds: { ...REGION, maxX: 2810, maxY: 3110 } })
    await waitFor(() => expect(tiles(container).length).toBeGreaterThan(0))
    for (const image of container.querySelectorAll('img')) {
      expect(Number(TILE.exec(image.src)?.[1])).toBeLessThanOrEqual(2)
    }
  })

  it('leaves nothing behind when it goes', async () => {
    const { container, unmount } = render(MapView)
    await waitFor(() => expect(tiles(container).length).toBeGreaterThan(0))
    unmount()
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps a grip’s marker when the box moves, so a drag survives', async () => {
    const at = { x: 2850, y: 3150 }
    const grips = [{ id: 'sw', at, title: 'Drag to resize' }]
    const { container, rerender } = render(MapView, { bounds: REGION, grips })
    await waitFor(() => expect(container.querySelector('.grip')).not.toBeNull())
    const grip = container.querySelector('.grip')
    await rerender({ bounds: REGION, grips: [{ ...grips[0]!, at: { x: 2860, y: 3160 } }] })
    expect(container.querySelector('.grip')).toBe(grip)
    await rerender({ bounds: REGION, grips: [] })
    expect(container.querySelector('.grip')).toBeNull()
  })

  it('draws the line a reach ends at round a box', async () => {
    const box = { minX: 2840, maxX: 2860, minY: 3140, maxY: 3160 }
    const { container } = render(MapView, {
      bounds: REGION,
      areas: [{ box, name: 'Here', reach: 30 }],
    })
    await waitFor(() => expect(container.querySelector('.map-reach')).not.toBeNull())
  })
})
