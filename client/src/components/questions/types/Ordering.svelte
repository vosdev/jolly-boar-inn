<script lang="ts" module>
  import { emptySlots, filled as fill, stepped as steppedBy, type Slots } from '../../../lib/slots'

  /** Each place's number in an order where equal ranks tie: 1, 2, 2, 4. */
  export function placeNumbers(ranks: number[]): number[] {
    return ranks.map((rank) => ranks.indexOf(rank) + 1)
  }

  /** How many places of `credit` were right, out of `count`. */
  export function inPlace(credit: number, count: number): number {
    return Math.round(credit * count)
  }

  /**
   * A value against a `picks` reveal: places holding their rank, and picks that belong
   * among the picked but sit elsewhere, which earn half. Credit cannot tell one in place
   * and two halves from two in place, so this reads the value, as the server grades it.
   */
  export function placement(
    reveal: Record<string, unknown>,
    value: unknown,
  ): { inPlace: number; outOfPlace: number } {
    const entries = (reveal.entries as { rank?: number }[] | undefined) ?? []
    const picks = Number(reveal.picks)
    const ranks = entries.map((entry) => entry.rank ?? 0)
    const wanted = [...ranks].sort((a, b) => a - b).slice(0, picks)
    const cut = wanted[wanted.length - 1] ?? -Infinity
    let placed = 0
    let elsewhere = 0
    ;(Array.isArray(value) ? (value as number[]) : []).forEach((shown, index) => {
      const rank = ranks[shown]
      if (rank === undefined) return
      if (rank === wanted[index]) placed += 1
      else if (rank <= cut) elsewhere += 1
    })
    return { inPlace: placed, outOfPlace: elsewhere }
  }

  /** Every entry in its shown order, or `picks` empty places to fill from the tray. */
  export function startingSlots(entries: number, picks?: number): Slots {
    return picks === undefined
      ? Array.from({ length: entries }, (_, shown) => shown)
      : emptySlots(picks)
  }

  /**
   * `shown` put at place `at`, from another place or the tray. A filled place makes room by
   * moving the rows between it and the nearest empty place, below first; with none, the
   * last row goes back to the tray.
   */
  export function dropAt(slots: Slots, shown: number, at: number): Slots {
    const next = [...slots]
    const from = next.indexOf(shown)
    if (from === at) return next
    if (from !== -1) next[from] = null
    if (next[at] !== null) {
      let gap = next.indexOf(null, at)
      if (gap === -1) gap = next.lastIndexOf(null, at)
      if (gap === -1) gap = next.length - 1
      const by = gap > at ? -1 : 1
      for (let k = gap; k !== at; k += by) next[k] = next[k + by] ?? null
    }
    next[at] = shown
    return next
  }

  /** One keyboard step, up (-1) or down (1); up from the tray it lands as a drop does. */
  export function stepped(slots: Slots, shown: number, by: -1 | 1, tray: boolean): Slots {
    return steppedBy(slots, shown, by, tray, dropAt)
  }

  /** The order to send when time runs out: empty places take the tray's rows, top first. */
  export function filled(slots: Slots, entries: number): number[] {
    return fill(slots, entries)
  }
</script>

