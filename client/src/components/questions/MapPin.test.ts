/**
 * `map_pin` on real Leaflet: tiles are the only thing jsdom cannot show, so taps go to the map's
 * own element and what stands on the map is read back from its markers.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { readable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerResult, PlayerView } from '../../lib/protocol'
import { players, you } from '../../lib/stores'
import MapPin from './types/MapPin.svelte'

const SARIM = { name: 'Port Sarim', min_x: 3008, max_x: 3060, min_y: 3180, max_y: 3260 }
const TOWNS = [
  SARIM,
  { name: 'Rellekka', min_x: 2620, max_x: 2700, min_y: 3620, max_y: 3700 },
  { name: 'Ardougne', min_x: 2620, max_x: 2700, min_y: 3270, max_y: 3340 },
]

function player(index: number): PlayerView {
  return {
    id: `p${index}`,
    display_name: `Player ${index}`,
    avatar: null,
    role: 'player',
    team: null,
    connected: true,
    ready: false,
    editing: false,
    item: null,
  }
}

function result(value: { x: number; y: number }[]): PlayerResult {
  return {
    value,
    correct: false,
    credit: 0.5,
    points: 500,
    item_points: 0,
    item: null,
    by_book: false,
  }
}

function resultsFor(count: number, pins: number): Record<string, PlayerResult> {
  const rows: Record<string, PlayerResult> = {}
  for (let index = 0; index < count; index++) {
    rows[`p${index}`] = result(
      TOWNS.slice(0, pins).map((town) => ({
        x: town.max_x + 200 + index * 40,
        y: town.min_y,
      })),
    )
  }
  return rows
}

function setup(props: Record<string, unknown>) {
  const onAnswer = vi.fn()
  const view = render(MapPin, {
    data: { prompt: 'Where?', pins: 1 },
    revealed: false,
    yourValue: null,
    canAnswer: true,
    onAnswer,
    ...props,
  })
  return { ...view, onAnswer }
}

const mapOf = (container: HTMLElement) => container.querySelector<HTMLElement>('.map')!

/** Leaflet's own element, which hears the taps, once the map has its zoom. */
async function loaded(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(container.querySelector('.leaflet-container')).not.toBeNull())
  await waitFor(() => expect(mapOf(container).dataset.zoom).toBeDefined())
  return container.querySelector<HTMLElement>('.leaflet-container')!
}

const pins = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.pin')]
const lockIn = () => document.querySelector<HTMLButtonElement>('button.pin-action')

