<script lang="ts">
  /**
   * Where an iPhone gets no Full screen switch (WebKit offers the API on video only), a line
   * pointing to the Home Screen, where the game does run full screen (the web manifest from
   * `site-branding.ts`). It opens a short how-to, which warns that the Home Screen app starts
   * fresh: iOS gives it storage of its own, so no name, pet or seat comes along. Gone once the
   * page runs from the Home Screen, or for good once dismissed.
   */
  import { onMount } from 'svelte'

  import { readStored, writeStored } from '../lib/session'

  const DISMISSED_KEY = 'jbi:home-screen-hint'

  let wanted = $state(false)

  onMount(() => {
    const iPhone = /iPhone|iPod/.test(navigator.userAgent)
    const capable = typeof document.documentElement.requestFullscreen === 'function'
    const installed =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    wanted = iPhone && !capable && !installed && readStored(DISMISSED_KEY) === null
  })

  function dismiss(): void {
    writeStored(DISMISSED_KEY, '1')
    wanted = false
  }
</script>

{#if wanted}
  <div class="hint">
    <details>
      <summary>Full screen: add to Home Screen</summary>
      <p>
        Tap Share, then Add to Home Screen, and open the game from there. It starts fresh: rejoin
        with the room code.
      </p>
    </details>
    <button type="button" class="link" aria-label="Don't show this again" onclick={dismiss}>
      ×
    </button>
  </div>
{/if}

<style>
  .hint {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    color: var(--muted);
    font-size: 0.9rem;
  }

  summary {
    cursor: pointer;
  }

  p {
    margin: 0.3rem 0 0;
    max-width: 22rem;
  }

  button {
    min-height: 0;
    padding: 0 0.2rem;
    line-height: 1.2;
  }
</style>
