<script lang="ts">
  /**
   * A switch for full screen on a touch device, where the address bar costs a question
   * screen a good part of its height. It is not there when the browser cannot (iPhones:
   * WebKit offers the API on video only). The switch follows the browser's own state, so
   * leaving by the system gesture flips it back.
   */
  import { onMount } from 'svelte'

  let available = $state(false)
  let on = $state(false)

  function sync(): void {
    on = Boolean(document.fullscreenElement)
  }

  onMount(() => {
    available =
      typeof document.documentElement.requestFullscreen === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  })

  function toggle(): void {
    // Refused when the browser decides so (a permissions policy, say); the switch stays put.
    const done = on ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    done.catch(() => {})
  }
</script>

{#if available}
  <button type="button" role="switch" aria-checked={on} class="full-screen" onclick={toggle}>
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
    Full screen
  </button>
{/if}

<style>
  .full-screen {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
  }

  .track {
    position: relative;
    flex: none;
    width: 2.6rem;
    height: 1.5rem;
    border: var(--border-width) solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    opacity: 0.6;
    transition:
      background-color 150ms ease-out,
      opacity 150ms ease-out;
  }

  .thumb {
    position: absolute;
    top: 50%;
    left: 0.15rem;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--muted);
    transform: translateY(-50%);
    transition:
      left 150ms ease-out,
      background-color 150ms ease-out;
  }

  [aria-checked='true'] .track {
    background: var(--accent);
    opacity: 1;
  }

  [aria-checked='true'] .thumb {
    left: calc(100% - 1.15rem);
    background: var(--panel);
  }

  @media (prefers-reduced-motion: reduce) {
    .track,
    .thumb {
      transition: none;
    }
  }
</style>
