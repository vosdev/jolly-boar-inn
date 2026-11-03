<script lang="ts">
  /**
   * `map_pin`: place one pin per target on the world map, then lock them in.
   *
   * `data` arrives in the two shapes `questions/types/map_pin.py` sends: while open the prompt,
   * `pins` and `bounds`; after close the same plus `targets` and the `reach` that scored them.
   *
   * Your pet is your pin from the first tap. Until Lock in the pins are this browser's alone,
   * and whatever is down when the question nearly ends goes then, the last pin repeated if some
   * were never placed: the server takes a full set or none.
   *
   * The reveal opens close on the targets for `CLOSE_MS`, where the near pins can be read, then
   * pulls back to fit everyone, so the furthest pin lands last. Labels go to the far pins first
   * (`lib/mapLabels.ts`), which keeps the wrong answers named however the near ones pile up.
   * With several pins and a crowd the map keeps to your own, and the table has the rest.
   *
   * A view without `results` is a phone beside the room's TV, which only shows your own pins.
   */
  import { fromStore } from 'svelte/store'

  import { reducedMotion } from '../../../lib/interlude'
  import {
    around,
    clampTile,
    type MapBounds,
    SURFACE,
    within,
    type WorldPoint,
  } from '../../../lib/map'
  import { avatarArt, petOf } from '../../../lib/pets'
  import {
    boundsOf,
    CROWD,
    filledPins,
    nearestPin,
    pinRows,
    pinsOf,
    placed as against,
    type PinRow,
    type PinTarget,
    type WireBounds,
  } from '../../../lib/pins'
  import { players, you } from '../../../lib/stores'
  import { Until } from '../../../lib/typing.svelte'
  import MapView, { type MapArea, type MapLine, type MapMarker } from '../../map/MapView.svelte'
  import { sendBeforeEnd } from '../drag.svelte'
  import type { TypeViewProps } from '../props'

  interface Data {
    pins: number
    bounds?: WireBounds
    /** Reveal only. */
    targets?: PinTarget[]
    /** Reveal only. */
    reach?: number
  }

  /** How long the reveal stays close, in ms. */
  const CLOSE_MS = 4000
  /** Tiles round the targets in the close view: a town and what stands round it. */
  const CLOSE_MARGIN = 150
  /** Tiles round the pins in the wide view, for their pets and labels. */
  const WIDE_MARGIN = 40
  /** What the sheet and the host's bubble cover, kept clear of the pins a reveal frames. */
  const INSET = { top: 110, right: 24, bottom: 70, left: 24 }

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    results,
    timing,
    onAnswer,
  }: TypeViewProps<WorldPoint[]> = $props()

  const q = $derived(data as unknown as Data)
  const count = $derived(q.pins)
  const bounds: MapBounds | undefined = $derived(
    q.bounds === undefined ? undefined : boundsOf(q.bounds),
  )
  const reach = $derived(q.reach ?? 1)
  const targets = $derived(q.targets ?? [])

  const me = fromStore(you)
  const room = fromStore(players)
  const tv = $derived(me.current?.role === 'tv')

  function art(id: string | undefined): string {
    const player = room.current.find((one) => one.id === id)
    return avatarArt(player === undefined ? '' : petOf(player)).url
  }

  const nameOf = (id: string): string =>
    room.current.find((player) => player.id === id)?.display_name ?? '?'

  let pins = $state<WorldPoint[]>([])
  const sent = $derived(pinsOf(yourValue))
  const movable = $derived(canAnswer && !revealed && sent.length === 0)
  const full = $derived(pins.length === count)
  const mine = $derived(sent.length > 0 ? sent : pins)

  function pick(tile: WorldPoint): void {
    if (!movable) return
    const at = clampTile(tile, bounds ?? SURFACE)
    if (count === 1) pins = [at]
    else if (!full) pins = [...pins, at]
    else pins = pins.with(nearestPin(pins, at), at)
  }

  const pinId = (index: number): string => `pin-${index}`

  function move(id: string, tile: WorldPoint): void {
    const index = Number(id.slice('pin-'.length))
    pins = pins.with(index, clampTile(tile, bounds ?? SURFACE))
  }

  function tap(id: string): void {
    if (!movable || count === 1) return
    const index = Number(id.slice('pin-'.length))
    pins = pins.filter((_, at) => at !== index)
  }

  sendBeforeEnd(
    () => movable && pins.length > 0,
    () => timing,
    () => filledPins(pins, count),
    (value) => onAnswer(value as WorldPoint[]),
  )

  const lockHint = $derived.by(() => {
    if (sent.length > 0) return sent.length === 1 ? 'Pin locked in.' : 'Pins locked in.'
    if (count === 1) {
      return full
        ? 'Pin placed. Drag it, or tap the map to move it.'
        : 'Tap the map to place your pin.'
    }
    if (full) return `All ${count} pins placed. Drag one to move it, or tap one to remove it.`
    return `${pins.length} of ${count} pins placed. Tap the map for the next one.`
  })

  const rows: PinRow[] = $derived(
    revealed && results != null ? pinRows(results, targets, reach) : [],
  )
  /** A phone beside the TV sees no results, and tells the story of its own pins. */
  const myPins = $derived(revealed ? against(pinsOf(yourValue), targets, reach) : [])
  const crowded = $derived(count > 1 && rows.length > CROWD)
  const shownRows: PinRow[] = $derived.by(() => {
    if (!crowded) return rows
    return rows.filter((row) => row.id === me.current?.id)
  })
  /** Furthest first, so far pins get first go at a label and near ones draw over them. */
  const farFirst = $derived([...shownRows].reverse())
  const furthest = $derived(shownRows.length > 1 ? farFirst[0]?.id : undefined)

  function tiles(off: number): string {
    const whole = Math.round(off)
    return `${whole.toLocaleString('en-GB')} ${whole === 1 ? 'tile' : 'tiles'}`
  }

  const revealMarkers: MapMarker[] = $derived.by(() => {
    if (rows.length === 0) {
      return myPins.map((pin, index) => ({
        id: pinId(index),
        at: pin.at,
        art: art(me.current?.id),
        title: 'You',
        detail: tiles(pin.off),
        tone: 'you' as const,
      }))
    }
    const youFirst = [...farFirst].sort(
      (a, b) => Number(b.id === me.current?.id) - Number(a.id === me.current?.id),
    )
    return youFirst.flatMap((row) => {
      const yours = row.id === me.current?.id
      const worst = Math.max(...row.pins.map((pin) => pin.off))
      return row.pins.map((pin, index) => ({
        id: `${row.id}-${index}`,
        at: pin.at,
        art: art(row.id),
        // A player is named once, on the pin that went furthest.
        title:
          pin.off === worst && row.pins.indexOf(pin) === row.pins.findIndex((p) => p.off === worst)
            ? yours
              ? 'You'
              : nameOf(row.id)
            : undefined,
        detail: tiles(pin.off),
        tone: yours ? ('you' as const) : row.id === furthest ? ('far' as const) : undefined,
        size:
          count > 1 && !yours
            ? ('small' as const)
            : row.id === furthest
              ? ('big' as const)
              : undefined,
      }))
    })
  })

  const markers: MapMarker[] = $derived(
    revealed
      ? revealMarkers
      : mine.map((at, index) => ({
          id: pinId(index),
          at,
          art: art(me.current?.id),
          tone: 'you' as const,
          movable,
        })),
  )

  const lines: MapLine[] = $derived.by(() => {
    if (!revealed) return []
    const pinned = rows.length > 0 ? shownRows.flatMap((row) => row.pins) : myPins
    return pinned
      .filter((pin) => pin.off > 0)
      .map((pin) => ({ from: pin.at, to: pin.to, faint: count > 1 && !isMine(pin.at) }))
  })

  function isMine(at: WorldPoint): boolean {
    return pinsOf(yourValue).some((pin) => pin.x === at.x && pin.y === at.y)
  }

  const areas: MapArea[] = $derived(
    targets.map((target) => ({ box: boundsOf(target), name: target.name })),
  )

  const corners = $derived(
    targets.flatMap((target) => [
      { x: target.min_x, y: target.min_y },
      { x: target.max_x, y: target.max_y },
    ]),
  )
  const close: MapBounds | null = $derived(
    revealed && corners.length > 0 ? around(corners, CLOSE_MARGIN) : null,
  )
  const wide: MapBounds | null = $derived(
    close === null
      ? null
      : around([...corners, ...markers.map((marker) => marker.at)], WIDE_MARGIN),
  )

  const reduced = reducedMotion()
  const shownAt = Date.now()
  const pulled = new Until(() => shownAt + CLOSE_MS)

  const frame: MapBounds | null = $derived.by(() => {
    if (close === null || wide === null) return null
    if (tv || reduced || pulled.passed || within(wide, close)) return wide
    return close
  })
