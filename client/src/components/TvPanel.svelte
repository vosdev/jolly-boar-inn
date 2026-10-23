<script lang="ts">
  /**
   * The panel beside the TV's scroll. It takes the height the stage gives it and never
   * asks for more: what is in it is shrunk to fit, so a long reveal or a full room cannot
   * make the stage taller and so smaller (section 16 of ideas/design.md).
   */
  import type { Snippet } from 'svelte'

  let { reveal = false, children }: { reveal?: boolean; children: Snippet } = $props()

  let room = $state<HTMLElement | null>(null)
  let words = $state<HTMLElement | null>(null)
  let shrink = $state(1)

  $effect(() => {
    const box = room
    const inner = words
    if (box === null || inner === null) return
    const fit = (): void => {
      const need = inner.offsetHeight
      shrink = need > box.clientHeight && need > 0 ? box.clientHeight / need : 1
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    watch.observe(inner)
    return () => watch.disconnect()
  })
</script>

<section class="panel tv-panel" class:answers={reveal}>
  <div class="room" bind:this={room}>
    <div class="words" bind:this={words} style:--shrink={shrink}>
      {@render children()}
    </div>
  </div>
</section>

<style>
  .tv-panel {
    position: relative;
    margin-bottom: 0;
  }

  /* Out of the flow, so the panel's height is the stage's and never its words'. Inset by
     the panel's own padding, which an absolute box does not get. */
  .room {
    position: absolute;
    inset: calc(1.25rem - var(--border-give));
  }

  .words {
    width: calc(100% / var(--shrink, 1));
    transform: scale(var(--shrink, 1));
    transform-origin: top left;
  }
</style>
