<script lang="ts">
  /**
   * Pixel art fitted into a square box `size` pixels on a side, centred by its container.
   *
   * The art comes in every shape, so the box is the contract. A picture smaller than the box
   * is drawn at a whole number of screen pixels per art pixel with hard edges, since a
   * smoothing filter smears art this small; a bigger one is scaled down smoothly, since
   * nearest-neighbour shrinking tears it. Until the file has loaded its size is unknown and
   * the picture fills what it can, including after `src` changes to a new one.
   */
  let { src, size }: { src: string; size: number } = $props()

  // Forgotten with each new `src`, so a new picture is never drawn at the last one's size.
  let natural = $derived.by((): { w: number; h: number } | null => {
    void src
    return null
  })

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

<img
  {src}
  alt=""
  draggable="false"
  class:crisp={fit?.crisp}
  style:width={fit === null ? undefined : `${fit.w}px`}
  style:height={fit === null ? undefined : `${fit.h}px`}
  onload={loaded}
/>

<style>
  img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    /* A tap on the art is a tap on whatever it sits in: the chip, a row, a grid cell. */
    pointer-events: none;
    user-select: none;
  }

  img.crisp {
    image-rendering: pixelated;
  }
</style>
