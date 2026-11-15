<script lang="ts">
  /**
   * `picture_pin`: tap the spot on a picture, then lock it in.
   *
   * `data` arrives in the two shapes `questions/types/picture_pin.py` sends: while open the
   * prompt, the picture's file and shape and any `grid`; after close the same plus the `target`
   * and its `reach`, or the target `cells`.
   *
   * The picture is drawn whole, full width and never taller than `MOST_HEIGHT` of the screen,
   * in a box of its own shape from the first frame, and everything on it is placed in fractions of
   * that box (`lib/picturePins.ts`), so every screen puts an answer on the same spot. Your pet is
   * your pin from the first tap, which moves it; on a grid it stands in the middle of the cell
   * tapped, which lights up. Lock in sends it, and an unsent pin goes a second before the end.
   * The arrow keys move it too, a cell or a fiftieth of the picture at a time, and Enter locks in.
   *
   * The reveal draws the target box or cells, every pin with its pet, and a dashed line from
   * each miss to the nearest of the target. A phone beside the room's TV gets no `results`
   * and shows its own pin. The TV draws the picture and pins nothing.
   */
  import { fromStore } from 'svelte/store'

  import { avatarArt, petOf } from '../../../lib/pets'
  import {
    answerFor,
    cellBox,
    cellOf,
    fractionAt,
    placed,
    spotOf,
    targetBoxes,
    type PicturePinData,
    type Placed,
    type Spot,
  } from '../../../lib/picturePins'
  import type { WireBounds } from '../../../lib/pins'
  import { pictureUrl } from '../../../lib/pictures'
  import { players, you } from '../../../lib/stores'
  import { sendBeforeEnd } from '../drag.svelte'
  import type { TypeViewProps } from '../props'

  /** The most of the screen's height the picture takes, so the prompt and Lock in stay in sight. */
  const MOST_HEIGHT = '55dvh'
  /** How far an arrow key moves the pin without a grid, as a fraction of the picture. */
  const STEP = 0.02

  let { data, revealed, yourValue, canAnswer, results, timing, onAnswer }: TypeViewProps<Spot> =
    $props()

  const q = $derived(data as unknown as PicturePinData)
  const src = $derived(pictureUrl(q.picture))
  const width = $derived(Math.max(1, q.width))
  const height = $derived(Math.max(1, q.height))
  const grid = $derived(q.grid)

  const me = fromStore(you)
  const room = fromStore(players)
  const tv = $derived(me.current?.role === 'tv')

  function art(id: string | undefined): string {
    const player = room.current.find((one) => one.id === id)
    return avatarArt(player === undefined ? '' : petOf(player)).url
  }

  const nameOf = (id: string): string =>
    room.current.find((player) => player.id === id)?.display_name ?? '?'

  let frame = $state<HTMLElement | null>(null)
  let pin = $state<Spot | null>(null)
  const sent = $derived(spotOf(yourValue))
  const movable = $derived(canAnswer && !revealed && !tv && sent === null)
  const mine = $derived(sent ?? pin)

  function place(spot: Spot): void {
    if (movable) pin = answerFor(spot, grid)
  }

  function tap(event: MouseEvent): void {
    if (frame === null) return
    place(fractionAt(event.clientX, event.clientY, frame.getBoundingClientRect()))
  }

  const MOVES: Record<string, Spot> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  }

  function key(event: KeyboardEvent): void {
    if (!movable) return
    if (event.key === 'Enter' && pin !== null) {
      event.preventDefault()
      onAnswer(pin)
      return
    }
    const move = MOVES[event.key]
    if (move === undefined) return
    event.preventDefault()
    const from = pin ?? { x: 0.5, y: 0.5 }
    const step = grid === undefined ? { x: STEP, y: STEP } : { x: 1 / grid.cols, y: 1 / grid.rows }
    const to = { x: from.x + move.x * step.x, y: from.y + move.y * step.y }
    place({ x: Math.min(1, Math.max(0, to.x)), y: Math.min(1, Math.max(0, to.y)) })
  }

  sendBeforeEnd(
    () => movable && pin !== null,
    () => timing,
    () => pin,
    (value) => onAnswer(value as Spot),
  )

  interface Marker {
    id: string
    at: Spot
    art: string
    label: string
    you: boolean
    line: Placed | null
  }

  const marker = (id: string, at: Spot, yours: boolean): Marker => {
    const against = revealed ? placed(at, q) : null
    return {
      id,
      at,
      art: art(id),
      label: yours ? 'You' : nameOf(id),
      you: yours,
      line: against !== null && against.off > 0 && Number.isFinite(against.off) ? against : null,
    }
  }

  const markers: Marker[] = $derived.by(() => {
    const myId = me.current?.id ?? ''
    if (!revealed || results == null) {
      return mine === null ? [] : [marker(myId, mine, true)]
    }
    const pinned = Object.entries(results).flatMap(([id, result]) => {
      const at = spotOf(result.value)
      return at === null ? [] : [marker(id, at, id === myId)]
    })
    // Yours last, so it stands over the rest.
    return pinned.sort((a, b) => Number(a.you) - Number(b.you))
  })

  const targets: WireBounds[] = $derived(revealed ? targetBoxes(q) : [])
  const lit: WireBounds | null = $derived(
    grid === undefined || mine === null ? null : cellBox(cellOf(mine, grid), grid),
  )

  const lines = $derived.by(() => {
    if (grid === undefined) return { cols: [], rows: [] }
    return {
      cols: Array.from({ length: grid.cols - 1 }, (_, index) => ((index + 1) / grid.cols) * width),
      rows: Array.from({ length: grid.rows - 1 }, (_, index) => ((index + 1) / grid.rows) * height),
    }
  })

  const label = $derived(
    movable
      ? grid === undefined
        ? 'Picture: tap the spot'
        : 'Picture: tap the square'
      : 'Picture',
  )
