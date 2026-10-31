<script lang="ts">
  /**
   * A switch for full screen on a touch device, where the address bar costs a question
   * screen a good part of its height. It is not there when the browser cannot (iPhones:
   * WebKit offers the API on video only). The switch follows the browser's own state, so
   * leaving by the system gesture flips it back.
   *
   * A room drawn below scale 1 (`short`) is one a laptop's window is too short for: the
   * switch is offered there with a mouse too, with a line saying why.
   */
  import { onMount } from 'svelte'
  import Switch from './Switch.svelte'

  let { short = false }: { short?: boolean } = $props()

  let capable = $state(false)
  let touch = $state(false)
  let on = $state(false)
  const available = $derived(capable && (touch || short))

  function sync(): void {
    on = Boolean(document.fullscreenElement)
  }

  onMount(() => {
    capable = typeof document.documentElement.requestFullscreen === 'function'
    touch = window.matchMedia('(pointer: coarse)').matches
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
  {#if short}
    <p class="short">Your screen seems a bit small. We recommend using full screen for a better experience.</p>
  {/if}
{/if}

<style>
  .short {
    flex-basis: 100%;
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
