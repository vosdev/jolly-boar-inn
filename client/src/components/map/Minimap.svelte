<script lang="ts">
  /**
   * A minimap in the game's ring, with the player's dot in the middle and the
   * game's compass, turned so its N points where north is on the picture: a question's baked
   * picture by its file, or for `/suggest` the same circle drawn from the tiles round a spot and
   * turned in the browser, so the preview is what players will see. It scales to its container's
   * width and keeps the map's pixels sharp. Nothing over the picture is baked, so restyling the
   * frame bakes nothing again.
   */
  import compass from '../../assets/sprites/compass.svg'
  import ring from '../../assets/sprites/minimap-ring.svg'
  import { MINIMAP_SIDE, minimapTiles, type MinimapSpot, TURNABLE } from '../../lib/minimap'

  let {
    src = null,
    spot = null,
    label = 'A minimap',
    north = null,
  }: {
    /** The baked picture's URL. */
    src?: string | null
    /** A spot to draw from the tiles, when there is no picture. */
    spot?: MinimapSpot | null
    label?: string
    /** Degrees clockwise from the top that north points, for the compass; none without one. */
    north?: number | null
  } = $props()

  const pointing = $derived(north ?? spot?.angle ?? null)

  // Where the game draws them, in its pixels: the ring is 6 px round the 152 px map, and the
  // compass's 43 px stand 17 px left of the ring and 1 px above it.
  const RING_SIDE = MINIMAP_SIDE + 12
  const COMPASS = { side: 43, left: -17, top: -1 }
  const share = (px: number) => `${(100 * px) / RING_SIDE}%`

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

<span class="framed">
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
  </span>
  <img class="ring" src={ring} alt="" width={RING_SIDE} height={RING_SIDE} />
  {#if pointing !== null}
    <span
      class="compass"
      style:left={share(COMPASS.left)}
      style:top={share(COMPASS.top)}
      style:width={share(COMPASS.side)}
      style:height={share(COMPASS.side)}
    >
      <img
        src={compass}
        alt=""
        width={COMPASS.side}
        height={COMPASS.side}
        style:transform="rotate({pointing}deg)"
      />
    </span>
  {/if}
</span>

<style>
  /* The game's ring round the map, and its compass on the ring at the top left. */
  /* The compass reaches 17 px left of the ring, so the ring leaves it that room in its box.
     Padding counts in the box's width, the ring's 164 px and the overhang's 17. */
  .framed {
    position: relative;
    display: block;
    width: calc(100% * 164 / 181);
    margin-left: calc(100% * 17 / 181);
    padding: calc(100% * 6 / 181);
  }

  .ring,
  .compass {
    position: absolute;
    pointer-events: none;
  }

  /* The sprite's round edge is a staircase of its outline pixels: the dial is cut just inside
     them, and a smooth outline in their colour drawn over the cut. */
  .compass img {
    display: block;
    width: 100%;
    height: 100%;
    clip-path: circle(46%);
  }

  .compass::after {
    content: '';
    position: absolute;
    inset: 4%;
    border: calc(100% * 1.2 / 43) solid var(--minimap-edge);
    border-radius: 50%;
  }

  .ring {
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .minimap {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 50%;
    background: var(--map-void);
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
