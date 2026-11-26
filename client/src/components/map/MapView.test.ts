/**
 * The map on real Leaflet: the tiles it asks for are the only thing it does that jsdom can show,
 * so these read the `<img>`s it adds. The frame needs a size, which jsdom never lays out.
 */

import { render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import L from 'leaflet'

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

  it('hides a place’s name that would cover an earlier one', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const left = this.textContent === 'Far' ? 500 : 100
      return new DOMRect(left, 100, 80, 20)
    })
    const box = { minX: 2840, maxX: 2860, minY: 3140, maxY: 3160 }
    const { container } = render(MapView, {
      bounds: REGION,
      areas: ['Near', 'Nearby', 'Far'].map((name) => ({ box, name })),
    })
    await waitFor(() => expect(container.querySelectorAll('.map-name')).toHaveLength(3))
    const hidden = [...container.querySelectorAll<HTMLElement>('.map-name')].map(
      (tag) => tag.hidden,
    )
    expect(hidden).toEqual([false, true, false])
  })

  describe('built on a stage that then grows', () => {
    let height = 600
    const grown: (() => void)[] = []

    beforeEach(() => {
      height = 600
      grown.length = 0
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height)
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            grown.push(callback)
          }
          observe(): void {}
          unobserve(): void {}
          disconnect(): void {}
        },
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    async function zoomOf(container: HTMLElement): Promise<number> {
      const map = container.querySelector<HTMLElement>('.map')!
      await waitFor(() => expect(map.dataset.zoom).toBeDefined())
      return Number(map.dataset.zoom)
    }

    it('opens on its opening at the size it ends up', async () => {
      const full = render(MapView, { opening: REGION })
      const wanted = await zoomOf(full.container)
      full.unmount()
      grown.length = 0
      height = 40
      const { container } = render(MapView, { opening: REGION })
      expect(await zoomOf(container)).toBeLessThan(wanted)
      height = 600
      grown.forEach((callback) => callback())
      await waitFor(async () => expect(await zoomOf(container)).toBe(wanted))
    })

    it('waits for a height before it opens on its opening', async () => {
      const full = render(MapView, { opening: REGION })
      const wanted = await zoomOf(full.container)
      full.unmount()
      grown.length = 0
      height = 0
      const { container } = render(MapView, { opening: REGION })
      await new Promise((done) => setTimeout(done, 50))
      expect(container.querySelector('.leaflet-container')).toBeNull()
      height = 600
      grown.forEach((callback) => callback())
      expect(await zoomOf(container)).toBe(wanted)
    })

    it('keeps a view the player has moved', async () => {
      height = 40
      const { container } = render(MapView, { opening: REGION })
      const small = await zoomOf(container)
      container.querySelector<HTMLElement>('.leaflet-control-zoom-out')!.click()
      await waitFor(async () => expect(await zoomOf(container)).toBe(small - 1))
      height = 600
      grown.forEach((callback) => callback())
      expect(await zoomOf(container)).toBe(small - 1)
    })
  })

  describe('kept from one view to the next', () => {
    const PLACE = { minX: 3200, maxX: 3240, minY: 3200, maxY: 3240 }

    async function shown(props: Record<string, unknown>) {
      const view = render(MapView, { keep: true, ...props })
      await waitFor(() =>
        expect(view.container.querySelector<HTMLElement>('.map')?.dataset.zoom).toBeDefined(),
      )
      return view
    }

    it('is taken over whole by a view mounting in the same turn, tiles and all', async () => {
      const first = await shown({})
      await waitFor(() => expect(tiles(first.container).length).toBeGreaterThan(0))
      const canvas = first.container.querySelector('.map-canvas')
      const tile = first.container.querySelector('img')
      first.unmount()
      const next = render(MapView, { keep: true, fresh: true })
      expect(next.container.querySelector('.map-canvas')).toBe(canvas)
      await new Promise((done) => setTimeout(done, 0))
      expect(tile!.isConnected).toBe(true)
    })

    it('is removed when nothing takes it over', async () => {
      const first = await shown({})
      await waitFor(() => expect(tiles(first.container).length).toBeGreaterThan(0))
      const canvas = first.container.querySelector('.map-canvas')!
      first.unmount()
      await new Promise((done) => setTimeout(done, 0))
      expect(canvas.querySelector('img')).toBeNull()
    })

    it('fades what stood on it for a fresh view, and keeps it gone', async () => {
      const first = await shown({ areas: [{ box: PLACE, name: 'Lumbridge' }] })
      await waitFor(() => expect(first.container.querySelector('.map-name')).not.toBeNull())
      const name = first.container.querySelector('.map-name')!
      first.unmount()
      const next = await shown({ fresh: true, areas: [{ box: PLACE, name: 'Varrock' }] })
      await waitFor(() => expect(next.container.textContent).toContain('Varrock'))
      expect(name.closest('.leaving')).not.toBeNull()
      await waitFor(() => expect(next.container.textContent).not.toContain('Lumbridge'))
    })

    it('fades what stood on it into its own reveal, and glides into the reveal’s frame', async () => {
      const glide = vi.spyOn(L.Map.prototype, 'flyToBounds')
      const first = await shown({ areas: [{ box: PLACE, name: 'Lumbridge' }] })
      await waitFor(() => expect(first.container.querySelector('.map-name')).not.toBeNull())
      const name = first.container.querySelector('.map-name')!
      first.unmount()
      await shown({ frame: PLACE })
      expect(name.closest('.leaving')).not.toBeNull()
      await waitFor(() => expect(glide).toHaveBeenCalled())
    })

    it('jumps into a frame on a map of its own', async () => {
      const glide = vi.spyOn(L.Map.prototype, 'fitBounds')
      await shown({ keep: false, frame: PLACE })
      await waitFor(() => expect(glide).toHaveBeenCalled())
      expect(glide.mock.calls[0]![1]).toMatchObject({ animate: false })
    })

    it('takes on the new view’s bounds', async () => {
      const first = await shown({})
      expect(first.container.querySelector('.map-outside')).toBeNull()
      first.unmount()
      const next = await shown({ fresh: true, bounds: REGION })
      expect(next.container.querySelector('.map-outside')).not.toBeNull()
      next.unmount()
      const last = await shown({ fresh: true })
      expect(last.container.querySelector('.map-outside')).toBeNull()
    })
  })
})
