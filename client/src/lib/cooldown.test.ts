import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Cooldown, HeldToggle, LOBBY_COOLDOWN_MS } from './cooldown.svelte'

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

describe('HeldToggle', () => {
  function toggle(server = false) {
    const sent: boolean[] = []
    const state = { server }
    const held = new HeldToggle(
      (value) => {
        sent.push(value)
        state.server = value
        return true
      },
      () => state.server,
      1000,
    )
    return { held, sent, state }
  }

  it('sends a tap at once and shows it before the server answers', () => {
    const { held, sent } = toggle()
    held.toggle()
    expect(sent).toEqual([true])
    expect(held.shown).toBe(true)
  })

  it('shows a tap inside the cooldown at once, and sends only the last after it', () => {
    const { held, sent } = toggle()
    held.toggle()
    held.toggle()
    expect(held.shown).toBe(false)
    held.toggle()
    held.toggle()
    expect(sent).toEqual([true])
    vi.advanceTimersByTime(1000)
    expect(sent).toEqual([true, false])
    expect(held.shown).toBe(false)
  })

  it('sends nothing more when the taps end where the server already is', () => {
    const { held, sent } = toggle()
    held.toggle()
    held.toggle()
    held.toggle()
    vi.advanceTimersByTime(1000)
    expect(sent).toEqual([true])
    expect(held.shown).toBe(true)
  })

  it('falls back to the server once the cooldown ends with nothing kept', () => {
    const { held, state } = toggle()
    held.toggle()
    state.server = false
    expect(held.shown).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(held.shown).toBe(false)
  })

  it('shows nothing it could not send', () => {
    const held = new HeldToggle(
      () => false,
      () => false,
    )
    held.toggle()
    expect(held.shown).toBe(false)
  })
})
