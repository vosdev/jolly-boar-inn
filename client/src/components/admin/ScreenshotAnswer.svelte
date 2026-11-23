<script lang="ts">
  /**
   * A pack question's screenshot for the operator, with a `picture_pin`'s answer drawn on it:
   * the target box, or the target cells of its grid. A `map_pin`'s answer is a place on the
   * map, named under it in the answer row.
   */
  import type { Cell, Grid } from '../../lib/picturePins'
  import { pictureUrl } from '../../lib/pictures'
  import type { WireBounds } from '../../lib/pins'

  let { file, payload }: { file: string; payload: Record<string, unknown> } = $props()

  const target = $derived(payload.target as WireBounds | undefined)
  const grid = $derived(payload.grid as Grid | undefined)
  const cells = $derived((payload.cells as Cell[] | undefined) ?? [])
  const pct = (fraction: number): string => `${fraction * 100}%`
</script>

<div class="shot">
  <img src={pictureUrl(file)} alt="The question's screenshot" />
  {#if target !== undefined}
    <span
      class="mark"
      style:left={pct(target.min_x)}
      style:top={pct(target.min_y)}
      style:width={pct(target.max_x - target.min_x)}
      style:height={pct(target.max_y - target.min_y)}
    ></span>
  {/if}
  {#if grid !== undefined}
    {#each cells as cell (`${cell.col}:${cell.row}`)}
      <span
        class="mark"
        style:left={pct(cell.col / grid.cols)}
        style:top={pct(cell.row / grid.rows)}
        style:width={pct(1 / grid.cols)}
        style:height={pct(1 / grid.rows)}
      ></span>
    {/each}
  {/if}
</div>

<style>
  .shot {
    position: relative;
    margin: 0.5rem 0;
    max-width: 32rem;
  }

  img {
    display: block;
    width: 100%;
    border-radius: min(var(--radius), 6px);
  }

  .mark {
    position: absolute;
    box-sizing: border-box;
    border: 3px solid var(--ok);
    background: color-mix(in srgb, var(--ok) 25%, transparent);
  }
</style>
