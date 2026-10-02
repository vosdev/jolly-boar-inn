<script lang="ts">
  /**
   * One chat head, cut from the sheet `heads-sprite.ts` builds (section 5.2).
   *
   * A window onto the whole sheet rather than a CSS background: the sheet is an `<img>`
   * scaled so one cell is `size` pixels, and shifted so the right cell sits in the
   * window. That keeps the sheet's URL out of any stylesheet — it is a hashed asset in a
   * build and a data URL in dev — and keeps every style here a matter of layout.
   *
   * 32px in the top bar and the lobby, 48px on the standings. The sheet's cells are
   * 16px, so both are whole multiples and `pixelated` gives hard pixel edges instead of
   * the smear a smoothing filter makes of art this small.
   */
  import { cell, columns, sprite } from 'virtual:heads'

  import { headName } from '../lib/heads'

  let {
    head,
    size = 32,
    label = null,
  }: {
    head: number
    size?: number
    /** Read out instead of the head's name. Empty for a head beside a name that says it
        all, which a screen reader then skips. */
    label?: string | null
  } = $props()

  // Whole pixels per source pixel, so no head is drawn at a size its art cannot hold. A
  // size that is not a multiple of the cell gets the nearest one, centred in the window.
  const scale = $derived(Math.max(1, Math.round(size / cell)))
  const drawn = $derived(cell * scale)
  const inset = $derived((size - drawn) / 2)
  const x = $derived((head % columns) * drawn - inset)
  const y = $derived(Math.floor(head / columns) * drawn - inset)
</script>

<span
  class="head"
  role={label === '' ? undefined : 'img'}
  aria-label={label === '' ? undefined : (label ?? headName(head))}
  aria-hidden={label === '' ? 'true' : undefined}
  style:width="{size}px"
  style:height="{size}px"
>
  <img
    src={sprite}
    alt=""
    draggable="false"
    style:width="{columns * cell * scale}px"
    style:transform="translate({-x}px, {-y}px)"
  />
</span>

<style>
  .head {
    display: inline-block;
    flex: none;
    overflow: hidden;
    position: relative;
    vertical-align: middle;
  }

  .head img {
    position: absolute;
    top: 0;
    left: 0;
    max-width: none;
    height: auto;
    image-rendering: pixelated;
    /* A tap on a face is a tap on whatever it sits in: the chip, a row. */
    pointer-events: none;
    user-select: none;
  }
</style>
