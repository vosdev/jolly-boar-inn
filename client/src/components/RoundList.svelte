<script lang="ts">
  /**
   * The rounds picked, as they will play: how many questions each, and, when the host
   * orders them, which goes first. A round is moved by dragging its grip, or with the
   * arrow keys while the grip has focus; a shuffled room has no order to arrange, so
   * then there are no grips and no numbers, and the host's face has their place.
   *
   * Dragging swaps a round with its neighbour once it is pulled past half the neighbour's
   * height, so the list under the finger is always the order that will be sent.
   */
  import { tick } from 'svelte'

  import type { ModeBounds } from '../lib/api'
  import { hostOf, modeLabel } from '../lib/modes'
  import { npcArt } from '../lib/npcs'
  import type { ModeSettings } from '../lib/protocol'
  import Segmented from './Segmented.svelte'
  import Stepper from './Stepper.svelte'

  let {
    rounds = $bindable(),
    order = $bindable(),
    bounds,
    surprise = null,
    tally,
  }: {
    rounds: ModeSettings[]
    order: 'listed' | 'random'
    /** Each mode's question bounds, by mode id. */
    bounds: Record<string, ModeBounds>
    /** How many rounds the server will draw unseen, or null when the host picked them. */
    surprise?: number | null
    /** The line under the list: what the rounds come to. */
    tally: string
  } = $props()

  const ordered = $derived(order === 'listed' && rounds.length > 1)

  let rows: Record<string, HTMLElement> = {}
  let drag = $state<{ mode: string; from: number; dy: number } | null>(null)

  function setQuestions(mode: string, questions: number): void {
    rounds = rounds.map((round) => (round.mode === mode ? { ...round, questions } : round))
  }

  /** Move round `index` one place `by` (-1 up, 1 down); the ends stay put. */
  function move(index: number, by: number): boolean {
    const to = index + by
    if (to < 0 || to >= rounds.length) return false
    const moved = [...rounds]
    const [round] = moved.splice(index, 1)
    if (round === undefined) return false
    moved.splice(to, 0, round)
    rounds = moved
    return true
  }

  async function key(event: KeyboardEvent, mode: string): Promise<void> {
    const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (by === 0) return
    event.preventDefault()
    const grip = event.currentTarget as HTMLElement
    if (
      !move(
        rounds.findIndex((round) => round.mode === mode),
        by,
      )
    )
      return
    // The keyed row moves in the DOM, and focus can drop off it on the way.
    await tick()
    grip.focus()
  }

  function down(event: PointerEvent, mode: string): void {
    if (event.button !== 0) return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    drag = { mode, from: event.clientY, dy: 0 }
  }

  function pull(event: PointerEvent): void {
    if (drag === null) return
    drag.dy = event.clientY - drag.from
    const index = rounds.findIndex((round) => round.mode === drag?.mode)
    const by = drag.dy > 0 ? 1 : -1
    const self = rows[drag.mode]
    const neighbour = rows[rounds[index + by]?.mode ?? '']
    if (self === undefined || neighbour === undefined) return
    const step = Math.abs(neighbour.offsetTop - self.offsetTop)
    if (Math.abs(drag.dy) < step / 2 || !move(index, by)) return
    drag.from += by * step
    drag.dy -= by * step
  }

  function drop(): void {
    drag = null
  }
</script>

<section class="panel rounds" aria-labelledby="rounds-title">
  <div class="head">
    <h2 id="rounds-title">Running order</h2>
    {#if surprise === null}
      <Segmented
        legend="Round order"
        hideLegend
        options={[
          { value: 'random', label: 'Shuffled' },
          { value: 'listed', label: 'In order' },
        ]}
        bind:value={order}
      />
    {/if}
  </div>

  {#if surprise !== null}
    <p class="count">{surprise} surprise round{surprise === 1 ? '' : 's'}</p>
    <p class="note">
      Drawn when the game starts. Nobody sees them, you included, until each round starts.
    </p>
  {:else if rounds.length === 0}
    <p class="empty">Tick a host to add their round.</p>
  {:else}
    <ol class="list">
      {#each rounds as round, index (round.mode)}
        {@const label = modeLabel(round.mode)}
        {@const art = npcArt(hostOf(round.mode).host.id)}
        <li
          class="round"
          class:lifted={drag?.mode === round.mode}
          bind:this={rows[round.mode]}
          style:transform={drag?.mode === round.mode ? `translateY(${drag.dy}px)` : undefined}
        >
          {#if ordered}
            <button
              type="button"
              class="grip"
              aria-label="Move {label}, round {index + 1} of {rounds.length}"
              onkeydown={(event) => key(event, round.mode)}
              onpointerdown={(event) => down(event, round.mode)}
              onpointermove={pull}
              onpointerup={drop}
              onpointercancel={drop}
            >
              <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">
                <circle cx="3" cy="3" r="1.7" /><circle cx="9" cy="3" r="1.7" />
                <circle cx="3" cy="9" r="1.7" /><circle cx="9" cy="9" r="1.7" />
                <circle cx="3" cy="15" r="1.7" /><circle cx="9" cy="15" r="1.7" />
              </svg>
            </button>
            <span class="number" aria-hidden="true">{index + 1}</span>
          {:else}
            <span class="face" aria-hidden="true">
              <img class={art.cut} src={art.url} alt="" draggable="false" />
            </span>
          {/if}
          {#if bounds[round.mode]}
            <Stepper
              {label}
              noun="questions"
              value={round.questions}
              min={bounds[round.mode]!.min}
              max={bounds[round.mode]!.max}
              onchange={(value) => setQuestions(round.mode, value)}
            />
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
  {#if surprise === null && rounds.length > 0}
    <p class="note tally">{tally}</p>
  {/if}
</section>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .head h2 {
    margin: 0;
  }

  .head :global(label) {
    padding-block: calc(0.3rem - var(--border-give));
    font-size: 0.85rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.4rem;
  }

  .round {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.4rem 0.25rem 0.3rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
  }

  .round :global(.stepper) {
    flex: 1;
    min-width: 0;
    color: var(--ink);
    font-weight: 700;
  }

  .round.lifted {
    position: relative;
    z-index: 1;
    border-color: var(--accent);
    box-shadow:
      inset 0 0 0 2px var(--accent),
      0 10px 18px rgb(0 0 0 / 0.3);
  }

  /* 44px tall to grab; touch-action keeps a drag on it from scrolling the page. */
  .grip {
    flex: none;
    width: 1.25rem;
    height: 2.75rem;
    padding: 0;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    cursor: grab;
    touch-action: none;
  }

  .grip svg {
    fill: var(--line);
  }

  .lifted .grip {
    cursor: grabbing;
  }

  .lifted .grip svg {
    fill: var(--accent);
  }

  .number {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    display: grid;
    place-items: center;
    font-family: var(--font-numeric);
    font-weight: 700;
    font-size: 0.8rem;
  }

  .face {
    flex: none;
    width: 2.1rem;
    height: 2.3rem;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .face img {
    display: block;
    max-width: 100%;
    max-height: 100%;
  }

  .face .render {
    aspect-ratio: 1;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  .count {
    margin: 0;
    font-weight: 700;
  }

  .empty {
    margin: 0;
    padding: 1rem;
    text-align: center;
    color: var(--muted);
    border: var(--border-width) dashed var(--line);
    border-radius: min(var(--radius), 8px);
  }

  .note {
    margin: 0.3rem 0 0;
  }

  .tally {
    margin-top: 0.6rem;
  }
</style>
