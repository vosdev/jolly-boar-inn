<script lang="ts">
  /**
   * The wait for a room's first frame, in a popup rather than a panel that a lobby then
   * replaces. It waits out the first moments, since a room made a second ago answers
   * before a player could read it and a popup that blinks is the flash this avoids.
   * Nothing dismisses it: there is nothing to go back to but the page behind.
   */
  import { onMount } from 'svelte'

  const DELAY_MS = 400

  let dialog = $state<HTMLDialogElement | null>(null)
  let shown = $state(false)

  onMount(() => {
    const timer = setTimeout(() => {
      shown = true
      dialog?.showModal()
    }, DELAY_MS)
    return () => {
      clearTimeout(timer)
      dialog?.close()
    }
  })
</script>

<dialog
  bind:this={dialog}
  class="connecting"
  aria-label="Connecting"
  oncancel={(event) => event.preventDefault()}
>
  {#if shown}<p>Connecting…</p>{/if}
</dialog>

<style>
  .connecting {
    padding: 1.25rem 2rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .connecting::backdrop {
    background: var(--scrim);
  }

  .connecting p {
    margin: 0;
  }
</style>
