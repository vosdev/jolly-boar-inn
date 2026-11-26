<script lang="ts">
  /**
   * A suggestion's map picker, with a button that opens it full screen in a modal `<dialog>`,
   * since a place is hard to find and box on a map a column wide. The big map is a map of its
   * own on the same data, so a tap or drag there moves what the small one shows; `controls`,
   * the picker's hint and checkboxes, stand under both, the big one's only while it is open so
   * the page never holds two of each.
   */
  import type { Snippet } from 'svelte'

  import type { MapBounds, WorldPoint } from '../../lib/map'
  import Icon from '../Icon.svelte'
  import MapView, { type MapArea, type MapGrip } from '../map/MapView.svelte'

  let {
    areas,
    grips,
    frame,
    focus = null,
    icons = false,
    labels = false,
    controls = undefined,
    onpick,
    ongrip,
  }: {
    areas: readonly MapArea[]
    grips: readonly MapGrip[]
    frame: MapBounds | null
    /** What the full-screen map opens on: what is picked so far, or the whole map. */
    focus?: MapBounds | null
    icons?: boolean
    labels?: boolean
    controls?: Snippet
    onpick: (tile: WorldPoint) => void
    ongrip: (id: string, tile: WorldPoint) => void
  } = $props()

  const id = $props.id()
  let dialog = $state<HTMLDialogElement | null>(null)
  let big = $state(false)
  let opening = $state<MapBounds | undefined>(undefined)

  function open(): void {
    opening = focus ?? undefined
    big = true
    dialog?.showModal()
  }

  function close(): void {
    dialog?.close()
    big = false
  }
</script>

<div class="map">
  <MapView {areas} {grips} {frame} {icons} {labels} {onpick} {ongrip} />
  <button
    type="button"
    class="expand"
    aria-label="Full screen map"
    title="Full screen"
    onclick={open}
  >
    <Icon name="expand" />
  </button>
</div>
{@render controls?.()}

<dialog bind:this={dialog} class="full" aria-labelledby="{id}-title" onclose={() => (big = false)}>
  <div class="head">
    <h2 id="{id}-title">Find it on the map</h2>
    <button type="button" onclick={close}>Close</button>
  </div>
  {#if big}
    <div class="big">
      <MapView {areas} {grips} {frame} {opening} {icons} {labels} {onpick} {ongrip} />
    </div>
    {@render controls?.()}
  {/if}
</dialog>

<style>
  .map {
    position: relative;
    height: min(24rem, 60vh);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    overflow: hidden;
  }

  /* Top left, clear of Leaflet's zoom buttons on the right. */
  .expand {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1000;
    display: grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    padding: 0;
  }

  .full {
    width: calc(100vw - 2rem);
    max-width: none;
    height: calc(100dvh - 2rem);
    max-height: none;
    padding: 0.75rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .full[open] {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .full::backdrop {
    background: var(--scrim);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .head h2 {
    margin: 0;
  }

  .big {
    flex: 1;
    min-height: 0;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    overflow: hidden;
  }
</style>
