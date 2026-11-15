/**
 * `picture_pin` in jsdom, which lays nothing out: the picture's box is given a size, and what
 * stands on it is read back from its pins' places, in fractions of the picture.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { readable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerResult, PlayerView } from '../../lib/protocol'
import { players, you } from '../../lib/stores'
import PicturePin from './types/PicturePin.svelte'

const OPEN = {
  prompt: 'Where is the safespot?',
  picture: '0123456789abcdef.png',
  width: 1600,
  height: 900,
}
const TARGET = { min_x: 0.4, max_x: 0.5, min_y: 0.4, max_y: 0.6 }
const GRID = { cols: 4, rows: 7 }
/** Where the picture's box is drawn: 800 by 450 px, 100 px in and 50 down. */
const BOX = { left: 100, top: 50, width: 800, height: 450 }

function player(index: number, role: PlayerView['role'] = 'player'): PlayerView {
  return {
    id: `p${index}`,
    display_name: `Player ${index}`,
    avatar: null,
    role,
    team: null,
    connected: true,
    ready: false,
    editing: false,
  }
}

function result(value: { x: number; y: number }, credit = 0.5): PlayerResult {
  return { value, correct: credit >= 1, credit, points: Math.round(credit * 1000) }
}

function setup(props: Record<string, unknown>) {
  const onAnswer = vi.fn()
  const view = render(PicturePin, {
    data: OPEN,
    revealed: false,
    yourValue: null,
    canAnswer: true,
    onAnswer,
    ...props,
  })
  return { ...view, onAnswer }
}

const frameOf = (container: HTMLElement) => container.querySelector<HTMLElement>('.frame')!
const pins = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.pin')]
const lockIn = () => screen.queryByRole('button', { name: 'Lock in' })

/** A tap at a fraction of the picture, through the px the screen drew it at. */
async function tap(container: HTMLElement, x: number, y: number): Promise<void> {
  await fireEvent.click(frameOf(container), {
    clientX: BOX.left + x * BOX.width,
    clientY: BOX.top + y * BOX.height,
  })
}

function at(pin: HTMLElement | undefined): { x: number; y: number } {
  return { x: Number(pin?.dataset.x), y: Number(pin?.dataset.y) }
}

