<script lang="ts">
  /**
   * `matching`: three to six fields, and an option dragged onto each from the tray below.
   *
   * `data` arrives in the two shapes `questions/types/matching.py` sends:
   *
   * - while open, `client_view(payload)`: the fields in the author's order, each a name, a
   *   picture or both, and the options in the server's seeded shuffle.
   * - after close, `reveal(payload)`: the same with each option's `detail`, and `answer`,
   *   the shown position of the option that belongs on each field.
   *
   * A value is one shown position per field, in field order. The fields start empty and
   * Submit waits for every one to fill; options beyond the fields are decoys and stay in
   * the tray. Options move as `drag.svelte.ts` says, by pointer or keyboard, sideways as
   * well, and keep their gem wherever they go. A drop on a filled field swaps the two, or
   * sends the one there back to the tray if the new one came from it. A placed option's ×
   * sends it back, and the rewind button empties every field. A field that is a picture
   * alone is "Picture N" to a screen reader.
   *
   * An answer not sent goes a second before `ends_at`, empty fields filled from the top of
   * the tray, since the server takes nothing from `ends_at` on: it scores what it can.
   *
   * The reveal puts the right option on each field, lit with its `detail`; where we had
   * another, it fades and says "you: …" under it. The decoys follow as "Left over".
   */
  import { untrack } from 'svelte'

  import { pictureUrl } from '../../../lib/pictures'
  import {
    emptySlots,
    filled,
    stepped,
    swapAt,
    toTray,
    trayOf,
    type Slots,
  } from '../../../lib/slots'
  import { Dragging, sendBeforeEnd } from '../drag.svelte'
  import DragActions from '../DragActions.svelte'
  import DragLayout from '../DragLayout.svelte'
  import DragRow from '../DragRow.svelte'
  import GemButton, { GEMS } from '../GemButton.svelte'
  import type { TypeViewProps } from '../props'

  /** A shown option position per field, in field order. */
  type Positions = number[]

  interface Field {
    text?: string
    /** The picture's name in the client, for an icon field. */
    picture?: string
  }

  interface Option {
    text: string
    /** Reveal only, and only if the author gave one. */
    detail?: string
  }

  interface Data {
    fields: Field[]
    options: Option[]
    /** Reveal only. */
    answer?: Positions
  }

  let { data, revealed, yourValue, canAnswer, timing, onAnswer }: TypeViewProps<Positions> =
    $props()

  const q = $derived(data as unknown as Data)
  const gemAt = (index: number) => GEMS[Math.min(index, GEMS.length - 1)] ?? null
  const textOf = (shown: number) => q.options[shown]?.text ?? ''
  const fieldName = (index: number) => q.fields[index]?.text ?? `Picture ${index + 1}`

  const positions = (value: unknown): Positions =>
    Array.isArray(value) ? value.filter((index) => Number.isInteger(index)) : []
  const sent = $derived(positions(yourValue))
  const movable = $derived(canAnswer && !revealed && sent.length === 0)
  const decoys = $derived(q.options.length - q.fields.length)

  /** Changes with the fields or options, not with every new copy of the same question. */
  const shape = $derived(
    JSON.stringify([q.fields.map((field) => field.text ?? null), q.options.map((o) => o.text)]),
  )
  let slots = $derived.by<Slots>(() => {
    void shape
    return untrack(() => emptySlots(q.fields.length))
  })
  const board = $derived<Slots>(sent.length > 0 ? sent : slots)
  const tray = $derived(trayOf(board, q.options.length))
  const ready = $derived(slots.every((shown) => shown !== null))
  const moved = $derived(slots.some((shown) => shown !== null))

  let area: HTMLElement | undefined = $state()

  const dragging = new Dragging({
    slots: () => slots,
    set: (next) => (slots = next),
    movable: () => movable,
    drop: swapAt,
    step: (from, shown, by) => stepped(from, shown, by, true, swapAt),
    area: () => area,
  })

  function submit(): void {
    if (!ready || sent.length > 0) return
    onAnswer([...slots] as number[])
  }

  function restart(): void {
    slots = emptySlots(q.fields.length)
    dragging.lifted = null
  }

  function back(shown: number): void {
    slots = toTray(slots, shown)
  }

  sendBeforeEnd(
    () => movable,
    () => timing,
    () => filled(slots, q.options.length),
    (value) => onAnswer(value as Positions),
  )

  const answer = $derived(revealed ? positions(q.answer) : [])
  const leftOver = $derived(trayOf(answer, q.options.length))
