<script lang="ts">
  /**
   * A minimap in its ring, with the player's dot in the middle: a question's baked picture by
   * its file, or for `/suggest` the same circle drawn from the tiles round a spot and turned in
   * the browser, so the preview is what players will see. It scales to its container's width
   * and keeps the map's pixels sharp.
   */
  import { MINIMAP_SIDE, minimapTiles, type MinimapSpot, TURNABLE } from '../../lib/minimap'

  let {
    src = null,
    spot = null,
    label = 'A minimap',
  }: {
    /** The baked picture's URL. */
    src?: string | null
    /** A spot to draw from the tiles, when there is no picture. */
    spot?: MinimapSpot | null
    label?: string
  } = $props()

  const loaded = new Map<string, HTMLImageElement | null>()

  /** Paints the square round the spot, leaving the map's void where a tile is missing, as the baker does. */
  function paint(canvas: HTMLCanvasElement, x: number, y: number): () => void {
    const context = canvas.getContext('2d')
    if (context === null) return () => {}
    let live = true
    const tiles = minimapTiles({ x, y })
    const draw = () => {
      if (!live) return
      context.clearRect(0, 0, TURNABLE, TURNABLE)
      for (const tile of tiles) {
        const image = loaded.get(tile.url)
        if (image) context.drawImage(image, tile.left, tile.top)
      }
    }
    draw()
    for (const tile of tiles) {
      if (loaded.has(tile.url)) continue
      const image = new Image()
      image.onload = () => {
        loaded.set(tile.url, image)
        draw()
      }
      image.onerror = () => loaded.set(tile.url, null)
      image.src = tile.url
    }
    return () => {
      live = false
    }
  }
</script>

<span class="minimap" role="img" aria-label={label} style:--wide={TURNABLE / MINIMAP_SIDE}>
  {#if src !== null}
    <img class="baked" {src} alt="" width={MINIMAP_SIDE} height={MINIMAP_SIDE} />
  {:else if spot !== null}
    {@const { x, y } = spot}
    <canvas
      class="drawn"
      width={TURNABLE}
      height={TURNABLE}
      style:transform="rotate({spot.angle}deg)"
      {@attach (canvas) => paint(canvas, x, y)}
    ></canvas>
  {:else}
    <span class="missing">This minimap is missing on this server.</span>
  {/if}
  <span class="dot" aria-hidden="true"></span>
  <span class="ring" aria-hidden="true"></span>
</span>

<style>
  .minimap {
    position: relative;
    display: block;
    container-type: inline-size;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 50%;
    background: var(--map-void);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.45);
  }

  .baked,
  .drawn {
    position: absolute;
    image-rendering: pixelated;
  }

  .baked {
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* The square is wider than the circle by the same share on each side, and turns on its middle. */
  .drawn {
    top: calc(50% - 50% * var(--wide));
    left: calc(50% - 50% * var(--wide));
    width: calc(100% * var(--wide));
    height: calc(100% * var(--wide));
  }

  /* One game tile, white, as the game marks the player. */
  .dot {
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(100% / 38);
    height: calc(100% / 38);
    transform: translate(-50%, -50%);
    background: var(--minimap-dot);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6);
  }

  /* Drawn over the picture, so restyling it bakes nothing again. */
  .ring {
    --ring: max(3px, 4cqw);
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow:
      inset 0 0 0 var(--ring) var(--frame),
      inset 0 0 0 calc(var(--ring) + 1px) var(--frame-dark);
    pointer-events: none;
  }

  .missing {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 18%;
    color: var(--bg-muted);
    font-size: 0.85rem;
    text-align: center;
  }
</style>