describe('PicturePin', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      ...BOX,
      x: BOX.left,
      y: BOX.top,
      right: BOX.left + BOX.width,
      bottom: BOX.top + BOX.height,
      toJSON: () => ({}),
    })
    players.set(Array.from({ length: 4 }, (_, index) => player(index)))
    you.set(player(0))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    players.set([])
    you.set(null)
  })

  it('draws the picture by its random name in a box of its shape, with no target', () => {
    const { container } = setup({})
    const shot = container.querySelector<HTMLImageElement>('img.shot')
    expect(shot?.getAttribute('src')).toBe('/pictures/0123456789abcdef.png')
    expect(
      container.querySelector<HTMLElement>('.picture-pin')?.style.getPropertyValue('--ratio'),
    ).toBe('1600 / 900')
    expect(container.querySelector('.target')).toBeNull()
    expect(pins(container)).toHaveLength(0)
  })

  it('places your pin where you tap, moves it on the next and locks it in once', async () => {
    const { container, onAnswer } = setup({})
    expect(lockIn()?.hasAttribute('disabled')).toBe(true)
    await tap(container, 0.25, 0.5)
    expect(pins(container)).toHaveLength(1)
    expect(at(pins(container)[0])).toEqual({ x: 0.25, y: 0.5 })
    await tap(container, 0.75, 0.2)
    expect(pins(container)).toHaveLength(1)
    expect(at(pins(container)[0]).x).toBeCloseTo(0.75, 9)
    expect(at(pins(container)[0]).y).toBeCloseTo(0.2, 9)

    await fireEvent.click(lockIn()!)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    const [value] = onAnswer.mock.calls[0] as [{ x: number; y: number }]
    expect(value.x).toBeCloseTo(0.75, 9)
    expect(value.y).toBeCloseTo(0.2, 9)
  })

  it('keeps a tap past the edge on the picture', async () => {
    const { container } = setup({})
    await fireEvent.click(frameOf(container), { clientX: 0, clientY: 900 })
    expect(at(pins(container)[0])).toEqual({ x: 0, y: 1 })
  })

  it('draws a grid, snaps the tap to the middle of its cell and lights the cell', async () => {
    const { container, onAnswer } = setup({
      data: { ...OPEN, width: 400, height: 700, grid: GRID },
    })
    expect(container.querySelectorAll('line.grid')).toHaveLength(GRID.cols - 1 + GRID.rows - 1)
    await tap(container, 0.6, 0.45)
    expect(at(pins(container)[0])).toEqual({ x: 0.625, y: 0.5 })
    const lit = container.querySelector('rect.lit')
    expect(Number(lit?.getAttribute('x'))).toBeCloseTo(200, 6)
    expect(Number(lit?.getAttribute('width'))).toBeCloseTo(100, 6)
    await fireEvent.click(lockIn()!)
    expect(onAnswer).toHaveBeenCalledWith({ x: 0.625, y: 0.5 })
  })

  it('moves the pin with the arrow keys and locks it in with Enter', async () => {
    const { container, onAnswer } = setup({ data: { ...OPEN, grid: GRID } })
    const frame = frameOf(container)
    await fireEvent.keyDown(frame, { key: 'ArrowRight' })
    await fireEvent.keyDown(frame, { key: 'ArrowDown' })
    expect(at(pins(container)[0])).toEqual({ x: 0.875, y: 4.5 / 7 })
    await fireEvent.keyDown(frame, { key: 'Enter' })
    expect(onAnswer).toHaveBeenCalledWith({ x: 0.875, y: 4.5 / 7 })
  })

  it('sends a pin not locked in before the question ends', async () => {
    const endsAt = new Date(Date.now() + 1300).toISOString()
    const timing = { answerableAt: endsAt, endsAt, now: readable(Date.now()) }
    const { container, onAnswer } = setup({ timing })
    await tap(container, 0.3, 0.3)
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1), { timeout: 1500 })
  })

  it('takes nothing once a pin is locked in, and shows it where it went', async () => {
    const { container, onAnswer } = setup({ yourValue: { x: 0.1, y: 0.9 } })
    await tap(container, 0.5, 0.5)
    expect(lockIn()).toBeNull()
    expect(at(pins(container)[0])).toEqual({ x: 0.1, y: 0.9 })
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('lets the TV pin nothing', async () => {
    you.set(player(0, 'tv'))
    const { container } = setup({})
    await tap(container, 0.5, 0.5)
    expect(pins(container)).toHaveLength(0)
    expect(lockIn()).toBeNull()
    expect(container.querySelector('img.shot')).not.toBeNull()
  })

  it('reveals the target box, every pin and a line from each miss to the box', () => {
    const { container } = setup({
      data: { ...OPEN, target: TARGET, reach: 0.2 },
      revealed: true,
      yourValue: { x: 0.45, y: 0.5 },
      results: {
        p0: result({ x: 0.45, y: 0.5 }, 1),
        p1: result({ x: 0.6, y: 0.5 }),
        p2: result({ x: 0.9, y: 0.1 }, 0),
      },
    })
    const box = container.querySelector('rect.target')
    expect(Number(box?.getAttribute('x'))).toBeCloseTo(640, 6)
    expect(Number(box?.getAttribute('width'))).toBeCloseTo(160, 6)
    expect(pins(container)).toHaveLength(3)
    const lines = [...container.querySelectorAll('line.miss')]
    expect(lines).toHaveLength(2)
    expect(Number(lines[0]?.getAttribute('x2'))).toBeCloseTo(800, 6)
    expect(screen.getByText('You')).toBeTruthy()
    expect(pins(container).map((pin) => pin.title)).toContain('Player 2')
  })

  it('reveals the target cells on a grid', () => {
    const { container } = setup({
      data: {
        ...OPEN,
        grid: GRID,
        cells: [
          { col: 2, row: 3 },
          { col: 0, row: 6 },
        ],
      },
      revealed: true,
      yourValue: { x: 0.625, y: 0.5 },
      results: { p0: result({ x: 0.625, y: 0.5 }, 1), p1: result({ x: 0.875, y: 0.5 }, 0) },
    })
    expect(container.querySelectorAll('rect.target')).toHaveLength(2)
    expect(container.querySelectorAll('line.miss')).toHaveLength(1)
  })

  it('shows a phone beside the TV its own pin against the target', () => {
    const { container } = setup({
      data: { ...OPEN, target: TARGET, reach: 0.2 },
      revealed: true,
      yourValue: { x: 0.6, y: 0.5 },
      results: null,
    })
    expect(pins(container)).toHaveLength(1)
    expect(container.querySelectorAll('line.miss')).toHaveLength(1)
    expect(container.querySelector('rect.target')).not.toBeNull()
  })
})
