<script lang="ts" module>
  /** How long a refusal floats before it fades on its own. */
  export const SHOWN_MS = 4000
</script>

<script lang="ts">
  /**
   * The room's last refusal, in the player's words, floating under the top bar until it
   * fades, the player dismisses it or the next question clears it. Nothing when there is none.
   *
   * Fixed over the page rather than in its flow, so a refusal never shifts the answers
   * under a player's finger.
   */
  import { errorText } from '../lib/errors'
  import { lastError } from '../lib/stores'

  $effect(() => {
    if ($lastError === null) return
    const timer = setTimeout(() => lastError.set(null), SHOWN_MS)
    return () => clearTimeout(timer)
  })
</script>

{#if $lastError !== null}
  <div class="banner bad popup" style:--shown="{SHOWN_MS}ms">
    {errorText($lastError)}
    <button type="button" class="link" onclick={() => lastError.set(null)}>dismiss</button>
  </div>
{/if}

<style>
  .popup {
    position: fixed;
    top: calc(var(--topbar-height) + 0.75rem);
    left: 50%;
    z-index: 21;
    width: max-content;
    max-width: calc(100vw - 2rem);
    margin: 0;
    transform: translateX(-50%);
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.25);
    animation: float var(--shown) linear both;
  }

  @keyframes float {
    from,
    to {
      opacity: 0;
    }
    5%,
    95% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .popup {
      animation: none;
    }
  }
</style>
