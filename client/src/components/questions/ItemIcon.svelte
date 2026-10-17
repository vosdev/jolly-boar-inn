<script lang="ts">
  /**
   * An item's inventory icon in a square box `size` pixels on a side, or nothing at all for
   * an item with no file, so its name stands alone with no gap.
   *
   * Icons are about 36 pixels of pixel art, so one smaller than the box is drawn at a whole
   * number of screen pixels per art pixel with hard edges, as `Pet` draws a pet. Until the
   * file has loaded the box holds its place. The alt is empty: the item's name is always
   * beside it.
   */
  import { itemIcon } from '../../lib/items'

  let { asset, size = 72 }: { asset: unknown; size?: number } = $props()

  const url = $derived(itemIcon(asset))

  let natural = $state<{ w: number; h: number } | null>(null)

  const fit = $derived.by(() => {
    if (natural === null || natural.w === 0 || natural.h === 0) return null
    const ratio = Math.min(size / natural.w, size / natural.h)
    const scale = ratio >= 1 ? Math.floor(ratio) : ratio
    return { w: natural.w * scale, h: natural.h * scale, crisp: ratio >= 1 }
  })

  function loaded(event: Event): void {
    const img = event.currentTarget as HTMLImageElement
    natural = { w: img.naturalWidth, h: img.naturalHeight }
  }
</script>

{#if url !== null}
  <span class="item" data-asset={asset} style:width="{size}px" style:height="{size}px">
    <img
      src={url}
      alt=""
      draggable="false"
      class:crisp={fit?.crisp}
      style:width={fit === null ? undefined : `${fit.w}px`}
      style:height={fit === null ? undefined : `${fit.h}px`}
      onload={loaded}
    />
  </span>
{/if}

<style>
  .item {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
  }

  .item img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    pointer-events: none;
    user-select: none;
  }

  .item img.crisp {
    image-rendering: pixelated;
  }
</style>
