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

const SARIM = { name: 'Port Sarim', x: 3028, y: 3217, radius: 40 }
const TOWNS = [
  SARIM,
  { name: 'Rellekka', x: 2660, y: 3660, radius: 30 },
  { name: 'Ardougne', x: 2662, y: 3305, radius: 30 },
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
  }
}

function result(value: { x: number; y: number }[]): PlayerResult {
  return { value, correct: false, credit: 0.5, points: 500 }
}

function resultsFor(count: number, pins: number): Record<string, PlayerResult> {
  const rows: Record<string, PlayerResult> = {}
  for (let index = 0; index < count; index++) {
    rows[`p${index}`] = result(
      TOWNS.slice(0, pins).map((town) => ({ x: town.x + 200 + index * 40, y: town.y })),
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

async function loaded(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(container.querySelector('.leaflet-container')).not.toBeNull())
  await waitFor(() => expect(mapOf(container).dataset.zoom).toBeDefined())
  return mapOf(container)
}

const pins = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.pin')]
const lockIn = () => screen.getByRole('button', { name: 'Lock in' }) as HTMLButtonElement

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
    expect(lockIn().disabled).toBe(true)

    await fireEvent.click(map, { clientX: 300, clientY: 300 })
    await waitFor(() => expect(pins(container)).toHaveLength(1))
    await fireEvent.click(map, { clientX: 400, clientY: 300 })
    await waitFor(() => expect(pins(container)).toHaveLength(1))
    expect(lockIn().disabled).toBe(false)

    await fireEvent.click(lockIn())
    expect(onAnswer).toHaveBeenCalledTimes(1)
    const [value] = onAnswer.mock.calls[0] as [{ x: number; y: number }[]]
    expect(value).toHaveLength(1)
    expect(Number.isInteger(value[0]?.x)).toBe(true)
    expect(Number.isInteger(value[0]?.y)).toBe(true)
  })

  it('waits for the last of several pins, and a tap on one takes it away', async () => {
    const { container } = setup({ data: { prompt: 'Where?', pins: 3 } })
    const map = await loaded(container)
    for (const x of [200, 300, 400]) {
      await fireEvent.click(map, { clientX: x, clientY: 300 })
    }
    await waitFor(() => expect(pins(container)).toHaveLength(3))
    expect(lockIn().disabled).toBe(false)

    await fireEvent.click(container.querySelector('.pin-host')!)
    await waitFor(() => expect(pins(container)).toHaveLength(2))
    expect(lockIn().disabled).toBe(true)
    expect(screen.getByText(/2 of 3 pins placed/)).toBeTruthy()
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
    expect(screen.queryByRole('button', { name: 'Lock in' })).toBeNull()
    expect(screen.getByText('Pin locked in.')).toBeTruthy()
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('reveals a pin and a line per player and names the target', async () => {
    const { container } = setup({
      data: { prompt: 'Where?', pins: 1, targets: [SARIM] },
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

  it('starts close on the answer and pulls back to fit every pin', async () => {
    const start = Date.now()
    const { container } = setup({
      data: { prompt: 'Where?', pins: 1, targets: [SARIM] },
      revealed: true,
      yourValue: [{ x: 3228, y: 3217 }],
      results: { ...resultsFor(2, 1), far: result([{ x: 1000, y: 3217 }]) },
    })
    const map = await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(3))
    const closeZoom = Number(map.dataset.zoom)
    vi.spyOn(Date, 'now').mockReturnValue(start + 5000)
    await waitFor(() => expect(Number(map.dataset.zoom)).toBeLessThan(closeZoom), { timeout: 5000 })
  }, 8000)

  it('shows everyone’s pins with five who pinned several', async () => {
    const { container } = setup({
      data: { prompt: 'Where?', pins: 3, targets: TOWNS },
      revealed: true,
      yourValue: resultsFor(1, 3).p0?.value,
      results: resultsFor(5, 3),
    })
    await loaded(container)
    await waitFor(() => expect(pins(container)).toHaveLength(15))
  })

  it('keeps to your own pins with more than five who pinned several', async () => {
    const { container } = setup({
      data: { prompt: 'Where?', pins: 3, targets: TOWNS },
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
      data: { prompt: 'Where?', pins: 3, targets: TOWNS },
      revealed: true,
      results: resultsFor(6, 3),
    })
    await loaded(container)
    await waitFor(() => expect(screen.getByText('Rellekka')).toBeTruthy())
    expect(pins(container)).toHaveLength(0)
  })
})
