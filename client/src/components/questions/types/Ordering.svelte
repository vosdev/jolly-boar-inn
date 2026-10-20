<script lang="ts" module>
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

  /** The places while ordering: the shown position at each, first end first, or null while empty. */
  export type Slots = (number | null)[]

  /** Every entry in its shown order, or `picks` empty places to fill from the tray. */
  export function startingSlots(entries: number, picks?: number): Slots {
    return picks === undefined
      ? Array.from({ length: entries }, (_, shown) => shown)
      : Array.from({ length: picks }, () => null)
  }

  /** The entries in no place, in their shown order. */
  export function trayOf(slots: Slots, entries: number): number[] {
    return Array.from({ length: entries }, (_, shown) => shown).filter(
      (shown) => !slots.includes(shown),
    )
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

  /** `shown` back to the tray, leaving its place empty. */
  export function toTray(slots: Slots, shown: number): Slots {
    return slots.map((at) => (at === shown ? null : at))
  }

  /**
   * One keyboard step, up (-1) or down (1): past its neighbour, down from the last place
   * into the tray if there is one, or up from the tray into the last place.
   */
  export function stepped(slots: Slots, shown: number, by: -1 | 1, tray: boolean): Slots {
    const from = slots.indexOf(shown)
    if (from === -1) return by === -1 ? dropAt(slots, shown, slots.length - 1) : slots
    const to = from + by
    if (to < 0) return slots
    if (to >= slots.length) return tray ? toTray(slots, shown) : slots
    const next = [...slots]
    next[from] = next[to] ?? null
    next[to] = shown
    return next
  }

  /** The order to send when time runs out: empty places take the tray's rows, top first. */
  export function filled(slots: Slots, entries: number): number[] {
    const rest = trayOf(slots, entries)
    return slots.map((shown) => shown ?? (rest.shift() as number))
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
   * the list already says it. A mouse drags the whole row, a finger only the handle. A row keeps its gem
   * wherever it goes, so the colour names the entry. A drop on a filled place pushes the
   * rows under it down, and one pushed past the last goes back to the tray. The handle is
   * a button for the keyboard: Space lifts the row, the arrows move it, Space drops it and
   * Escape puts it back; each move is announced. The rewind button starts over.
   *
   * An order not sent goes a second before `ends_at`, empty places filled from the tray's
   * top, since the server takes nothing from `ends_at` on: it scores what it can.
   *
   * The reveal lists the entries in the right order, numbered so that ties share a
   * number, each with its `detail`; with `picks` only that many, and any tied with the
   * last of them. One we put in its place stays lit; one we put elsewhere fades and says
   * where we had it, which is the verdict without a colour, and one we left out fades.
   */
  import { tick, untrack } from 'svelte'
  import { get } from 'svelte/store'

  import { msUntil } from '../../../lib/clock'
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

  /** How long before `ends_at` an unsent order goes, to land before the server stops taking it. */
  const EARLY_MS = 1000
  /** How close to the window's edge a dragged row scrolls the page. */
  const EDGE_PX = 48

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

  /** The row the keyboard holds, and the places as they were when it was lifted. */
  let lifted = $state<{ shown: number; before: Slots } | null>(null)
  /** The row under a pointer, and how far it has come. */
  let drag = $state<{ shown: number; pointer: number; startY: number; dy: number } | null>(null)
  /** Where the dragged row would land. */
  let over = $state<number | 'tray' | null>(null)
  /** What the live region last said. */
  let news = $state('')
  let area: HTMLElement | undefined = $state()

  const whereIs = (shown: number) => {
    const at = slots.indexOf(shown)
    return at === -1 ? 'with the rest' : `place ${at + 1} of ${places}`
  }

  function submit(): void {
    if (!ready || sent.length > 0) return
    onAnswer([...slots] as number[])
  }

  function restart(): void {
    slots = [...start]
    lifted = null
    news = 'Started over'
  }

  $effect(() => {
    if (!movable || timing === undefined) return
    const left = msUntil(timing.endsAt, get(timing.now))
    if (left === 0) return
    const timer = setTimeout(
      () =>
        onAnswer(
          filled(
            untrack(() => slots),
            q.entries.length,
          ),
        ),
      Math.max(0, left - EARLY_MS),
    )
    return () => clearTimeout(timer)
  })

  /** Moving a row between the places and the tray redraws its handle, which loses focus. */
  async function refocus(shown: number): Promise<void> {
    await tick()
    area?.querySelector<HTMLElement>(`[data-handle="${shown}"]`)?.focus()
  }

  function key(event: KeyboardEvent, shown: number): void {
    const name = textOf(shown)
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (lifted?.shown === shown) {
        lifted = null
        news = `${name} dropped, ${whereIs(shown)}`
      } else {
        lifted = { shown, before: [...slots] }
        news = `${name} lifted, ${whereIs(shown)}. Up and down move it, space drops it, escape puts it back.`
      }
    } else if (lifted?.shown === shown && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      slots = stepped(slots, shown, event.key === 'ArrowUp' ? -1 : 1, q.picks !== undefined)
      news = `${name}, ${whereIs(shown)}`
      void refocus(shown)
    } else if (lifted?.shown === shown && event.key === 'Escape') {
      event.preventDefault()
      slots = lifted.before
      lifted = null
      news = `${name} put back, ${whereIs(shown)}`
      void refocus(shown)
    }
  }

  /** The place or the tray nearest `y`, a viewport coordinate. */
  function targetAt(y: number): number | 'tray' | null {
    let best: number | 'tray' | null = null
    let distance = Infinity
    for (const element of area?.querySelectorAll<HTMLElement>('[data-place], [data-tray]') ?? []) {
      const { top, bottom } = element.getBoundingClientRect()
      const off = y < top ? top - y : y > bottom ? y - bottom : 0
      if (off < distance) {
        distance = off
        best = element.dataset.place === undefined ? 'tray' : Number(element.dataset.place)
      }
    }
    return best
  }

  /** A mouse drags the whole row; a finger only the handle, so the rest still scrolls. */
  function grab(event: PointerEvent, shown: number): void {
    if (!movable || event.button !== 0) return
    if (event.pointerType !== 'mouse' && (event.target as Element).closest('.handle') === null)
      return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    lifted = null
    drag = { shown, pointer: event.pointerId, startY: event.clientY + window.scrollY, dy: 0 }
  }

  function follow(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointer) return
    if (event.clientY < EDGE_PX) window.scrollBy(0, -EDGE_PX / 4)
    else if (event.clientY > window.innerHeight - EDGE_PX) window.scrollBy(0, EDGE_PX / 4)
    drag.dy = event.clientY + window.scrollY - drag.startY
    over = targetAt(event.clientY)
  }

  function release(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointer) return
    const { shown } = drag
    const target = targetAt(event.clientY)
    drag = null
    over = null
    if (target === 'tray') slots = toTray(slots, shown)
    else if (target !== null) slots = dropAt(slots, shown, target)
    news = `${textOf(shown)}, ${whereIs(shown)}`
  }

  function letGo(): void {
    drag = null
    over = null
  }

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
  <p class="ask">
    Drag {q.picks === undefined ? '' : `${q.picks} `}into order: {q.ends[0]} → {q.ends[1]}
  </p>
  {#if canAnswer}
    <div bind:this={area}>
      <ol class="entries">
        {#each board as shown, index (shown ?? `empty ${index}`)}
          <li data-place={index} class:over={over === index}>
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
        <ul class="entries tray" data-tray class:over={over === 'tray'}>
          {#each tray as shown (shown)}
            <li>{@render row(shown, undefined)}</li>
          {/each}
        </ul>
      {/if}
    </div>
    <p class="sr" aria-live="polite">{news}</p>
  {:else}
    <ol class="entries">
      {#each q.entries as entry, shown (shown)}
        <li>
          <GemButton tag="div" gem={gemAt(shown)} status="idle">{entry.text}</GemButton>
        </li>
      {/each}
    </ol>
  {/if}
  {#if movable}
    <div class="actions">
      <button
        type="button"
        class="rewind"
        aria-label="Start over"
        title="Start over"
        disabled={!moved}
        onclick={restart}>↺</button
      >
      <button type="button" class="primary submit" disabled={!ready} onclick={submit}>
        Submit
      </button>
    </div>
  {/if}
{/if}

{#snippet row(shown: number, place: number | undefined)}
  {@const name = textOf(shown)}
  <!-- The handle is the row's control for the keyboard and a screen reader; a mouse may
       take the row anywhere as well. -->
  <div
    class="row"
    role="presentation"
    class:movable
    class:lifted={lifted?.shown === shown}
    class:dragged={drag?.shown === shown}
    style:translate={drag?.shown === shown ? `0 ${drag.dy}px` : undefined}
    onpointerdown={(event) => grab(event, shown)}
    onpointermove={follow}
    onpointerup={release}
    onpointercancel={letGo}
  >
    <GemButton
      tag="div"
      gem={gemAt(shown)}
      status="idle"
      said={place === undefined ? '' : `, place ${place}`}
    >
      {name}
      {#snippet end()}
        {#if movable}
          <button
            type="button"
            class="handle"
            data-handle={shown}
            aria-label="Move {name}"
            onkeydown={(event) => key(event, shown)}
            onblur={(event) => {
              if (lifted?.shown === shown && event.relatedTarget !== null) lifted = null
            }}>⠿</button
          >
        {/if}
      {/snippet}
    </GemButton>
  </div>
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

  .row {
    position: relative;
  }

  /* Picked up: the theme's shadow alone is too faint to say so. */
  .lifted,
  .dragged {
    z-index: 1;
    scale: 1.03;
    box-shadow: var(--shadow);
    border-radius: min(var(--radius), 8px);
  }

  .handle {
    width: 2.5rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font-size: 1.25rem;
    cursor: grab;
    /* The handle drags; the rest of the row still scrolls the page under a thumb. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .row.movable {
    user-select: none;
    -webkit-user-select: none;
  }

  @media (pointer: fine) {
    .row.movable {
      cursor: grab;
    }
  }

  .dragged,
  .dragged .handle {
    cursor: grabbing;
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

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .rewind {
    flex: none;
    width: 56px;
    min-height: 56px;
    font-size: 1.5rem;
  }

  .submit {
    flex: 1;
    min-height: 56px;
  }
</style>
