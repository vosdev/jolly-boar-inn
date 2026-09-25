<script lang="ts">
  /**
   * How long is left, on the server's clock.
   *
   * The only inputs are an absolute `ends_at` from the server and `lib/clock.ts`, which
   * corrects this browser's clock by the offset from the last `welcome` or `pong` and says
   * why nothing here is ever decremented.
   */
  import { msUntil, serverNow } from '../lib/clock'

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

  /** Where the bar turns urgent, in seconds. */
  const URGENT_S = 5

  const remainingMs = $derived(msUntil(endsAt, $serverNow))
  // Ceil, so the last whole second on screen is "1" and not a flash of "0".
  const seconds = $derived(Math.ceil(remainingMs / 1000))
  const fraction = $derived(
    totalSeconds > 0 ? Math.min(1, remainingMs / (totalSeconds * 1000)) : 0,
  )
  const urgent = $derived(remainingMs > 0 && seconds <= URGENT_S)
</script>

<div class="timer surface" class:urgent role="timer" aria-label="{seconds} seconds {label}">
  <div class="count">
    <span class="seconds">{seconds}</span><span class="unit">s {label}</span>
  </div>
  <!-- The bar is decoration; the number above it is what a screen reader gets. -->
  <div class="track" aria-hidden="true">
    <div class="fill" style:width="{fraction * 100}%"></div>
  </div>
</div>

<style>
  /* A small plaque of its own (D5): the timer sits on the page, and a theme's page may be
     a dark floor that neither the accent bar nor an urgent --bad would read against. */
  .timer {
    margin-bottom: 1rem;
    padding: calc(0.4rem - var(--border-give)) calc(0.65rem - var(--border-give));
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
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