</script>

<div class="picture-pin" style:--ratio="{width} / {height}" style:--most={MOST_HEIGHT}>
  <!-- An application takes its own keys: the arrows move the pin and Enter locks it in. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
  <div
    class="frame"
    class:movable
    bind:this={frame}
    role="application"
    aria-label={label}
    tabindex={movable ? 0 : -1}
    onclick={tap}
    onkeydown={key}
  >
    {#if src !== null}
      <img class="shot" {src} alt="" draggable="false" />
    {:else}
      <p class="missing">This picture is missing on this server.</p>
    {/if}
    <svg viewBox="0 0 {width} {height}" preserveAspectRatio="none" aria-hidden="true">
      {#each lines.cols as x (x)}
        <line class="grid" x1={x} x2={x} y1="0" y2={height} />
      {/each}
      {#each lines.rows as y (y)}
        <line class="grid" x1="0" x2={width} y1={y} y2={y} />
      {/each}
      {#if lit !== null}
        <rect
          class="lit"
          x={lit.min_x * width}
          y={lit.min_y * height}
          width={(lit.max_x - lit.min_x) * width}
          height={(lit.max_y - lit.min_y) * height}
        />
      {/if}
      {#each targets as box, index (index)}
        <rect
          class="target"
          x={box.min_x * width}
          y={box.min_y * height}
          width={(box.max_x - box.min_x) * width}
          height={(box.max_y - box.min_y) * height}
        />
      {/each}
      {#each markers as one (one.id)}
        {#if one.line !== null}
          <line
            class="miss-case"
            x1={one.at.x * width}
            y1={one.at.y * height}
            x2={one.line.to.x * width}
            y2={one.line.to.y * height}
          />
          <line
            class="miss"
            class:faint={!one.you}
            x1={one.at.x * width}
            y1={one.at.y * height}
            x2={one.line.to.x * width}
            y2={one.line.to.y * height}
          />
        {/if}
      {/each}
    </svg>
    {#each markers as one (one.id)}
      <span
        class="pin"
        class:you={one.you}
        style:left="{one.at.x * 100}%"
        style:top="{one.at.y * 100}%"
        data-x={one.at.x}
        data-y={one.at.y}
        title={one.label}
      >
        <img src={one.art} alt="" />
        <i></i>
        {#if one.you && revealed}<b class="pin-tag">You</b>{/if}
      </span>
    {/each}
  </div>
  {#if movable}
    <button
      type="button"
      class="primary lock"
      disabled={pin === null}
      onclick={() => pin !== null && onAnswer(pin)}
    >
      Lock in
    </button>
  {/if}
</div>

<style>
  .picture-pin {
    display: grid;
    gap: 0.75rem;
    justify-items: center;
  }

  /* The picture's own shape, full width unless that would make it taller than `--most`. */
  .frame {
    position: relative;
    width: min(100%, calc(var(--most) * var(--ratio)));
    aspect-ratio: var(--ratio);
    overflow: hidden;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow);
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }

  .frame.movable {
    cursor: crosshair;
  }

  .frame:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  .shot,
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Drawn into the box, never letterboxed: the fractions are the box's. */
  .shot {
    object-fit: fill;
    pointer-events: none;
  }

  svg {
    overflow: visible;
    pointer-events: none;
  }

  .missing {
    margin: 0;
    padding: 1rem;
    color: var(--muted);
    text-align: center;
  }

  svg :global(*) {
    vector-effect: non-scaling-stroke;
  }

  .grid {
    stroke: var(--panel);
    stroke-opacity: 0.7;
    stroke-width: 1;
  }

  .lit {
    fill: var(--accent);
    fill-opacity: 0.35;
    stroke: var(--accent);
    stroke-width: 2;
  }

  .target {
    fill: var(--panel);
    fill-opacity: 0.24;
    stroke: var(--panel);
    stroke-width: 2.5;
  }

  .miss {
    stroke: var(--panel);
    stroke-width: 2;
    stroke-dasharray: 7 5;
  }

  .miss.faint {
    stroke-width: 1.5;
    stroke-dasharray: 4 5;
    opacity: 0.7;
  }

  .miss-case {
    stroke: rgb(0 0 0 / 0.45);
    stroke-width: 4.5;
  }

  .pin {
    --pet: 36px;
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .pin img {
    position: absolute;
    left: calc(var(--pet) / -2);
    bottom: 3px;
    width: var(--pet);
    height: var(--pet);
    max-width: none;
    object-fit: contain;
    filter: drop-shadow(0 2px 0 rgb(0 0 0 / 0.65));
  }

  /* The exact spot, which the pet would otherwise hide. */
  .pin i {
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

  .pin.you i {
    background: var(--accent);
    border-color: var(--accent-ink);
  }

  .pin-tag {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(-50%, 5px);
    padding: 1px 7px 2px;
    border-radius: 4px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.2;
    white-space: nowrap;
    box-shadow: 0 1px 0 rgb(0 0 0 / 0.55);
  }

  .lock {
    width: 100%;
    min-height: 56px;
  }
</style>
