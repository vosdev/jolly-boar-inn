<script lang="ts">
  /**
   * `pick_all_that_apply`: three to six written answers, and any number of them right.
   *
   * `data` arrives in the two shapes `questions/types/pick_all_that_apply.py` sends:
   *
   * - while open, `client_view(payload)`: the prompt, the options and, if the author set
   *   one, `picks`, how many to tick.
   * - after close, `reveal(payload)`: the same plus `answer_indices`.
   *
   * A tap ticks an option rather than answering, so the gems carry a box in the corner and
   * nothing fades until Submit sends the ticks. With `picks`, Submit waits for exactly that
   * many and the unticked gems are held once it is reached. Once sent, it behaves as one
   * pick does in `multiple_choice`: ours lit with a "you", the rest faded. The reveal
   * lights every right option and keeps the "you" on each of ours, so a lit gem without
   * one is a right answer we missed.
   */
  import { SvelteSet } from 'svelte/reactivity'

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

  let { data, revealed, yourValue, canAnswer, onAnswer }: TypeViewProps<Indices> = $props()

  const q = $derived(data as unknown as Data)
  const ticked = new SvelteSet<number>()

  const indices = (value: unknown): Indices =>
    Array.isArray(value) ? value.filter((index) => Number.isInteger(index)) : []
  const answer = $derived(new Set(revealed ? indices(q.answer_indices) : []))
  const picked = $derived(new Set(indices(yourValue)))
  const sent = $derived(picked.size > 0)
  const full = $derived(q.picks !== undefined && ticked.size >= q.picks)
  const ready = $derived(q.picks === undefined ? ticked.size > 0 : ticked.size === q.picks)

  function toggle(index: number): void {
    if (ticked.has(index)) ticked.delete(index)
    else if (!full) ticked.add(index)
  }

  function submit(): void {
    if (ready && !sent) onAnswer([...ticked].sort((a, b) => a - b))
  }
</script>

{#if !revealed}
  <p class="ask">{q.picks === undefined ? 'Pick all that apply' : `Pick ${q.picks}`}</p>
{/if}
<GemChoices
  options={q.options}
  {picked}
  {answer}
  {revealed}
  {canAnswer}
  onAnswer={toggle}
  ticked={sent ? null : ticked}
  {full}
>
  {#snippet label(option: string)}{option}{/snippet}
</GemChoices>
{#if canAnswer && !revealed && !sent}
  <button type="button" class="primary submit" disabled={!ready} onclick={submit}>Submit</button>
{/if}

<style>
  .ask {
    margin: 0 0 0.6rem;
    color: var(--muted);
  }

  .submit {
    width: 100%;
    min-height: 56px;
    margin-top: 0.6rem;
  }
</style>
