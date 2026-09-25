/**
 * The server's clock, as this browser best knows it.
 *
 * Every countdown in the room is an absolute server timestamp — `ends_at`, `next_at`,
 * `answerable_at` — against this clock, recomputed on every tick and never decremented
 * (section 3, reconnect step 2). That is what makes the awkward cases come out right:
 *
 * - A phone that slept for 20 s wakes into a tick that subtracts the real elapsed time,
 *   not 20 s of ticks that never ran.
 * - A laptop whose clock is five minutes fast still shows the same number as everyone
 *   else, because `serverOffsetMs` cancels it out.
 * - A tab that a browser throttled to one timer callback a second is at worst a second
 *   stale, never a second wrong.
 *
 * `visibilitychange` gets its own tick so coming back to the tab redraws at once rather
 * than waiting out a throttled interval.
 */

import { derived, readable, type Readable } from 'svelte/store'

import { serverOffsetMs } from './stores'

/** How often a watched clock ticks: often enough that a 100ms bar transition never stalls. */
export const TICK_MS = 100

/** This browser's clock in ms, ticking only while something is subscribed. */
export function localClock(tickMs = TICK_MS): Readable<number> {
  return readable(Date.now(), (set) => {
    const tick = (): void => set(Date.now())
    tick()
    const timer = setInterval(tick, tickMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  })
}

/** The server's time in ms: the local clock corrected by the last `server_time` seen. */
export const serverNow: Readable<number> = derived(
  [localClock(), serverOffsetMs],
  ([now, offset]) => now + offset,
)

/** Milliseconds from `now` until an ISO 8601 instant: never negative, 0 if it will not parse. */
export function msUntil(iso: string, now: number): number {
  const at = Date.parse(iso)
  return Number.isNaN(at) ? 0 : Math.max(0, at - now)
}
