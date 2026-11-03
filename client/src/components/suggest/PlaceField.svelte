<script lang="ts">
  /**
   * A place on the world map: its box and how far off still earns points. One gesture on a
   * computer and a phone alike, since dragging out a box would fight the map's own pan: a tap
   * puts the box down, or moves it, and its grips reshape it. The map closes in on a new box so
   * the grips stand apart. The table says what the reach means in points, as `lib/mapBox.ts`
   * works them out; the preview beside the form grades a real pin.
   */
  import { around, type MapBounds, type WorldPoint } from '../../lib/map'
  import {
    boxAt,
    cornerOf,
    CORNERS,
    type Corner,
    middleOf,
    moveBox,
    PLACE_REACH,
    pullCorner,
    reachPoints,
    START_BOX,
  } from '../../lib/mapBox'
  import MapView, { type MapArea, type MapGrip } from '../map/MapView.svelte'

  let {
    box,
    reach,
    name,
    onbox,
    onreach,
  }: {
    box: MapBounds | null
    reach: number
    /** Labels the box on the map. */
    name: string
    onbox: (box: MapBounds) => void
    onreach: (reach: number) => void
  } = $props()

  const id = $props.id()
  /** Tiles round a box when the map closes in on it, for the grips and a little land. */
  const CLOSE_MARGIN = 40
  const MIDDLE = 'middle'

  const closeOn = (place: MapBounds): MapBounds =>
    around(
      [
        { x: place.minX, y: place.minY },
        { x: place.maxX, y: place.maxY },
      ],
      CLOSE_MARGIN,
    )

  // svelte-ignore state_referenced_locally
  let frame = $state<MapBounds | null>(box === null ? null : closeOn(box))

  const areas = $derived<MapArea[]>(
    box === null ? [] : [{ box, name: name.trim() || 'This place', reach }],
  )
  const grips = $derived<MapGrip[]>(
    box === null
      ? []
      : [
          ...CORNERS.map((corner) => ({
            id: corner,
            at: cornerOf(box, corner),
            title: 'Drag to resize',
          })),
          { id: MIDDLE, at: middleOf(box), middle: true, title: 'Drag to move' },
        ],
  )
  const table = $derived(reachPoints(reach))

  function pick(tile: WorldPoint): void {
    if (box === null) {
      const placed = boxAt(tile, START_BOX, START_BOX)
      onbox(placed)
      frame = closeOn(placed)
    } else onbox(moveBox(box, tile))
  }

  function grip(which: string, tile: WorldPoint): void {
    if (box === null) return
    onbox(which === MIDDLE ? moveBox(box, tile) : pullCorner(box, which as Corner, tile))
  }
</script>

<div class="field">
  <p class="label">Where it is</p>
  <div class="map">
    <MapView {areas} {grips} {frame} onpick={pick} ongrip={grip} />
  </div>
  <p class="note hint">
    {box === null
      ? 'Find the place and tap it.'
      : 'Drag the corners round the whole place. Drag the middle, or tap, to move it.'}
  </p>
</div>
<div class="field">
  <label for="{id}-reach">Points run out {reach} tiles from the box</label>
  <input
    id="{id}-reach"
    type="range"
    min={PLACE_REACH.min}
    max={PLACE_REACH.max}
    step={PLACE_REACH.step}
    value={reach}
    oninput={(event) => onreach(Number(event.currentTarget.value))}
  />
  <table>
    <tbody>
      <tr>
        <th scope="row">Tiles off</th>
        {#each table as row (row.tiles)}<td>{row.tiles}</td>{/each}
      </tr>
      <tr>
        <th scope="row">Points</th>
        {#each table as row (row.tiles)}<td>{row.points}</td>{/each}
      </tr>
    </tbody>
  </table>
</div>

<style>
  .label {
    margin: 0 0 0.3rem;
  }

  .map {
    height: min(24rem, 60vh);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    overflow: hidden;
  }

  .hint {
    margin: 0.3rem 0 0;
  }

  input[type='range'] {
    width: 100%;
  }

  table {
    width: 100%;
    margin-top: 0.3rem;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th {
    text-align: left;
    font-weight: 500;
  }

  td {
    text-align: right;
  }
</style>
