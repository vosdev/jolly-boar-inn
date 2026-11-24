<script lang="ts">
  /**
   * `matching` with `bins`: four to six entries, each sorted into one of two to four bins.
   *
   * `data` is `client_view(payload)` while open and `reveal(payload)` after close, as for
   * `MatchingPairs`: the fields are the entries, the options the bins in the server's
   * shuffle, and the reveal's `answer` the shown bin of each entry. A value is one shown
   * bin per entry, in entry order, and a bin may hold any of them, or none.
   *
   * The bins stand as columns, each a gem, and the entries wait under them as chips. Tap a
   * chip, then a bin; or drag the chip by its handle, the keyboard's too, where the arrows
   * step it through the pool and the bins in turn. A sorted chip moves the same way, back to
   * the pool by a drag. Submit waits for every entry to be sorted. Four bins go two abreast
   * on a phone, so a chip keeps room for its name.
   *
   * An answer not sent goes a second before `ends_at`, unsorted entries in the first bin,
   * since the server takes nothing from `ends_at` on: it scores what it can.
   *
   * The reveal lists each bin with its `detail` and the entries that belong in it; one we
   * put elsewhere fades and says "you: …" under it. An empty bin says "None".
   */
  import { untrack } from 'svelte'

  import { pictureUrl } from '../../../lib/pictures'
  import { emptySlots, type Slots } from '../../../lib/slots'
  import { Dragging, sendBeforeEnd } from '../drag.svelte'
  import DragActions from '../DragActions.svelte'
  import DragLayout from '../DragLayout.svelte'
  import GemButton, { GEMS } from '../GemButton.svelte'
  import type { TypeViewProps } from '../props'

  /** A shown bin per entry, in entry order. */
  type Bins = number[]

  interface Entry {
    text?: string
    /** The picture's name in the client, for an icon entry. */
    picture?: string
  }

  interface Bin {
    text: string
    /** Reveal only, and only if the author gave one. */
    detail?: string
  }

  interface Data {
    fields: Entry[]
    options: Bin[]
    /** Reveal only. */
    answer?: Bins
  }

  let { data, revealed, yourValue, canAnswer, timing, onAnswer }: TypeViewProps<Bins> = $props()

  const q = $derived(data as unknown as Data)
  const gemAt = (index: number) => GEMS[Math.min(index, GEMS.length - 1)] ?? null
  const binName = (shown: number | undefined) => q.options[shown ?? -1]?.text ?? ''
  const entryName = (index: number) => q.fields[index]?.text ?? `Picture ${index + 1}`

  const shownBins = (value: unknown): Bins =>
    Array.isArray(value) ? value.filter((index) => Number.isInteger(index)) : []
  const sent = $derived(shownBins(yourValue))
  const movable = $derived(canAnswer && !revealed && sent.length === 0)

  /** Changes with the entries or bins, not with every new copy of the same question. */
  const shape = $derived(
    JSON.stringify([q.fields.map((entry) => entry.text ?? null), q.options.map((o) => o.text)]),
  )
  /** The shown bin of each entry, null while it waits in the pool. */
  let slots = $derived.by<Slots>(() => {
    void shape
    return untrack(() => emptySlots(q.fields.length))
  })
  /** The entry tapped, waiting for a bin. */
  let picked = $state<number | null>(null)
  $effect(() => {
    void shape
    picked = null
  })
  const board = $derived<Slots>(sent.length > 0 ? sent : slots)
  const pool = $derived(
    q.fields.map((_, index) => index).filter((index) => (board[index] ?? null) === null),
  )
  const inBin = (bin: number): number[] =>
    q.fields.map((_, index) => index).filter((index) => board[index] === bin)
  const ready = $derived(slots.every((bin) => bin !== null))
  const moved = $derived(slots.some((bin) => bin !== null))

  let area: HTMLElement | undefined = $state()

  function put(at: Slots, entry: number, bin: number | null): Slots {
    const next = [...at]
    next[entry] = bin
    return next
  }

  /** One keyboard step: the pool, then each bin in turn. */
  function step(at: Slots, entry: number, by: -1 | 1): Slots {
    const from = at[entry] ?? -1
    const to = Math.min(Math.max(from + by, -1), q.options.length - 1)
    return put(at, entry, to === -1 ? null : to)
  }

  const dragging = new Dragging({
    slots: () => slots,
    set: (next) => (slots = next),
    movable: () => movable,
    drop: put,
    step,
    area: () => area,
    back: (at, entry) => put(at, entry, null),
    sideways: true,
  })

  function pick(entry: number): void {
    if (movable) picked = picked === entry ? null : entry
  }

  function drop(bin: number): void {
    const entry = picked
    if (entry === null || !movable) return
    picked = null
    void dragging.keepScroll(() => (slots = put(slots, entry, bin)))
  }

  function submit(): void {
    if (!ready || sent.length > 0) return
    onAnswer([...slots] as number[])
  }

  function restart(): void {
    dragging.lifted = null
    picked = null
    void dragging.keepScroll(() => (slots = emptySlots(q.fields.length)))
  }

  sendBeforeEnd(
    () => movable,
    () => timing,
    () => slots.map((bin) => bin ?? 0),
    (value) => onAnswer(value as Bins),
  )

  const answer = $derived(revealed ? shownBins(q.answer) : [])
  const belongs = (bin: number): number[] =>
    q.fields.map((_, index) => index).filter((index) => answer[index] === bin)
</script>

