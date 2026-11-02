<script lang="ts">
  /** The world map with nothing on it, to look at under `pnpm dev`: no player has one yet. */
  import MapView from '../components/map/MapView.svelte'
  import type { MapBounds } from '../lib/map'

  const REGIONS: Record<string, MapBounds | undefined> = {
    Surface: undefined,
    Karamja: { minX: 2704, maxX: 3008, minY: 2864, maxY: 3200 },
    Varrock: { minX: 3170, maxX: 3300, minY: 3370, maxY: 3510 },
  }

  let region = $state('Surface')
</script>

<section class="dev-map">
  <select bind:value={region} aria-label="Region">
    {#each Object.keys(REGIONS) as name (name)}
      <option>{name}</option>
    {/each}
  </select>
  <div class="frame">
    {#key region}
      <MapView bounds={REGIONS[region]} />
    {/key}
  </div>
</section>

<style>
  .dev-map {
    display: grid;
    gap: var(--space-2, 0.5rem);
  }

  .frame {
    height: 70vh;
  }
</style>