<script lang="ts">
  /**
   * `ordering`: three to six entries, put in order by dragging them by their handles.
   *
   * `data` arrives in the two shapes `questions/types/ordering.py` sends:
   *
   * - while open, `client_view(payload)`: the prompt, `ends` and the entries, shuffled
   *   the same way for everyone, and `picks` if only that many are to be ordered.
   * - after close, `reveal(payload)`: the same entries with each `rank` and `detail`, and
   *   `answer`, the shown positions in the right order.
   *
   * A value is the shown positions, first end first. Without `picks` the entries start as
   * shown, so Submit works at once. With it, `picks` numbered places start empty over a
   * tray of every entry, and Submit waits for them to fill. A row in a place has no number:
   * the list already says it. Rows move as `drag.svelte.ts` says, by pointer or keyboard,
   * and keep their gem wherever they go, so the colour names the entry. A drop on a
   * filled place pushes the rows under it down, and one pushed past the last goes back to
   * the tray. The rewind button starts over.
   *
   * An order not sent goes a second before `ends_at`, empty places filled from the tray's
   * top, since the server takes nothing from `ends_at` on: it scores what it can.
   *
   * The reveal lists the entries in the right order, numbered so that ties share a
   * number, each with its `detail`; with `picks` only that many, and any tied with the
   * last of them. One we put in its place stays lit; one we put elsewhere fades and says
   * where we had it, which is the verdict without a colour, and one we left out fades.
   */
  import { untrack } from 'svelte'

  import { trayOf } from '../../../lib/slots'
  import { Dragging, sendBeforeEnd } from '../drag.svelte'
  import DragActions from '../DragActions.svelte'
  import DragLayout from '../DragLayout.svelte'
  import DragRow from '../DragRow.svelte'
  import GemButton, { GEMS } from '../GemButton.svelte'
  import type { TypeViewProps } from '../props'

  /** Shown positions, first end first. */
  type Positions = number[]

  interface Entry {
    text: string
    /** Reveal only. */
    rank?: number
    /** Reveal only, and only if the author gave one. */
    detail?: string
  }

  interface Data {
    ends: [string, string]
    entries: Entry[]
    /** How many to order, from the first end; every entry if absent. */
    picks?: number
    /** Reveal only. */
    answer?: Positions
  }

  let { data, revealed, yourValue, canAnswer, result, timing, onAnswer }: TypeViewProps<Positions> =
    $props()

  const q = $derived(data as unknown as Data)
  const gemAt = (index: number) => GEMS[Math.min(index, GEMS.length - 1)] ?? null
  const textOf = (shown: number) => q.entries[shown]?.text ?? ''

  const positions = (value: unknown): Positions =>
    Array.isArray(value) ? value.filter((index) => Number.isInteger(index)) : []
  const sent = $derived(positions(yourValue))
  /** Shown position to its number in what we sent. */
  const ours = $derived(new Map(sent.map((shown, index) => [shown, index + 1])))
  const places = $derived(q.picks ?? q.entries.length)
  const movable = $derived(canAnswer && !revealed && sent.length === 0)

  const start = $derived(startingSlots(q.entries.length, q.picks))
  /** Changes with the entries or `picks`, not with every new copy of the same question. */
  const shape = $derived(JSON.stringify([q.entries.map((entry) => entry.text), q.picks ?? null]))
  let slots = $derived.by<Slots>(() => {
    void shape
    return untrack(() => startingSlots(q.entries.length, q.picks))
  })
  const board = $derived<Slots>(sent.length > 0 ? sent : slots)
  const tray = $derived(trayOf(board, q.entries.length))
  const ready = $derived(slots.every((shown) => shown !== null))
  const moved = $derived(slots.some((shown, index) => shown !== start[index]))

  let area: HTMLElement | undefined = $state()

  const dragging = new Dragging({
    slots: () => slots,
    set: (next) => (slots = next),
    movable: () => movable,
    drop: dropAt,
    step: (from, shown, by) => stepped(from, shown, by, q.picks !== undefined),
    area: () => area,
  })

  function submit(): void {
    if (!ready || sent.length > 0) return
    onAnswer([...slots] as number[])
  }

  function restart(): void {
    slots = [...start]
    dragging.lifted = null
  }

  sendBeforeEnd(
    () => movable,
    () => timing,
    () => filled(slots, q.entries.length),
    (value) => onAnswer(value as Positions),
  )

  const rankAt = (shown: number | undefined) => q.entries[shown ?? -1]?.rank
  const answer = $derived(revealed ? positions(q.answer) : [])
  /** The places played, and any entry tied with the last of them. */
  const shownAnswer = $derived(
    answer.filter((shown, index) => index < places || rankAt(shown) === rankAt(answer[places - 1])),
  )
  const numbers = $derived(placeNumbers(answer.map(rankAt).map((rank) => rank ?? 0)))
  /** Whether it is lit: ours in a place of its rank, or any, if we sent nothing. */
  function placedRight(shown: number): boolean {
    const had = ours.get(shown)
    if (had === undefined) return sent.length === 0
    return rankAt(answer[had - 1]) === rankAt(shown)
  }
  const verdict = $derived.by(() => {
    if (result == null || answer.length === 0) return null
    if (q.picks === undefined)
      return `You had ${inPlace(result.credit, places)} of ${places} in place`
    const { inPlace: placed, outOfPlace } = placement(data, result.value)
    return `You had ${placed} of ${places} in place${outOfPlace > 0 ? `, ${outOfPlace} out of place` : ''}`
  })