</script>

<div class="pin-map" role="group" aria-label="World map">
  <MapView
    {bounds}
    {markers}
    {lines}
    {areas}
    {frame}
    inset={INSET}
    onpick={movable ? pick : undefined}
    onmove={move}
    ontap={tap}
  />
  {#if !revealed && canAnswer}
    <div class="lock surface">
      <span aria-live="polite">{lockHint}</span>
      {#if movable}
        <button type="button" class="primary" disabled={!full} onclick={() => onAnswer(pins)}>
          Lock in
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pin-map {
    position: relative;
    height: 100%;
    min-height: 16rem;
    overflow: hidden;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .lock {
    position: absolute;
    z-index: 1000;
    right: 0.75rem;
    bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: calc(100% - 1.5rem);
    padding: 0.5rem 0.5rem 0.5rem 0.9rem;
    background: var(--panel);
    border: 2px solid var(--line);
    border-radius: var(--radius);
    font-size: 0.95rem;
    line-height: 1.25;
  }

  .lock button {
    flex: none;
    min-height: 44px;
    white-space: nowrap;
  }

  @container (max-width: 26rem) {
    .lock {
      left: 0.5rem;
      right: 0.5rem;
      bottom: 0.5rem;
      justify-content: space-between;
    }
  }
</style>
