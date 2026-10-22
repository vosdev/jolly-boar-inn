import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Cooldown, LOBBY_COOLDOWN_MS } from './cooldown.svelte'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Cooldown', () => {
  it('holds past the server cooldown of a second, then lets go', () => {
    const hold = new Cooldown()
    expect(LOBBY_COOLDOWN_MS).toBeGreaterThan(1000)
    hold.start()
    expect(hold.held).toBe(true)
    vi.advanceTimersByTime(LOBBY_COOLDOWN_MS - 1)
    expect(hold.held).toBe(true)
    vi.advanceTimersByTime(1)
    expect(hold.held).toBe(false)
  })

  it('counts from the latest change', () => {
    const hold = new Cooldown(1000)
    hold.start()
    vi.advanceTimersByTime(600)
    hold.start()
    vi.advanceTimersByTime(600)
    expect(hold.held).toBe(true)
    vi.advanceTimersByTime(400)
    expect(hold.held).toBe(false)
  })
})