{#if revealed && answer.length > 0}
  <ol class="bins" class:four={q.options.length === 4}>
    {#each q.options as bin, index (index)}
      <li class="bin">
        <GemButton tag="div" gem={gemAt(index)} status="correct">
          <span class="text">{bin.text}</span>
          {#if bin.detail}<span class="detail">{bin.detail}</span>{/if}
        </GemButton>
        <ul class="held">
          {#each belongs(index) as entry (entry)}
            {@const had = sent[entry]}
            {@const hit = had === undefined || had === index}
            <li class="chip" class:faded={!hit}>
              {@render label(entry)}
              {#if !hit}
                <span class="had" aria-hidden="true">you: {binName(had)}</span>
                <span class="sr">, you had {binName(had)}</span>
              {/if}
            </li>
          {:else}
            <li class="none">None</li>
          {/each}
        </ul>
      </li>
    {/each}
  </ol>
{:else}
  <DragLayout>
    {#snippet ask()}
      <p class="ask">
        {movable ? 'Tap one, then its bin, or drag it there' : 'Sort each into its bin'}
      </p>
    {/snippet}
    {#snippet list()}
      <div bind:this={area}>
        <ol class="bins" class:four={q.options.length === 4}>
          {#each q.options as bin, index (index)}
            <li class="bin" data-place={index} class:over={dragging.over === index}>
              {#if movable}
                <GemButton
                  gem={gemAt(index)}
                  status="idle"
                  disabled={picked === null}
                  said={picked === null ? '' : `, put ${entryName(picked)} here`}
                  onclick={() => drop(index)}
                >
                  {bin.text}
                </GemButton>
              {:else}
                <GemButton tag="div" gem={gemAt(index)} status="idle">{bin.text}</GemButton>
              {/if}
              <ul class="held">
                {#each inBin(index) as entry (entry)}
                  <li>{@render chip(entry, index)}</li>
                {/each}
              </ul>
            </li>
          {/each}
        </ol>
        {#if pool.length > 0 || movable}
          <ul class="pool" data-tray class:over={dragging.over === 'tray'}>
            {#each pool as entry (entry)}
              <li>{@render chip(entry, null)}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/snippet}
    {#snippet actions()}
      {#if movable}
        <DragActions {moved} {ready} onrestart={restart} onsubmit={submit} />
      {/if}
    {/snippet}
  </DragLayout>
{/if}

{#snippet label(entry: number)}
  {@const field = q.fields[entry] ?? {}}
  {@const src = pictureUrl(field.picture)}
  <span class="label">
    {#if src !== null}
      <img {src} alt={field.text === undefined ? `Picture ${entry + 1}` : ''} />
    {/if}
    {#if field.text !== undefined}
      <span class="name">{field.text}</span>
    {:else if src === null}
      <span class="name">Picture {entry + 1}</span>
    {/if}
  </span>
{/snippet}

{#snippet chip(entry: number, bin: number | null)}
  {@const drag = dragging.drag?.shown === entry ? dragging.drag : null}
  <div
    class="chip"
    role="presentation"
    class:movable
    class:picked={picked === entry}
    class:lifted={dragging.lifted?.shown === entry}
    class:dragged={drag !== null}
    style:translate={drag === null ? undefined : `${drag.dx}px ${drag.dy}px`}
    onpointerdown={(event) => dragging.grab(event, entry)}
    onpointermove={(event) => dragging.follow(event)}
    onpointerup={(event) => dragging.release(event)}
    onpointercancel={() => dragging.letGo()}
  >
    {#if movable}
      <button
        type="button"
        class="pick"
        aria-pressed={picked === entry}
        onclick={() => pick(entry)}
      >
        {@render label(entry)}<span class="sr">{bin === null ? '' : `, in ${binName(bin)}`}</span>
      </button>
      <button
        type="button"
        class="handle"
        data-handle={entry}
        aria-label="Move {entryName(entry)}"
        onkeydown={(event) => dragging.key(event, entry)}
        onblur={(event) => dragging.blur(event, entry)}
      >
        ⠿
      </button>
    {:else}
      {@render label(entry)}
    {/if}
  </div>
{/snippet}

<style>
  .ask {
    margin: 0 0 0.6rem;
    color: var(--muted);
  }

  .bins,
  .held,
  .pool {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bins {
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    align-items: start;
  }

  /* Four columns leave a phone's chip no room for its name. */
  @container (max-width: 30rem) {
    .bins.four {
      grid-auto-flow: row;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .bin {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
    min-height: 7rem;
    align-content: start;
    padding-bottom: 0.4rem;
    border-bottom: var(--border-width) dashed var(--line);
  }

  .pool {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-height: 56px;
    margin-top: 1rem;
  }

  .bin.over,
  .pool.over {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
    border-radius: min(var(--radius), 8px);
  }

  .chip {
    position: relative;
    display: flex;
    align-items: stretch;
    min-width: 0;
    min-height: 48px;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel);
    color: var(--ink);
    font-size: 0.9rem;
    font-weight: 600;
  }

  .held .chip,
  .held .none {
    padding: 0.35rem 0.5rem;
  }

  .held .chip.movable {
    padding: 0;
  }

  .chip.picked {
    outline: 3px solid var(--accent);
    outline-offset: 1px;
  }

  .chip.faded {
    flex-direction: column;
    border-style: dashed;
    color: var(--muted);
    font-weight: 400;
  }

  .label {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .label img {
    width: 2.5rem;
    height: 2.5rem;
    object-fit: contain;
  }

  .pick {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
  }

  .handle {
    flex: none;
    width: 2rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font-size: 1.1rem;
    cursor: grab;
    /* The handle drags; the rest of the chip is tapped. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .lifted,
  .dragged {
    z-index: 1;
    scale: 1.03;
    box-shadow: var(--shadow);
  }

  .dragged,
  .dragged .handle {
    cursor: grabbing;
  }

  .text {
    display: block;
  }

  .detail {
    display: block;
    font-size: 0.8rem;
    font-weight: 400;
  }

  .had {
    font-size: 0.8rem;
  }

  .none {
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
