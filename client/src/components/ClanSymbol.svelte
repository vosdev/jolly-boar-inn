<script lang="ts">
  /**
   * An elven clan's symbol on Prifddinas's wall: the wiki's own, at whatever size the wall
   * gives it, or a flat mark in its place when it was not fetched. The mark's colours are SVG
   * attributes rather than styles, which `style-src 'self'` would refuse.
   */
  import { type Clan, symbolFile } from '../lib/clans'

  let { clan }: { clan: Clan } = $props()

  const symbol = $derived(symbolFile(clan.id))
</script>

{#if symbol !== null}
  <img class="symbol" src={symbol} alt="" draggable="false" data-clan={clan.id} />
{:else}
  <svg class="symbol" viewBox="-24 -24 48 48" focusable="false" data-clan={clan.id}>
    {#each clan.mark as part, index (index)}
      <path
        d={part.d}
        fill={part.fill ?? 'none'}
        stroke={part.stroke}
        stroke-width={part.width}
        stroke-linecap="round"
      />
    {/each}
  </svg>
{/if}

<style>
  /* Fitted inside the wall's box whatever its shape, some symbols being twice as tall as wide,
     and lit from behind like the city's crystal so the black of it stands off the grass. */
  .symbol {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 6px rgb(230 251 255 / 0.85))
      drop-shadow(0 0 18px rgb(150 230 240 / 0.45));
  }
</style>