describe('MapPin', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    players.set(Array.from({ length: 12 }, (_, index) => player(index)))
    you.set(player(0))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    players.set([])
    you.set(null)
  })

  it('places a pin on a tap, moves it on the next and locks it in once', async () => {
    const { container, onAnswer } = setup({})
    const map = await loaded(container)
    expect(lockIn()).toBeNull()

    await fireEvent.click(map, { clientX: 300, clientY: 300 })
    await waitFor(() => expect(pins(container)).toHaveLength(1))
    await fireEvent.click(map, { clientX: 400, clientY: 300 })
    await waitFor(() => expect(pins(container)).toHaveLength(1))
    expect(pins(container)[0]?.contains(lockIn())).toBe(true)
    expect(lockIn()?.textContent).toBe('Lock in')

    await fireEvent.click(lockIn()!)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    const [value] = onAnswer.mock.calls[0] as [{ x: number; y: number }[]]
    expect(value).toHaveLength(1)
    expect(Number.isInteger(value[0]?.x)).toBe(true)
    expect(Number.isInteger(value[0]?.y)).toBe(true)
  })

  it('offers Lock in on the last of several pins, and a tap on one takes it away', async () => {
    const { container } = setup({ data: { prompt: 'Where?', pins: 3 } })
    const map = await loaded(container)
    for (const x of [200, 300]) {
      await fireEvent.click(map, { clientX: x, clientY: 300 })
    }
    await waitFor(() => expect(pins(container)).toHaveLength(2))
    expect(lockIn()).toBeNull()
    await fireEvent.click(map, { clientX: 400, clientY: 300 })
    await waitFor(() => expect(pins(container)).toHaveLength(3))
    expect(pins(container).filter((pin) => pin.contains(lockIn()))).toHaveLength(1)

    await fireEvent.click(container.querySelector('.pin-host')!)
    await waitFor(() => expect(pins(container)).toHaveLength(2))
    expect(lockIn()).toBeNull()
  })

  it('moves Lock in to the pin moved last, and pressing it takes no pin away', async () => {
    const { container, onAnswer } = setup({ data: { prompt: 'Where?', pins: 2 } })
    const map = await loaded(container)
    await fireEvent.click(map, { clientX: 200, clientY: 300 })
    await fireEvent.click(map, { clientX: 500, clientY: 300 })
    await waitFor(() => expect(pins(container)).toHaveLength(2))
    const second = pins(container).find((pin) => pin.contains(lockIn()))?.dataset.id

    await fireEvent.click(map, { clientX: 210, clientY: 300 })
    await waitFor(() => {
      const holder = pins(container).find((pin) => pin.contains(lockIn()))
      expect(holder?.dataset.id).not.toBe(second)
    })

    await fireEvent.click(lockIn()!)
    expect(pins(container)).toHaveLength(2)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect((onAnswer.mock.calls[0] as [unknown[]])[0]).toHaveLength(2)
  })

  it('sends a pin not locked in before the question ends', async () => {
    const endsAt = new Date(Date.now() + 1300).toISOString()
    const timing = { answerableAt: endsAt, endsAt, now: readable(Date.now()) }
    const { container, onAnswer } = setup({ timing })
    const map = await loaded(container)
    await fireEvent.click(map, { clientX: 300, clientY: 300 })
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1), { timeout: 1500 })
  })

  it('takes nothing once a pin is locked in', async () => {
    const { container, onAnswer } = setup({ yourValue: [{ x: 3000, y: 3200 }] })
    const map = await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(1))
    await fireEvent.click(map, { clientX: 300, clientY: 300 })
    expect(lockIn()).toBeNull()
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('reveals a pin and a line per player and names the target', async () => {
    const { container } = setup({
      data: { prompt: 'Where?', pins: 1, targets: [SARIM], reach: 100 },
      revealed: true,
      yourValue: [{ x: 3228, y: 3217 }],
      results: resultsFor(3, 1),
    })
    await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(3))
    expect(container.querySelectorAll('.map-line')).toHaveLength(3)
    expect(screen.getByText('Port Sarim')).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
    expect(screen.getByText('Player 2')).toBeTruthy()
  })

  it('draws a box for each target and sends a line to its edge', async () => {
    const { container } = setup({
      data: { prompt: 'Where?', pins: 1, targets: [SARIM], reach: 100 },
      revealed: true,
      yourValue: [{ x: 3100, y: 3220 }],
      results: { p0: result([{ x: 3100, y: 3220 }]) },
    })
    await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(1))
    expect(container.querySelectorAll('.map-ring')).toHaveLength(2)
    expect(screen.getByText('40 tiles')).toBeTruthy()
  })

  it('says how far each pin landed from the place', async () => {
    const east = (tiles: number) => [{ x: SARIM.max_x + tiles, y: 3220 }]
    const { container } = setup({
      data: { prompt: 'Where is Port Sarim?', pins: 1, targets: [SARIM], reach: 100 },
      revealed: true,
      yourValue: east(20),
      results: { p0: result(east(20)), p1: result(east(50)), p2: result(east(150)) },
    })
    await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(3))
    expect(container.querySelectorAll('.map-line')).toHaveLength(3)
    for (const distance of ['20 tiles', '50 tiles', '150 tiles']) {
      expect(screen.getByText(distance)).toBeTruthy()
    }
  })

  it('starts close on the answer and pulls back to fit every pin', async () => {
    const start = Date.now()
    const { container } = setup({
      data: { prompt: 'Where?', pins: 1, targets: [SARIM], reach: 100 },
      revealed: true,
      yourValue: [{ x: 3228, y: 3217 }],
      results: { ...resultsFor(2, 1), far: result([{ x: 1000, y: 3217 }]) },
    })
    await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(3))
    const closeZoom = Number(mapOf(container).dataset.zoom)
    vi.spyOn(Date, 'now').mockReturnValue(start + 5000)
    await waitFor(() => expect(Number(mapOf(container).dataset.zoom)).toBeLessThan(closeZoom), {
      timeout: 5000,
    })
  }, 8000)

  it('shows everyone’s pins with five who pinned several', async () => {
    const { container } = setup({
      data: { prompt: 'Where?', pins: 3, targets: TOWNS, reach: 100 },
      revealed: true,
      yourValue: resultsFor(1, 3).p0?.value,
      results: resultsFor(5, 3),
    })
    await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(15))
  })

  it('keeps to your own pins with more than five who pinned several', async () => {
    const { container } = setup({
      data: { prompt: 'Where?', pins: 3, targets: TOWNS, reach: 100 },
      revealed: true,
      yourValue: resultsFor(1, 3).p0?.value,
      results: resultsFor(6, 3),
    })
    await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(3))
    expect(container.querySelectorAll('.map-line')).toHaveLength(3)
  })

  it('shows a TV no pin in a crowd, only the targets', async () => {
    you.set({ ...player(11), role: 'tv' })
    const { container } = setup({
      data: { prompt: 'Where?', pins: 3, targets: TOWNS, reach: 100 },
      revealed: true,
      results: resultsFor(6, 3),
    })
    await loaded(container)
    await waitFor(() => expect(screen.getByText('Rellekka')).toBeTruthy())
    expect(pins(container)).toHaveLength(0)
  })
})
