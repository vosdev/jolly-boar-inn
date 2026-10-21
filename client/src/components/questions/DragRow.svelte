<script lang="ts">
  /**
   * One option that can be dragged: its gem, and a handle to the right that is the row's
   * control for the keyboard and a screen reader. A mouse may take the row anywhere as
   * well. `Dragging` (`drag.svelte.ts`) does the moving; this draws it, lifted and
   * following the pointer, sideways too when `free`.
   */
  import type { Snippet } from 'svelte'

  import type { Dragging } from './drag.svelte'
  import GemButton, { type Gem } from './GemButton.svelte'

  let {
    dragging,
    shown,
    name,
    gem,
    movable,
    said = '',
    free = false,
    extra,
    children,
  }: {
    dragging: Dragging
    /** The option's shown position, which the handle is found by. */
    shown: number
    /** What the handle moves, for its label. */
    name: string
    gem: Gem | null
    movable: boolean
    /** What a screen reader hears after the label, such as its place. */
    said?: string
    /** Follows the pointer sideways as well as up and down. */
    free?: boolean
    /** Something pressable before the handle, such as a button that sends it back. */
    extra?: Snippet
    children: Snippet
  } = $props()

  const drag = $derived(dragging.drag?.shown === shown ? dragging.drag : null)
</script>

<div
  class="row"
  role="presentation"
  class:movable
  class:lifted={dragging.lifted?.shown === shown}
  class:dragged={drag !== null}
  style:translate={drag === null ? undefined : `${free ? drag.dx : 0}px ${drag.dy}px`}
  onpointerdown={(event) => dragging.grab(event, shown)}
  onpointermove={(event) => dragging.follow(event)}
  onpointerup={(event) => dragging.release(event)}
  onpointercancel={() => dragging.letGo()}
>
  <GemButton tag="div" {gem} status="idle" {said}>
    {@render children()}
    {#snippet end()}
      {@render extra?.()}
      {#if movable}
        <button
          type="button"
          class="handle"
          data-handle={shown}
          aria-label="Move {name}"
          onkeydown={(event) => dragging.key(event, shown)}
          onblur={(event) => dragging.blur(event, shown)}>⠿</button
        >
      {/if}
    {/snippet}
  </GemButton>
</div>

<style>
  .row {
    position: relative;
  }

  /* Picked up: the theme's shadow alone is too faint to say so. */
  .lifted,
  .dragged {
    z-index: 1;
    scale: 1.03;
    box-shadow: var(--shadow);
    border-radius: min(var(--radius), 8px);
  }

  .handle {
    width: 2.5rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font-size: 1.25rem;
    cursor: grab;
    /* The handle drags; the rest of the row still scrolls the page under a thumb. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .row.movable {
    user-select: none;
    -webkit-user-select: none;
  }

  @media (pointer: fine) {
    .row.movable {
      cursor: grab;
    }
  }

  .dragged,
  .dragged .handle {
    cursor: grabbing;
  }
</style>
