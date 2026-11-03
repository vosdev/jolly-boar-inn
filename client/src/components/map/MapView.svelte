<script lang="ts">
  /**
   * The world map, on tiles this server holds. Leaflet loads with the first map, so a game
   * without one never fetches it. `bounds` keeps the map to a rectangle of game tiles: nothing
   * outside is requested, the view cannot leave, and a tile that straddles the edge is masked.
   *
   * A `keep` view hands its map on to a `keep` view mounting in the same turn, which takes it
   * over as it stands rather than building one and loading its tiles again: a question's map
   * stays up into its reveal and into the next map question. What stood on it fades with the
   * old words, and the view glides to the new `frame`, or for a `fresh` view, a new question,
   * to the opening.
   *
   * What stands on the map comes in as data: `markers`, `lines` and `areas`. Each change redraws
   * its whole layer, since a reveal sets them once and a player moves one pin at a time. `grips`
   * are the exception: they follow a box while one of them is dragged, and redrawing a marker
   * would drop it from under the finger, so they keep their markers and only move. Marker
   * labels are found a place after every zoom (`lib/mapLabels.ts`), in `markers`' order. `frame`
   * moves the view to a rectangle, leaving `inset` pixels clear of what lies over the map.
   */
  import type {
    CircleMarker,
    Coords,
    LatLngBounds,
    Layer,
    LayerGroup,
    LeafletMouseEvent,
    Map as LeafletMap,
    Marker,
  } from 'leaflet'
  import { onMount, untrack } from 'svelte'

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
    toLatLng,
    toWorld,
    type WorldPoint,
  } from '../../lib/map'
  import { reducedMotion } from '../../lib/interlude'
  import { reachLine } from '../../lib/mapBox'
  import { placeLabels, type PinLabel } from '../../lib/mapLabels'
  import { canvasIn, handOn, type Held, takeOver } from '../../lib/keptMap'
  import { WORDS_OUT_MS } from '../../lib/stageMoves'

  export interface MapMarker {
    id: string
    at: WorldPoint
    /** The pet that stands on the pin. */
    art: string
    title?: string
    detail?: string
    tone?: 'you' | 'far'
    size?: 'small' | 'big'
    /** Can be dragged, which `onmove` hears. */
    movable?: boolean
  }

  export interface MapLine {
    from: WorldPoint
    to: WorldPoint
    faint?: boolean
  }

  export interface MapArea {
    /** A box of tiles, both edges inside it. Too small to see, a ring marks it instead. */
    box: MapBounds
    name: string
    /** Draws the line this many tiles out from the box. */
    reach?: number
  }

  export interface MapGrip {
    id: string
    at: WorldPoint
    /** The middle of what it moves, not a corner. */
    middle?: boolean
    title: string
  }

  const SMALLEST_RING = 13
  /** How long a taken-over map glides to a new question's opening, in seconds. */
  const GLIDE_S = 1

  let {
    bounds,
    opening: opensOn,
    keep = false,
    fresh = false,
    markers = [],
    lines = [],
    areas = [],
    grips = [],
    frame = null,
    inset = { top: 24, right: 24, bottom: 24, left: 24 },
    onpick,
    onmove,
    ontap,
    ongrip,
  }: {
    bounds?: MapBounds
    /** Where the map opens, whole, without keeping the player there. */
    opening?: MapBounds
    /** Hands the map on, and takes one over, rather than building it each time. */
    keep?: boolean
    /** A new question on a map taken over: glide to the opening. */
    fresh?: boolean
    markers?: readonly MapMarker[]
    lines?: readonly MapLine[]
    areas?: readonly MapArea[]
    grips?: readonly MapGrip[]
    /** Where the view should be; null leaves it to the player. */
    frame?: MapBounds | null
    inset?: { top: number; right: number; bottom: number; left: number }
    /** A tap on the map, or Enter on its middle. */
    onpick?: (tile: WorldPoint) => void
    onmove?: (id: string, tile: WorldPoint) => void
    /** A tap on a marker. */
    ontap?: (id: string) => void
    /** A grip dragged, as it goes. */
    ongrip?: (id: string, tile: WorldPoint) => void
  } = $props()

  let host: HTMLDivElement
  /** The Leaflet module and map, once they have loaded and the frame has a size. */
  let live = $state.raw<{
    L: typeof import('leaflet')
    map: LeafletMap
    pins: LayerGroup
    drawing: LayerGroup
    handles: LayerGroup
  } | null>(null)
  let marks: { box: MapBounds; ring: CircleMarker; tag: HTMLElement }[] = []
  const held = new Map<string, Marker>()
  let dragged: string | null = null
  let framed = false
  /** A map taken over glides into its first frame, rather than jumping to it. */
  let gliding = false

  function tagFor(marker: MapMarker): HTMLElement | null {
    if (marker.title === undefined) return null
    const tag = document.createElement('span')
    tag.className = 'pin-tag'
    const title = document.createElement('b')
    title.textContent = marker.title
    tag.append(title, marker.detail ?? '')
    return tag
  }

  function pinElement(marker: MapMarker): HTMLElement {
    const pin = document.createElement('div')
    pin.className = ['pin', marker.tone, marker.size].filter(Boolean).join(' ')
    pin.dataset.id = marker.id
    const art = document.createElement('img')
    art.src = marker.art
    art.alt = ''
    art.draggable = false
    const dot = document.createElement('i')
    pin.append(art, dot)
    const tag = tagFor(marker)
    if (tag !== null) pin.append(tag)
    return pin
  }

  function gripElement(grip: MapGrip): HTMLElement {
    const shape = document.createElement('div')
    shape.className = grip.middle === true ? 'grip middle' : 'grip'
    return shape
  }

  /** Back on its place in the box, which a drag past an edge leaves behind. */
  function settleGrip(id: string, marker: Marker): void {
    const grip = grips.find((one) => one.id === id)
    if (grip !== undefined) marker.setLatLng(toLatLng(grip.at))
  }

  /** The labels' sides for this zoom, and the rings' sizes, which a zoom changes. */
  function settle(): void {
    if (live === null) return
    const { map } = live
    host.dataset.zoom = String(map.getZoom())
    const scale = 2 ** map.getZoom()
    for (const { box, ring, tag } of marks) {
      const tall = (box.maxY - box.minY + 1) * scale
      const wide = (box.maxX - box.minX + 1) * scale
      const shown = Math.max(tall, wide) >= SMALLEST_RING * 2
      ring.getElement()?.classList.toggle('gone', shown)
      tag.style.setProperty('--ring', `${shown ? tall / 2 : SMALLEST_RING}px`)
    }
    const pins = [...host.querySelectorAll<HTMLElement>('.pin')]
    const tagged = new Map(pins.map((pin) => [pin.dataset.id ?? '', pin]))
    const size = map.getSize()
    const labels: PinLabel[] = markers.flatMap((marker) => {
      const pin = tagged.get(marker.id)
      const tag = pin?.querySelector<HTMLElement>('.pin-tag')
      if (pin === undefined || tag === undefined || tag === null) return []
      const at = map.latLngToContainerPoint(toLatLng(marker.at))
      const art = pin.querySelector('img')
      return [
        {
          id: marker.id,
          x: at.x,
          y: at.y,
          width: tag.offsetWidth,
          height: tag.offsetHeight,
          pet: art?.offsetWidth ?? 0,
        },
      ]
    })
    const spots = placeLabels(labels, { width: size.x, height: size.y })
    for (const [id, spot] of spots) {
      const tag = tagged.get(id)?.querySelector<HTMLElement>('.pin-tag')
      if (tag === undefined || tag === null) continue
      tag.hidden = spot === null
      tag.dataset.spot = spot ?? ''
    }
  }

  $effect(() => {
    if (live === null) return
    const { L, pins } = live
    const shown = markers
    pins.clearLayers()
    const count = shown.length
    shown.forEach((marker, index) => {
      const pin: Marker = L.marker(toLatLng(marker.at), {
        icon: L.divIcon({ className: 'pin-host', html: pinElement(marker), iconSize: [0, 0] }),
        draggable: marker.movable === true,
        keyboard: marker.movable === true,
        // Dealt furthest first, so the nearest stand on top, and yours over them all.
        zIndexOffset: (marker.tone === 'you' ? count : index) * 1000,
      })
      pin.on('click', () => ontap?.(marker.id))
      pin.on('dragend', () => onmove?.(marker.id, toWorld(pin.getLatLng())))
      pin.addTo(pins)
    })
    untrack(settle)
  })

  $effect(() => {
    if (live === null) return
    const { L, drawing } = live
    drawing.clearLayers()
    for (const { from, to, faint } of lines) {
      const ends = [toLatLng(from), toLatLng(to)]
      if (faint !== true) {
        L.polyline(ends, { className: 'map-line-case', interactive: false }).addTo(drawing)
      }
      L.polyline(ends, {
        className: faint === true ? 'map-line faint' : 'map-line',
        interactive: false,
      }).addTo(drawing)
    }
    marks = areas.map(({ box, name, reach }) => {
      const whole = { ...box, maxX: box.maxX + 1, maxY: box.maxY + 1 }
      const edges = corners(whole)
      const middle = L.latLngBounds(edges).getCenter()
      if (reach !== undefined) {
        const line = reachLine(whole, reach).map(({ x, y }): [number, number] => [y, x])
        L.polygon(line, { className: 'map-reach', interactive: false }).addTo(drawing)
      }
      L.rectangle(edges, { className: 'map-ring', interactive: false }).addTo(drawing)
      const ring = L.circleMarker(middle, {
        className: 'map-ring',
        radius: SMALLEST_RING,
        interactive: false,
      }).addTo(drawing)
      const tag = document.createElement('span')
      tag.className = 'map-name'
      tag.textContent = name
      L.marker(middle, {
        icon: L.divIcon({ className: 'pin-host', html: tag, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: (markers.length + 1) * 1000,
      }).addTo(drawing)
      return { box, ring, tag }
    })
    untrack(settle)
  })

  $effect(() => {
    if (live === null) return
    const { L, handles } = live
    const wanted = new Set(grips.map((grip) => grip.id))
    for (const [id, marker] of held) {
      if (wanted.has(id)) continue
      handles.removeLayer(marker)
      held.delete(id)
    }
    for (const grip of grips) {
      const standing = held.get(grip.id)
      if (standing !== undefined) {
        if (dragged !== grip.id) standing.setLatLng(toLatLng(grip.at))
        continue
      }
      const marker = L.marker(toLatLng(grip.at), {
        icon: L.divIcon({ className: 'pin-host', html: gripElement(grip), iconSize: [0, 0] }),
        draggable: true,
        keyboard: false,
        title: grip.title,
      })
      marker.on('dragstart', () => (dragged = grip.id))
      marker.on('drag', () => ongrip?.(grip.id, toWorld(marker.getLatLng())))
      marker.on('dragend', () => {
        dragged = null
        ongrip?.(grip.id, toWorld(marker.getLatLng()))
        settleGrip(grip.id, marker)
      })
      marker.addTo(handles)
      held.set(grip.id, marker)
    }
  })

  $effect(() => {
    if (live === null || frame === null) return
    const { top, right, bottom, left } = inset
    const fitting = {
      paddingTopLeft: [left, top] as [number, number],
      paddingBottomRight: [right, bottom] as [number, number],
    }
    // Leaflet's animated fit jumps on a big change of zoom, which a map taken over makes.
    if (gliding && !reducedMotion()) {
      live.map.flyToBounds(corners(frame), { ...fitting, duration: GLIDE_S })
    } else {
      const animate = framed && !reducedMotion()
      live.map.fitBounds(corners(frame), { ...fitting, animate, duration: 1 })
    }
    framed = true
    gliding = false
  })

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

  const pickAt = (event: LeafletMouseEvent): void => onpick?.(toWorld(event.latlng))

  function pickMiddle(event: KeyboardEvent): void {
    if (live === null) return
    const container = live.map.getContainer()
    if (event.key !== 'Enter' || event.target !== container) return
    onpick?.(toWorld(live.map.getCenter()))
  }

  function build(L: typeof import('leaflet'), limit: LatLngBounds): Held {
    const canvas = canvasIn(host)
    const map = L.map(canvas, {
      crs: L.CRS.Simple,
      minZoom: LOWEST_ZOOM,
      maxZoom: HIGHEST_ZOOM,
      // Fractional zoom puts every tile on a non-integer scale, which Safari crawls at.
      zoomSnap: 1,
      maxBoundsViscosity: 1,
      attributionControl: false,
      zoomControl: false,
    })
    L.control.zoom({ position: 'topright' }).addTo(map)
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
    return { L, map, canvas, tiles, outside: null, limits: '', groups: [] }
  }

  /** Keeps the map to `bounds`, masking what lies outside, unless it already is. */
  function restrict(held: Held, limit: LatLngBounds): void {
    const { L, map, tiles } = held
    const limits = JSON.stringify(bounds ?? null)
    map.setMaxBounds(limit)
    if (held.limits === limits) return
    held.limits = limits
    tiles.options.bounds = limit
    if (map.hasLayer(tiles)) tiles.redraw()
    else tiles.addTo(map)
    held.outside?.remove()
    held.outside =
      bounds === undefined
        ? null
        : L.polygon([ring(SURFACE), ring(bounds)], {
            className: 'map-outside',
            stroke: false,
            fillOpacity: 1,
            interactive: false,
          }).addTo(map)
  }

  /** What an earlier view left on the map: gone at once, or fading with the old words. */
  function clearAway(held: Held, groups: LayerGroup[], fade: boolean): void {
    if (!fade) {
      groups.forEach((group) => group.remove())
      return
    }
    for (const group of groups) {
      group.eachLayer((layer) => {
        const element = (layer as Layer & { getElement?: () => Element | undefined }).getElement?.()
        element?.classList.add('leaving')
      })
    }
    setTimeout(() => groups.forEach((group) => held.map.removeLayer(group)), WORDS_OUT_MS)
  }

  onMount(() => {
    let held: Held | null = keep ? takeOver(host) : null
    const taken = held
    let observer: ResizeObserver | undefined
    let gone = false

    const loaded =
      taken !== null
        ? Promise.resolve(taken.L)
        : Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(
            ([{ default: L }]) => L,
          )

    // A question's map is built in a hidden part of the page and moved onto the stage, and
    // Leaflet fits its view to a frame it can measure.
    let waiting: ResizeObserver | undefined
    const sized = new Promise<void>((done) => {
      if (host.clientWidth > 0) return done()
      waiting = new ResizeObserver(() => {
        if (host.clientWidth === 0) return
        waiting?.disconnect()
        done()
      })
      waiting.observe(host)
    })

    void Promise.all([loaded, sized]).then(([L]) => {
      if (gone) return
      const limit: LatLngBounds = L.latLngBounds(corners(bounds ?? SURFACE))
      const opening = L.latLngBounds(corners(opensOn ?? bounds ?? PLAY_AREA))
      const kept = held ?? build(L, limit)
      held = kept
      const { map } = kept
      restrict(kept, limit)

      const fit = () => map.setMinZoom(map.getBoundsZoom(limit))
      fit()
      // A region or an opening shows whole. The surface fills the frame, cropping ocean instead.
      const filled = map.getBoundsZoom(opening, bounds === undefined && opensOn === undefined)
      if (taken === null || (fresh && reducedMotion())) {
        map.setView(opening.getCenter(), filled, { animate: false })
      } else if (fresh) {
        map.flyTo(opening.getCenter(), filled, { duration: GLIDE_S })
      }
      clearAway(kept, kept.groups, !reducedMotion())
      gliding = taken !== null

      map.on('click', pickAt)
      map.on('zoomend', settle)
      kept.canvas.addEventListener('keydown', pickMiddle)

      observer = new ResizeObserver(() => {
        map.invalidateSize()
        fit()
        settle()
      })
      observer.observe(host)

      live = {
        L,
        map,
        pins: L.layerGroup().addTo(map),
        drawing: L.layerGroup().addTo(map),
        handles: L.layerGroup().addTo(map),
      }
      kept.groups = [live.pins, live.drawing, live.handles]
    })

    return () => {
      gone = true
      waiting?.disconnect()
      observer?.disconnect()
      if (held === null) return
      held.map.off('click', pickAt)
      held.map.off('zoomend', settle)
      held.canvas.removeEventListener('keydown', pickMiddle)
      if (keep) handOn(held)
      else held.map.remove()
    }
  })
</script>

<div class="map" bind:this={host}></div>

<style>
  /* What stands on the map sits on panels, not on the floor `main` sets the inks for. */
  .map {
    --ink: var(--surface-ink);
    --muted: var(--surface-muted);
    width: 100%;
    height: 100%;
  }

  .map :global(.map-canvas) {
    width: 100%;
    height: 100%;
  }

  /* A tile that would be all black is not on disk, and everything outside `bounds` is black too. */
  .map :global(.leaflet-container) {
    background: var(--map-void);
  }

  .map :global(.leaving) {
    animation: -global-map-leave 150ms ease-in forwards;
    pointer-events: none;
  }

  @keyframes -global-map-leave {
    to {
      opacity: 0;
    }
  }

  .map :global(.map-outside) {
    fill: var(--map-void);
  }

  .map :global(.leaflet-tile) {
    image-rendering: pixelated;
  }

  .map :global(.leaflet-bar a) {
    background: var(--panel);
    color: var(--ink);
    border-color: var(--line);
  }

  /* A phone pinches. */
  @media (pointer: coarse) {
    .map :global(.leaflet-control-zoom) {
      display: none;
    }
  }

  .map :global(.pin-host) {
    width: 0;
    height: 0;
  }

  .map :global(.pin) {
    --pet: 40px;
    position: absolute;
    width: 0;
    height: 0;
  }

  .map :global(.pin.small) {
    --pet: 28px;
  }

  .map :global(.pin.big) {
    --pet: 54px;
  }

  .map :global(.pin img) {
    position: absolute;
    left: calc(var(--pet) / -2);
    bottom: 3px;
    width: var(--pet);
    height: var(--pet);
    max-width: none;
    object-fit: contain;
    filter: drop-shadow(0 2px 0 rgb(0 0 0 / 0.65));
    pointer-events: auto;
  }

  /* The exact tile, which the pet would otherwise hide. */
  .map :global(.pin i) {
    position: absolute;
    left: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    border: 2px solid var(--ink);
    border-radius: 50%;
    background: var(--panel);
    box-sizing: border-box;
  }

  .map :global(.pin.you i) {
    background: var(--accent);
    border-color: var(--accent-ink);
  }

  .map :global(.pin-tag) {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1;
    padding: 1px 7px 2px;
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
    text-align: center;
    box-shadow: 0 1px 0 rgb(0 0 0 / 0.55);
  }

  .map :global(.pin-tag b) {
    display: block;
    font-size: 13px;
    font-weight: 650;
  }

  .map :global(.pin.you .pin-tag) {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .map :global(.pin.far .pin-tag) {
    background: var(--bad);
    color: var(--bad-ink);
  }

  .map :global(.pin-tag[data-spot='below']) {
    transform: translate(-50%, 5px);
  }

  .map :global(.pin-tag[data-spot='above']) {
    transform: translate(-50%, calc(-100% - var(--pet) - 5px));
  }

  .map :global(.pin-tag[data-spot='right']) {
    transform: translate(calc(var(--pet) / 2), calc(var(--pet) / -2 - 50%));
  }

  .map :global(.pin-tag[data-spot='left']) {
    transform: translate(calc(-100% - var(--pet) / 2), calc(var(--pet) / -2 - 50%));
  }

  .map :global(.map-ring) {
    fill: var(--panel);
    fill-opacity: 0.24;
    stroke: var(--panel);
    stroke-width: 2.5;
  }

  .map :global(.map-ring.gone) {
    display: none;
  }

  .map :global(.map-reach) {
    fill: none;
    stroke: var(--panel);
    stroke-width: 2;
    stroke-dasharray: 3 6;
  }

  /* Wider than it looks: Leaflet drags by the element, and a finger needs the room. */
  .map :global(.grip) {
    position: absolute;
    left: -16px;
    top: -16px;
    width: 32px;
    height: 32px;
    cursor: nwse-resize;
  }

  .map :global(.grip::after) {
    content: '';
    position: absolute;
    inset: 9px;
    background: var(--panel);
    border: 2px solid var(--ink);
    box-sizing: border-box;
  }

  .map :global(.grip.middle) {
    cursor: move;
  }

  .map :global(.grip.middle::after) {
    inset: 6px;
    border-radius: 50%;
    background: var(--accent);
    border-color: var(--accent-ink);
  }

  .map :global(.map-line) {
    fill: none;
    stroke: var(--panel);
    stroke-width: 2;
    stroke-dasharray: 7 5;
  }

  .map :global(.map-line.faint) {
    stroke-width: 1.5;
    stroke-dasharray: 4 5;
    opacity: 0.7;
  }

  .map :global(.map-line-case) {
    fill: none;
    stroke: rgb(0 0 0 / 0.45);
    stroke-width: 4.5;
  }

  .map :global(.map-name) {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(-50%, calc(-100% - var(--ring, 13px) - 4px));
    padding: 0 8px 2px;
    border: 2px solid var(--scroll-edge);
    border-radius: 4px;
    background: var(--scroll-paper);
    color: var(--scroll-ink);
    font-family: var(--font-display, serif);
    font-size: 1.1rem;
    font-weight: 700;
    white-space: nowrap;
  }
</style>