</script>

{#if revealed && answer.length > 0}
  <ol class="fields">
    {#each q.fields as field, index (index)}
      {@const right = answer[index] ?? 0}
      {@const had = sent[index]}
      {@const hit = had === undefined || had === right}
      {@const detail = q.options[right]?.detail}
      <li class="field">
        {@render label(field, index)}
        <div class="slot">
          <GemButton
            tag="div"
            gem={gemAt(right)}
            status={hit ? 'correct' : 'faded'}
            said={hit ? '' : `, you had ${textOf(had)}`}
          >
            <span class="text">{textOf(right)}</span>
            {#if detail}<span class="detail">{detail}</span>{/if}
          </GemButton>
          {#if !hit}<p class="had" aria-hidden="true">you: {textOf(had)}</p>{/if}
        </div>
      </li>
    {/each}
  </ol>
  {#if leftOver.length > 0}
    <p class="left">Left over: {leftOver.map(textOf).join(', ')}</p>
  {/if}
{:else}
  <DragLayout>
    {#snippet ask()}
      <p class="ask">
        Drag one onto each{decoys > 0 ? `; ${decoys} will be left over` : ''}
      </p>
    {/snippet}
    {#snippet list()}
      {#if canAnswer}
        <div bind:this={area}>
          <ol class="fields">
            {#each q.fields as field, index (index)}
              {@const shown = board[index] ?? null}
              <li class="field" data-place={index} class:over={dragging.over === index}>
                {@render label(field, index)}
                <div class="slot">
                  {#if shown === null}
                    <div class="empty"><span class="sr">{`${fieldName(index)}, `}</span>empty</div>
                  {:else}
                    {@render option(shown, index)}
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
          <ul class="tray" data-tray class:over={dragging.over === 'tray'}>
            {#each tray as shown (shown)}
              <li>{@render option(shown, undefined)}</li>
            {/each}
          </ul>
        </div>
      {:else}
        <ol class="fields">
          {#each q.fields as field, index (index)}
            <li class="field">
              {@render label(field, index)}
              <div class="empty">empty</div>
            </li>
          {/each}
        </ol>
        <ul class="tray">
          {#each q.options as option, shown (shown)}
            <li><GemButton tag="div" gem={gemAt(shown)} status="idle">{option.text}</GemButton></li>
          {/each}
        </ul>
      {/if}
    {/snippet}
    {#snippet actions()}
      {#if movable}
        <DragActions {moved} {ready} onrestart={restart} onsubmit={submit} />
      {/if}
    {/snippet}
  </DragLayout>
{/if}

{#snippet label(field: Field, index: number)}
  {@const src = pictureUrl(field.picture)}
  <div class="label">
    {#if src !== null}
      <img {src} alt={field.text === undefined ? `Picture ${index + 1}` : ''} />
    {/if}
    {#if field.text !== undefined}
      <span>{field.text}</span>
    {:else if src === null}
      <span>Picture {index + 1}</span>
    {/if}
  </div>
{/snippet}

{#snippet option(shown: number, at: number | undefined)}
  <DragRow
    {dragging}
    {shown}
    name={textOf(shown)}
    gem={gemAt(shown)}
    {movable}
    free
    said={at === undefined ? '' : `, on ${fieldName(at)}`}
  >
    {textOf(shown)}
    {#snippet extra()}
      {#if movable && at !== undefined}
        <button
          type="button"
          class="back"
          aria-label="Take {textOf(shown)} off"
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

  .fields,
  .tray {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .field {
    display: grid;
    grid-template-columns: minmax(4.5rem, 35%) 1fr;
    align-items: center;
    gap: 0.5rem;
  }

  .label {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .label img {
    width: 3.5rem;
    height: 3.5rem;
    object-fit: contain;
  }

  .slot {
    min-width: 0;
  }

  .tray {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-height: 56px;
    margin-top: 1rem;
  }

  .fields li.over .slot,
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

  .back {
    width: 2rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font-size: 1.25rem;
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
    margin: 0.2rem 0 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .left {
    margin: 0.75rem 0 0;
    color: var(--muted);
  }
</style>
