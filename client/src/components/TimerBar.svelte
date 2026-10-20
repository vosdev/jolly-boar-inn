<script lang="ts">
  /**
   * The question's clock as a thin bar under the top bar (section 7.2).
   *
   * Full width and draining from the left, so it is something to glance at rather than a
   * number to stare at, and it costs a phone six pixels where `Timer`'s plaque cost a
   * row. The seconds still exist, small, in a tab hanging off the bar's right end, and
   * in full for a screen reader.
   *
   * The clock is `Timer`'s, `lib/clock.ts`, so a phone that was locked for twenty seconds
   * wakes onto the right width, not twenty seconds behind.
   */
  import { msUntil, serverNow } from '../lib/clock'

  let {
    endsAt,
    totalSeconds,
    label,
    progress,
  }: {
    endsAt: string
    totalSeconds: number
    label: string
    progress?: string
  } = $props()

  /** Where the bar turns urgent, in seconds. */
  const URGENT_S = 5

  const remainingMs = $derived(msUntil(endsAt, $serverNow))
  // Ceil, so the last whole second on screen is "1" and not a flash of "0". Never more
  // than the whole: a random event's clock starts after its NPC's hold, and until
  // then the bar sits full on the question's own length rather than counting the hold.
  const seconds = $derived(Math.ceil(Math.min(remainingMs, totalSeconds * 1000) / 1000))
  const fraction = $derived(totalSeconds > 0 ? Math.min(1, remainingMs / (totalSeconds * 1000)) : 0)
  const urgent = $derived(remainingMs > 0 && seconds <= URGENT_S)
</script>

<div class="timerbar" class:urgent role="timer" aria-label="{seconds} seconds {label}">
  <div class="track" aria-hidden="true">
    <div class="fill" style:width="{fraction * 100}%"></div>
  </div>
  <!-- A question's screen is the stage's 30rem column, so its tabs hang at the stage's
       edges. The question's number is the heading's to say to a screen reader. -->
  <div class="column" class:stage={progress !== undefined} aria-hidden="true">
    {#if progress !== undefined}
      <span class="tab progress">{progress}</span>
    {/if}
    <span class="tab seconds">{seconds}s</span>
  </div>
</div>

<style>
  /* Sticky under the top bar, and taking no height from the page: the track lies over
     main's top padding and the tab hangs into it, so the stage does not drop six pixels
     from the splash, which has no bar, into the round's first question. */
  .timerbar {
    position: sticky;
    top: var(--topbar-height);
    z-index: 19;
    height: 6px;
    margin-bottom: -6px;
  }

  .track {
    height: 6px;
    background: var(--panel);
    box-shadow: 0 var(--border-width) 0 var(--line);
    display: flex;
    justify-content: flex-end;
  }

  /* Anchored right, so the time that is gone empties out from the left. */
  .fill {
    height: 100%;
    background: var(--accent);
    /* Only as long as a tick, so a jump back from a sleeping tab lands at once. */
    transition: width 100ms linear;
  }

  .urgent .fill {
    background: var(--bad);
  }

  /* The screens' column, so the tab lines up with the panels rather than the window. */
  .column {
    width: min(42rem, 100% - 2rem);
    margin-inline: auto;
    display: flex;
    justify-content: space-between;
  }

  .column.stage {
    width: min(30rem, 100% - 2rem);
  }

  .seconds {
    margin-left: auto;
  }

  .tab {
    padding: 0 0.45rem;
    background: var(--panel);
    color: var(--surface-ink);
    border: var(--border-width) solid var(--line);
    border-top: none;
    border-radius: 0 0 min(var(--radius), 6px) min(var(--radius), 6px);
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.5;
  }

  .urgent .seconds {
    color: var(--bad);
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
