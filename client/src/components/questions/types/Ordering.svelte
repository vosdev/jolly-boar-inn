<script lang="ts" module>
  /** Each place's number in an order where equal ranks tie: 1, 2, 2, 4. */
  export function placeNumbers(ranks: number[]): number[] {
    return ranks.map((rank) => ranks.indexOf(rank) + 1)
  }

  /** How many places of `credit` were right, out of `count`. */
  export function inPlace(credit: number, count: number): number {
    return Math.round(credit * count)
  }
</script>

<script lang="ts">
  /**
   * `ordering`: three to six entries, put in order by tapping them first to last.
   *
   * `data` arrives in the two shapes `questions/types/ordering.py` sends:
   *
   * - while open, `client_view(payload)`: the prompt, `ends` and the entries, shuffled
   *   the same way for everyone.
   * - after close, `reveal(payload)`: the same entries with each `rank` and `detail`, and
   *   `answer`, the shown positions in the right order.
   *
   * A value is the shown positions in the order they were tapped. Tapping is the whole
   * answer rather than a fallback for dragging: one tap per entry works one-thumbed on a
   * phone and from a keyboard, and every entry stays where it was shown, on the gem of its
   * position (design section 3), with its number in the corner box. A placed entry is
   * held, and the rewind button starts over. Submit waits for every entry.
   *
   * The reveal lists the entries in the right order, numbered so that ties share a
   * number, each with its `detail`. One we put in its place stays lit; one we did not
   * fades and says where we had it, which is the verdict without a colour.
   */
  import { SvelteMap } from 'svelte/reactivity'

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
    /** Reveal only. */
    answer?: Positions
  }

  let { data, revealed, yourValue, canAnswer, result, onAnswer }: TypeViewProps<Positions> =
    $props()

  const q = $derived(data as unknown as Data)
  const gemAt = (index: number) => GEMS[Math.min(index, GEMS.length - 1)] ?? null

  /** Shown position to the number we gave it, while choosing. */
  const tapped = new SvelteMap<number, number>()

  const positions = (value: unknown): Positions =>
    Array.isArray(value) ? value.filter((index) => Number.isInteger(index)) : []
  const sent = $derived(positions(yourValue))
  /** Shown position to its number in what we sent. */
  const ours = $derived(new Map(sent.map((shown, index) => [shown, index + 1])))
  const ready = $derived(tapped.size === q.entries.length)

  function place(shown: number): void {
    if (!tapped.has(shown)) tapped.set(shown, tapped.size + 1)
  }

  function submit(): void {
    if (!ready || sent.length > 0) return
    onAnswer([...tapped].sort((a, b) => a[1] - b[1]).map(([shown]) => shown))
  }

  const answer = $derived(revealed ? positions(q.answer) : [])
  const numbers = $derived(placeNumbers(answer.map((shown) => q.entries[shown]?.rank ?? 0)))
  /** Whether what we put at `number` has the rank that belongs there. */
  function placedRight(shown: number): boolean {
    const had = ours.get(shown)
    if (had === undefined) return true
    return q.entries[answer[had - 1] ?? -1]?.rank === q.entries[shown]?.rank
  }
  const yourCount = $derived(
    result != null && answer.length > 0 ? inPlace(result.credit, answer.length) : null,
  )
</script>

{#if revealed && answer.length > 0}
  {#if yourCount !== null}
    <p class="ask">You had {yourCount} of {answer.length} in place</p>
  {/if}
  <p class="end">{q.ends[0]}</p>
  <ol class="entries">
    {#each answer as shown, index (shown)}
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
  <p class="end">{q.ends[1]}</p>
{:else}
  <p class="ask">Tap in order: {q.ends[0]} → {q.ends[1]}</p>
  <ol class="entries">
    {#each q.entries as entry, shown (shown)}
      {@const number = sent.length > 0 ? ours.get(shown) : tapped.get(shown)}
      <li>
        <GemButton
          gem={gemAt(shown)}
          status="idle"
          place={canAnswer ? (number ?? null) : undefined}
          said={number === undefined ? '' : `, number ${number}`}
          disabled={revealed || !canAnswer || sent.length > 0 || number !== undefined}
          onclick={() => place(shown)}
        >
          {entry.text}
        </GemButton>
      </li>
    {/each}
  </ol>
  {#if canAnswer && !revealed && sent.length === 0}
    <div class="actions">
      <button
        type="button"
        class="rewind"
        aria-label="Start over"
        title="Start over"
        disabled={tapped.size === 0}
        onclick={() => tapped.clear()}>↺</button
      >
      <button type="button" class="primary submit" disabled={!ready} onclick={submit}>
        Submit
      </button>
    </div>
  {/if}
{/if}

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
