<script lang="ts">
  /**
   * When a daily that is not open yet opens: the date, and within its last day a countdown
   * that ticks. Home's panel and `/daily` both say it.
   */
  import { localClock } from '../lib/clock'
  import { COUNTDOWN_FROM_MS, countdown, opensOn } from '../lib/dates'

  let { opensAt, onopen }: { opensAt: string; onopen?: () => void } = $props()

  const clock = localClock(1000)
  const left = $derived(Date.parse(opensAt) - $clock)

  $effect(() => {
    if (left <= 0) onopen?.()
  })
</script>

<p>Available from {opensOn(opensAt)}.</p>
{#if left > 0 && left <= COUNTDOWN_FROM_MS}
  <p class="countdown">Opens in <strong>{countdown(left)}</strong></p>
{/if}

<style>
  .countdown {
    font-variant-numeric: tabular-nums;
  }
</style>
