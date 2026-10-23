<script lang="ts">
  /**
   * `pick_all_that_apply`: three to six written answers, and any number of them right.
   *
   * `data` arrives in the two shapes `questions/types/pick_all_that_apply.py` sends:
   *
   * - while open, `client_view(payload)`: the prompt, the options in the server's seeded
   *   shuffle (an index is a shown position) and, if the author set one, `picks`, how many
   *   to pick.
   * - after close, `reveal(payload)`: the same plus `answer_indices`.
   *
   * The right ones are dragged from the tray into a basket above it, as `ordering`'s rows
   * are, by pointer or keyboard (`drag.svelte.ts`): Up puts a lifted option in the basket,
   * Down takes it out. Without `picks` the basket grows as options go in, unnumbered,
   * since a fixed number of places would give the count away. With `picks` it is that many
   * empty places, and a drop on a filled one swaps the two. A basket option's × sends it
   * back, and the rewind button empties the basket. Submit waits for one at least, or for
   * exactly `picks`. A basket that would be a valid answer goes on its own a second before
   * `ends_at`; one that would not is not sent.
   *
   * Once sent, it behaves as one pick does in `multiple_choice`: ours lit with a "you", the
   * rest faded. The reveal lights every right option and keeps the "you" on each of ours,
   * so a lit gem without one is a right answer we missed.
   */
  import { untrack } from 'svelte'

  import { emptySlots, swapAt, toTray, trayOf, type Slots } from '../../../lib/slots'
  import { Dragging, sendBeforeEnd } from '../drag.svelte'
  import DragActions from '../DragActions.svelte'
  import DragRow from '../DragRow.svelte'
  import { GEMS } from '../GemButton.svelte'
  import GemChoices from '../GemChoices.svelte'
  import type { TypeViewProps } from '../props'

  /** Option indices, ascending. */
  type Indices = number[]

  interface Data {
    options: string[]
    picks?: number
    /** Reveal only. */
    answer_indices?: Indices
  }

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    timing,
    onAnswer,
    results = null,
  }: TypeViewProps<Indices> = $props()

  const q = $derived(data as unknown as Data)
  const gemAt = (index: number) => GEMS[Math.min(index, GEMS.length - 1)] ?? null
  const textOf = (shown: number) => q.options[shown] ?? ''

  const indices = (value: unknown): Indices =>
    Array.isArray(value) ? value.filter((index) => Number.isInteger(index)) : []
  const answer = $derived(new Set(revealed ? indices(q.answer_indices) : []))
  const picked = $derived(new Set(indices(yourValue)))
  const sent = $derived(picked.size > 0)
  const movable = $derived(canAnswer && !revealed && !sent)

  /** Changes with the options or `picks`, not with every new copy of the same question. */
  const shape = $derived(JSON.stringify([q.options, q.picks ?? null]))
  /** The basket: `picks` places, or room for every option, filled from the first. */
  let slots = $derived.by<Slots>(() => {
    void shape
    return untrack(() => emptySlots(q.picks ?? q.options.length))
  })
  const basket = $derived(slots.filter((shown): shown is number => shown !== null))
  const tray = $derived(trayOf(slots, q.options.length))
  const ready = $derived(q.picks === undefined ? basket.length > 0 : basket.length === q.picks)
  const full = $derived(basket.length === slots.length)

  let area: HTMLElement | undefined = $state()

  /** `shown` into the basket's first empty place, unless it is in already or there is none. */
  function added(from: Slots, shown: number): Slots {
    const gap = from.indexOf(null)
    if (from.includes(shown) || gap === -1) return from
    return from.map((at, index) => (index === gap ? shown : at))
  }

  const dragging = new Dragging({
    slots: () => slots,
    set: (next) => (slots = next),
    movable: () => movable,
    // Without `picks` the basket has no places to aim at: a drop anywhere on it adds.
    drop: (from, shown, at) =>
      q.picks === undefined ? added(from, shown) : swapAt(from, shown, at),
    step: (from, shown, by) => (by === -1 ? added(from, shown) : toTray(from, shown)),
    area: () => area,
  })

  const sorted = () => [...basket].sort((a, b) => a - b)

  function submit(): void {
    if (ready && !sent) onAnswer(sorted())
  }

  function restart(): void {
    slots = emptySlots(slots.length)
    dragging.lifted = null
  }

  function back(shown: number): void {
    slots = toTray(slots, shown)
  }

  sendBeforeEnd(
    () => movable && ready,
    () => timing,
    sorted,
    (value) => onAnswer(value as Indices),
  )
</script>

{#if !revealed}
  <p class="ask">{q.picks === undefined ? 'Pick all that apply' : `Pick ${q.picks}`}</p>
{/if}
{#if movable}
  <div bind:this={area}>
    {#if q.picks === undefined}
      <ul class="basket" data-place="0" class:over={dragging.over === 0}>
        {#each basket as shown (shown)}
          <li>{@render option(shown, true)}</li>
        {/each}
        {#if !full}
          <li class="empty">Drag the right ones here</li>
        {/if}
      </ul>
    {:else}
      <ul class="basket">
        {#each slots as shown, index (shown ?? `empty ${index}`)}
          <li data-place={index} class:over={dragging.over === index}>
            {#if shown === null}
              <div class="empty">Drop one here</div>
            {:else}
              {@render option(shown, true)}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="rest">the rest</p>
    <ul class="tray" data-tray class:over={dragging.over === 'tray'}>
      {#each tray as shown (shown)}
        <li>{@render option(shown, false)}</li>
      {/each}
    </ul>
  </div>
  <DragActions moved={basket.length > 0} {ready} onrestart={restart} onsubmit={submit} />
{:else}
  <GemChoices
    options={q.options}
    {picked}
    {answer}
    {revealed}
    {canAnswer}
    {results}
    onAnswer={() => {}}
  >
    {#snippet label(option: string)}{option}{/snippet}
  </GemChoices>
{/if}

{#snippet option(shown: number, inBasket: boolean)}
  <DragRow
    {dragging}
    {shown}
    name={textOf(shown)}
    gem={gemAt(shown)}
    {movable}
    free
    said={inBasket ? ', in the basket' : ''}
  >
    {textOf(shown)}
    {#snippet extra()}
      {#if inBasket}
        <button
          type="button"
          class="back"
          aria-label="Take {textOf(shown)} out"
          onclick={() => back(shown)}>×</button
        >
      {/if}
    {/snippet}
  </DragRow>
{/snippet}

<style>
  .ask {
    margin: 0 0 0.6rem;
    color: var(--muted);
  }

  .basket,
  .tray {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .basket {
    min-height: 56px;
  }

  .tray {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-height: 56px;
  }

  .basket.over,
  .basket li.over,
  .tray.over {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
    border-radius: min(var(--radius), 8px);
  }

  .empty {
    display: grid;
    align-items: center;
    min-height: 56px;
    padding: 0 0.75rem;
    border: var(--border-width) dashed var(--line);
    border-radius: min(var(--radius), 8px);
    color: var(--muted);
  }

  .rest {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.6rem 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .rest::before,
  .rest::after {
    content: '';
    flex: 1;
    border-top: 1px dashed var(--line);
  }

  .back {
    width: 2rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font-size: 1.25rem;
  }
</style>
