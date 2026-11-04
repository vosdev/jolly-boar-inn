<script lang="ts">
  /**
   * An item's inventory icon in a square box `size` pixels on a side, or nothing at all for
   * an item with no file, so its name stands alone with no gap.
   *
   * Icons are about 36 pixels of pixel art, which `PixelArt` fits as it does a pet. The alt
   * is empty: the item's name is always beside it.
   */
  import { itemIcon } from '../../lib/items'
  import PixelArt from '../PixelArt.svelte'

  let { asset, size = 72 }: { asset: unknown; size?: number } = $props()

  const url = $derived(itemIcon(asset))
</script>

{#if url !== null}
  <span class="item" data-asset={asset} style:width="{size}px" style:height="{size}px">
    <PixelArt src={url} {size} />
  </span>
{/if}

<style>
  .item {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
  }
</style>