</script>

{#if revealed && answer.length > 0}
  {#if verdict !== null}
    <p class="ask">{verdict}</p>
  {/if}
  <p class="end">{q.ends[0]}</p>
  <ol class="entries">
    {#each shownAnswer as shown, index (shown)}
      {@const entry = q.entries[shown]}
      {@const right = placedRight(shown)}
      {@const had = ours.get(shown)}
      <li>
        <GemButton
          gem={gemAt(shown)}
          status={right ? 'correct' : 'faded'}
          place={numbers[index] ?? index + 1}
          said={right || had === undefined ? '' : `, you had it at ${had}`}
          disabled
          onclick={() => {}}
        >
          <span class="text">{entry?.text}</span>
          {#if entry?.detail}<span class="detail">{entry.detail}</span>{/if}
          {#if !right && had !== undefined}<span class="had" aria-hidden="true">you: {had}</span
            >{/if}
        </GemButton>
      </li>
    {/each}
  </ol>
  {#if q.picks === undefined}<p class="end">{q.ends[1]}</p>{/if}
{:else}
  <DragLayout>
    {#snippet ask()}
      <p class="ask">
        Drag {q.picks === undefined ? '' : `${q.picks} `}into order: {q.ends[0]} → {q.ends[1]}
      </p>
    {/snippet}
    {#snippet list()}
      {#if canAnswer}
        <div bind:this={area}>
          <ol class="entries">
            {#each board as shown, index (shown ?? `empty ${index}`)}
              <li data-place={index} class:over={dragging.over === index}>
                {#if shown === null}
                  <div class="empty">
                    <span class="sr">Place </span>{index + 1}<span class="sr">, empty</span>
                  </div>
                {:else}
                  {@render row(shown, index + 1)}
                {/if}
              </li>
            {/each}
          </ol>
          {#if q.picks !== undefined}
            <p class="rest">the rest</p>
            <ul class="entries tray" data-tray class:over={dragging.over === 'tray'}>
              {#each tray as shown (shown)}
                <li>{@render row(shown, undefined)}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else}
        <ol class="entries">
          {#each q.entries as entry, shown (shown)}
            <li>
              <GemButton tag="div" gem={gemAt(shown)} status="idle">{entry.text}</GemButton>
            </li>
          {/each}
        </ol>
      {/if}
    {/snippet}
    {#snippet actions()}
      {#if movable}
        <DragActions {moved} {ready} onrestart={restart} onsubmit={submit} />
      {/if}
    {/snippet}
  </DragLayout>
{/if}

{#snippet row(shown: number, place: number | undefined)}
  <DragRow
    {dragging}
    {shown}
    name={textOf(shown)}
    gem={gemAt(shown)}
    {movable}
    said={place === undefined ? '' : `, place ${place}`}
  >
    {textOf(shown)}
  </DragRow>
{/snippet}

<style>
  .ask {
    margin: 0 0 0.6rem;
    color: var(--muted);
  }

  .entries {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .end {
    margin: 0.3rem 0;
    color: var(--muted);
    font-size: 0.85rem;
    text-align: center;
  }

  .entries li.over,
  .tray.over {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
    border-radius: min(var(--radius), 8px);
  }

  .empty {
    display: grid;
    place-items: center;
    min-height: 56px;
    border: var(--border-width) dashed var(--line);
    border-radius: min(var(--radius), 8px);
    color: var(--muted);
    font-family: var(--font-numeric);
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

  .detail,
  .had {
    margin-left: 0.4rem;
    font-size: 0.8rem;
    font-weight: 400;
  }

  .had {
    padding: 0 0.35rem;
    border: 1px solid currentColor;
    border-radius: 999px;
  }
</style>
