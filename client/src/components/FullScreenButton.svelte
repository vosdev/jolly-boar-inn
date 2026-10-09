<script lang="ts">
  /**
   * Asks the browser for full screen on a touch device, where the address bar costs a
   * question screen a good part of its height. It is not there when the browser cannot
   * (iPhones: WebKit offers the API on video only), nor once full screen is on; leaving
   * is the system's own gesture, so there is no second state to draw.
   */
  import { onMount } from 'svelte'

  let available = $state(false)
  let active = $state(false)

  function sync(): void {
    active = Boolean(document.fullscreenElement)
  }

  onMount(() => {
    available =
      typeof document.documentElement.requestFullscreen === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  })

  function enter(): void {
    // Refused when the browser decides so (a permissions policy, say); the button stays.
    document.documentElement.requestFullscreen().catch(() => {})
  }
</script>

{#if available && !active}
  <button type="button" class="full-screen" onclick={enter}>⛶ Full screen</button>
{/if}

<style>
  .full-screen {
    min-height: 44px;
  }
</style>
