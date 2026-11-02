<script lang="ts">
  /**
   * The world map, on tiles this server holds. Leaflet loads with the first map, so a game
   * without one never fetches it. `bounds` keeps the map to a rectangle of game tiles: nothing
   * outside is requested, the view cannot leave, and a tile that straddles the edge is masked.
   */
  import type { Coords, LatLngBounds, Map as LeafletMap } from 'leaflet'
  import { onMount } from 'svelte'

  import {
    flipRow,
    HIGHEST_ZOOM,
    LOWEST_ZOOM,
    type MapBounds,
    NATIVE_ZOOM,
    PLAY_AREA,
    SURFACE,
    TILE_SIZE,
    tileUrl,
  } from '../../lib/map'

  let { bounds }: { bounds?: MapBounds } = $props()

  let host: HTMLDivElement

  function corners(area: MapBounds): [[number, number], [number, number]] {
    return [
      [area.minY, area.minX],
      [area.maxY, area.maxX],
    ]
  }

  function ring(area: MapBounds): [number, number][] {
    return [
      [area.minY, area.minX],
      [area.minY, area.maxX],
      [area.maxY, area.maxX],
      [area.maxY, area.minX],
    ]
  }

  onMount(() => {
    let map: LeafletMap | undefined
    let observer: ResizeObserver | undefined
    let gone = false

    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(
      ([{ default: L }]) => {
        if (gone) return
        const limit: LatLngBounds = L.latLngBounds(corners(bounds ?? SURFACE))
        const opening = L.latLngBounds(corners(bounds ?? PLAY_AREA))

        const shown = L.map(host, {
          crs: L.CRS.Simple,
          minZoom: LOWEST_ZOOM,
          maxZoom: HIGHEST_ZOOM,
          // Fractional zoom puts every tile on a non-integer scale, which Safari crawls at.
          zoomSnap: 1,
          maxBounds: limit,
          maxBoundsViscosity: 1,
          attributionControl: false,
        })
        map = shown

        const fit = () => shown.setMinZoom(shown.getBoundsZoom(limit))
        fit()
        // A region shows whole. The surface fills the frame, cropping ocean instead of adding it.
        const filled = shown.getBoundsZoom(opening, bounds === undefined)
        shown.setView(opening.getCenter(), filled, { animate: false })

        const tiles = new L.TileLayer('', {
          tileSize: TILE_SIZE,
          minNativeZoom: LOWEST_ZOOM,
          maxNativeZoom: NATIVE_ZOOM,
          minZoom: LOWEST_ZOOM,
          maxZoom: HIGHEST_ZOOM,
          noWrap: true,
          bounds: limit,
        })
        tiles.getTileUrl = (coords: Coords) => tileUrl(coords.z, coords.x, flipRow(coords.y))
        tiles.addTo(shown)

        if (bounds !== undefined) {
          L.polygon([ring(SURFACE), ring(bounds)], {
            className: 'map-outside',
            stroke: false,
            fillOpacity: 1,
            interactive: false,
          }).addTo(shown)
        }

        observer = new ResizeObserver(() => {
          shown.invalidateSize()
          fit()
        })
        observer.observe(host)
      },
    )

    return () => {
      gone = true
      observer?.disconnect()
      map?.remove()
    }
  })
</script>

<div class="map" bind:this={host}></div>

<style>
  .map {
    width: 100%;
    height: 100%;
  }

  /* A tile that would be all black is not on disk, and everything outside `bounds` is black too. */
  .map:global(.leaflet-container) {
    background: var(--map-void);
  }

  .map :global(.map-outside) {
    fill: var(--map-void);
  }

  .map :global(.leaflet-tile) {
    image-rendering: pixelated;
  }
</style>
