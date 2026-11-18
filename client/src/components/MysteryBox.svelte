<script lang="ts" module>
  /** How long one box takes to shake, burst and show its item, after its delay. */
  export const BOX_OPEN_MS = 1100
  /** The beat between one row's box and the next one down. */
  export const BOX_BEAT_MS = 150
</script>

<script lang="ts">
  /**
   * A Mystery Box on the standings that shakes, bursts and opens into the item found in it.
   * Nothing shows until `opening`; `instant` shows it open, for reduced motion and for a
   * screen that missed the drop.
   */
  import { MYSTERY_BOX_ICON } from '../lib/heldItems'
  import ItemIcon from './ItemIcon.svelte'
  import PixelArt from './PixelArt.svelte'

  let {
    item,
    charges = null,
    opening,
    delay = 0,
    instant = false,
    size = 28,
  }: {
    item: string
    charges?: number | null
    opening: boolean
    /** Milliseconds after `opening` that this box starts. */
    delay?: number
    instant?: boolean
    size?: number
  } = $props()
</script>

{#if opening || instant}
  <span
    class="mystery-box"
    class:instant
    style:--delay="{delay}ms"
    style:--size="{size}px"
    data-opened={instant ? 'instant' : 'animated'}
  >
    {#if !instant}
      <span class="box" aria-hidden="true">
        {#if MYSTERY_BOX_ICON !== null}
          <PixelArt src={MYSTERY_BOX_ICON} {size} />
        {:else}
          <span class="square"></span>
        {/if}
      </span>
      <span class="rays" aria-hidden="true"></span>
    {/if}
    <span class="found"><ItemIcon id={item} {charges} {size} /></span>
  </span>
{/if}

<style>
  .mystery-box {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    vertical-align: middle;
  }

  .mystery-box > * {
    grid-area: 1 / 1;
  }

  .box {
    display: inline-flex;
    opacity: 0;
    animation:
      box-in 150ms ease-out var(--delay) forwards,
      shake 600ms ease-in-out calc(var(--delay) + 150ms),
      box-out 200ms ease-in calc(var(--delay) + 800ms) forwards;
  }

  .square {
    width: 70%;
    height: 70%;
    border: 2px solid var(--ink);
    border-radius: 3px;
    background: var(--accent);
  }

  .rays {
    width: 160%;
    height: 160%;
    border-radius: 50%;
    background: radial-gradient(circle, var(--accent) 0 30%, transparent 65%);
    opacity: 0;
    animation: burst 450ms ease-out calc(var(--delay) + 800ms);
  }

  .found {
    display: inline-flex;
    opacity: 0;
    animation: found 300ms ease-out calc(var(--delay) + 850ms) forwards;
  }

  .instant .found {
    opacity: 1;
    animation: none;
  }

  @keyframes box-in {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes shake {
    0%,
    100% {
      transform: none;
    }
    20%,
    60% {
      transform: rotate(-12deg);
    }
    40%,
    80% {
      transform: rotate(12deg);
    }
  }

  @keyframes box-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: scale(1.4);
    }
  }

  @keyframes burst {
    from {
      opacity: 0.8;
      transform: scale(0.3);
    }
    to {
      opacity: 0;
      transform: scale(1);
    }
  }

  @keyframes found {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .box,
    .rays {
      display: none;
    }

    .found {
      opacity: 1;
      animation: none;
    }
  }
</style>
