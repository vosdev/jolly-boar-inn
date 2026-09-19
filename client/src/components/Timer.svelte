<script lang="ts">
  /**
   * How long is left, on the server's clock.
   *
   * The only inputs are an absolute `ends_at` from the server and `serverOffsetMs`, the
   * difference between the server's clock and this browser's as of the last `welcome`
   * or `pong` (section 3, reconnect step 2). Every tick recomputes
   * `ends_at - (now + offset)` from scratch; nothing is ever decremented.
   *
   * That is what makes the awkward cases come out right:
   *
   * - A phone that slept for 20 s wakes into a tick that subtracts the real elapsed
   *   time, not 20 s of ticks that never ran.
   * - A laptop whose clock is five minutes fast still shows the same number as everyone
   *   else, because the offset cancels it out.
   * - A tab that a browser throttled to one timer callback a second is at worst a
   *   second stale, never a second wrong.
   *
   * `visibilitychange` gets its own tick so coming back to the tab redraws immediately
   * rather than waiting out a throttled interval.
   */
  import { onMount } from 'svelte'

  import { serverOffsetMs } from '../lib/stores'

  let {
    endsAt,
    totalSeconds,
    label = 'left',
  }: {
    /** ISO 8601, from `question.ends_at` or `room.next_at`. */
    endsAt: string
    /** What a full bar means. Only the bar uses it; the number comes from the clock. */
    totalSeconds: number
    label?: string
  } = $props()

  const TICK_MS = 100
  /** Where the bar turns urgent, in seconds. */
  const URGENT_S = 5

  let nowMs = $state(Date.now())

  const endMs = $derived(Date.parse(endsAt))
  const remainingMs = $derived(
    Number.isNaN(endMs) ? 0 : Math.max(0, endMs - (nowMs + $serverOffsetMs)),
  )
  // Ceil, so the last whole second on screen is "1" and not a flash of "0".
  const seconds = $derived(Math.ceil(remainingMs / 1000))
  const fraction = $derived(
    totalSeconds > 0 ? Math.min(1, remainingMs / (totalSeconds * 1000)) : 0,
  )
  const urgent = $derived(remainingMs > 0 && seconds <= URGENT_S)

  onMount(() => {
    const tick = (): void => {
      nowMs = Date.now()
    }
    tick()
    const timer = setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  })
</script>

<div class="timer" class:urgent role="timer" aria-label="{seconds} seconds {label}">
  <div class="count">
    <span class="seconds">{seconds}</span><span class="unit">s {label}</span>
  </div>
  <!-- The bar is decoration; the number above it is what a screen reader gets. -->
  <div class="track" aria-hidden="true">
    <div class="fill" style:width="{fraction * 100}%"></div>
  </div>
</div>

<style>
  .timer {
    margin-bottom: 1rem;
  }

  .count {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.2rem;
    margin-bottom: 0.35rem;
  }

  .seconds {
    font-variant-numeric: tabular-nums;
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 1;
  }

  .unit {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .track {
    height: 0.5rem;
    border-radius: 999px;
    background: var(--line);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    /* Only as long as a tick, so a jump back from a sleeping tab lands at once. */
    transition: width 100ms linear;
  }

  .urgent .seconds {
    color: var(--bad);
  }

  .urgent .fill {
    background: var(--bad);
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
