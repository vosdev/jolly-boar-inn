<script lang="ts">
  /**
   * A found item's inventory icon in a square box, its name the alt text and the tooltip.
   * Game art is not committed, so without its file the item's short name stands in.
   */
  import { heldIcon, itemName, itemShort } from '../lib/heldItems'
  import PixelArt from './PixelArt.svelte'

  let {
    id,
    charges = null,
    size = 32,
    label = null,
  }: {
    id: string
    charges?: number | null
    size?: number
    /** Read out instead of the item's name; empty beside words that already name it. */
    label?: string | null
  } = $props()

  const name = $derived(itemName(id, charges))
  const src = $derived(heldIcon(id, charges))
</script>

<span
  class="item-icon"
  data-item={id}
  title={name}
  role={label === '' ? undefined : 'img'}
  aria-label={label === '' ? undefined : (label ?? name)}
  aria-hidden={label === '' ? 'true' : undefined}
  style:width="{size}px"
  style:height="{size}px"
>
  {#if src !== null}
    <PixelArt {src} {size} />
  {:else}
    <span class="short">{itemShort(id)}</span>
  {/if}
</span>

<style>
  .item-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
  }

  .short {
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    overflow-wrap: anywhere;
  }
</style>
