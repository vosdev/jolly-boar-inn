<script lang="ts">
  /**
   * A switch for full screen on a touch device, where the address bar costs a question
   * screen a good part of its height. It is not there when the browser cannot (iPhones:
   * WebKit offers the API on video only). The switch follows the browser's own state, so
   * leaving by the system gesture flips it back.
   */
  import { onMount } from 'svelte'
  import Switch from './Switch.svelte'

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
  <Switch label="Full screen" checked={on} onclick={toggle} />
{/if}
