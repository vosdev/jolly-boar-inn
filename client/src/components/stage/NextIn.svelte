<script lang="ts">
  /**
   * The bubble's countdown to whatever follows a reveal, on the server's clock. With no
   * `at`, while the question is open or a reveal waits on nobody's clock, it keeps its line
   * empty, so the bubble is its height throughout.
   */
  import { msUntil, serverNow } from '../../lib/clock'
  import { nextInLine } from '../../lib/nextUp'

  let { at, what }: { at: string | null; what: string } = $props()

  // Ceil, so the last whole second on screen is "1" and not a flash of "0".
  const seconds = $derived(
    at === null ? null : Math.max(0, Math.ceil(msUntil(at, $serverNow) / 1000)),
  )
</script>

<span class="next">{seconds === null ? '\u00a0' : nextInLine(what, seconds)}</span>

<style>
  .next {
    display: block;
    margin-top: 0.25rem;
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
