import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { localClock, msUntil, serverNow, TICK_MS } from './clock'
import { serverOffsetMs } from './stores'

describe('msUntil', () => {
  const at = Date.parse('2026-09-21T20:00:10Z')

  it('counts down to the instant', () => {
    expect(msUntil('2026-09-21T20:00:10Z', at - 2_500)).toBe(2_500)
  })

  it('stops at zero once the instant has passed', () => {
    expect(msUntil('2026-09-21T20:00:10Z', at + 1)).toBe(0)
  })

  it('reads a timestamp it cannot parse as already over', () => {
    expect(msUntil('not a time', at)).toBe(0)
  })
})

describe('the clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 10_000 })
    serverOffsetMs.set(0)
  })

  afterEach(() => {
    serverOffsetMs.set(0)
    vi.useRealTimers()
  })

  it('is this browser’s time corrected by the server offset', () => {
    serverOffsetMs.set(-3_000)
    expect(get(serverNow)).toBe(7_000)
  })

  it('ticks while watched, and follows a new offset at once', () => {
    const seen: number[] = []
    const stop = serverNow.subscribe((now) => seen.push(now))
    vi.advanceTimersByTime(TICK_MS)
    expect(seen.at(-1)).toBe(10_000 + TICK_MS)
    serverOffsetMs.set(500)
    expect(seen.at(-1)).toBe(10_000 + TICK_MS + 500)
    stop()
  })

  it('ticks when the tab comes back, without waiting for the interval', () => {
    const seen: number[] = []
    const stop = localClock(60_000).subscribe((now) => seen.push(now))
    // A tab asleep for 20 s: the clock moved, and no interval has run since.
    vi.setSystemTime(30_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(seen.at(-1)).toBe(30_000)
    stop()
  })

  it('stops its timer and its listener when nothing watches it', () => {
    const listening = vi.spyOn(document, 'removeEventListener')
    const stop = serverNow.subscribe(() => {})
    expect(vi.getTimerCount()).toBe(1)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(listening).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    listening.mockRestore()
  })
})
