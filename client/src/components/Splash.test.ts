/**
 * The splash's ready button and countdown bar: one take-back per splash, and a bar that
 * a `pong` moving the clock offset does not fill up again.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerView, Segment } from '../lib/protocol'
import { serverOffsetMs } from '../lib/stores'
import Splash from './Splash.svelte'

const SEGMENT: Segment = { mode: 'more_less', index: 0, total: 2, start: 0, count: 5 }

function players(youReady: boolean): PlayerView[] {
  return [
    { id: 'a', display_name: 'Zezima', role: 'player', connected: true, ready: youReady },
    { id: 'b', display_name: 'Woox', role: 'player', connected: true, ready: false },
  ]
}

const fill = () => (document.querySelector('.fill') as HTMLElement).style.width

afterEach(() => {
  serverOffsetMs.set(0)
})

describe('Splash ready button', () => {
  it('can be taken back once, and after that stays ready', async () => {
    const onReady = vi.fn()
    const { rerender } = render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      questionSeconds: 10,
      players: players(false),
      youId: 'a',
      onReady,
    })
    await fireEvent.click(screen.getByRole('button', { name: "✓ I'm ready" }))
    expect(onReady).toHaveBeenLastCalledWith(true)
    await rerender({ players: players(true) })

    await fireEvent.click(screen.getByRole('button', { name: '✓ Ready — tap to undo' }))
    expect(onReady).toHaveBeenLastCalledWith(false)
    await rerender({ players: players(false) })

    await fireEvent.click(screen.getByRole('button', { name: "✓ I'm ready" }))
    expect(onReady).toHaveBeenLastCalledWith(true)
    await rerender({ players: players(true) })

    const settled = screen.getByRole('button', { name: '✓ Ready' }) as HTMLButtonElement
    expect(settled.disabled).toBe(true)
    expect(onReady).toHaveBeenCalledTimes(3)
  })
})

describe('Splash countdown bar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(Date.parse('2026-09-25T20:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts full and drains, and a pong moving the offset does not fill it again', async () => {
    render(Splash, {
      segment: SEGMENT,
      endsAt: new Date(Date.now() + 10_000).toISOString(),
      questionSeconds: 10,
      players: players(true),
      youId: 'a',
      onReady: () => {},
    })
    expect(fill()).toBe('100%')
    await vi.advanceTimersByTimeAsync(4_000)
    expect(parseFloat(fill())).toBeCloseTo(60, 0)
    serverOffsetMs.set(5)
    await vi.advanceTimersByTimeAsync(100)
    expect(parseFloat(fill())).toBeCloseTo(59, 0)
  })
})
