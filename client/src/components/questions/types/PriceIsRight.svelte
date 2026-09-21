<script lang="ts">
  /**
   * `price_is_right`: four prices for one item, and which one it goes for.
   *
   * The item is the stem's to show (`AssetStem`, above this); this view is the question
   * line and the four prices. The options arrive as integers and are written here, with
   * `lib/gp.ts`, the way the game writes a stack — which is the reason the server keeps
   * them numbers at all (architecture section 2). The generator rounds every price to two
   * figures, and two figures is exactly what that notation shows, so no two buttons ever
   * read the same.
   *
   * `data` arrives in the two shapes `questions/types/price_is_right.py` sends:
   *
   * - while open, `client_view(payload)`: the subject, the four options and `as_of`.
   *   The options are the question, so they are on the wire from the start.
   * - after close, `reveal(payload)`: the same plus `value` and `answer_index`.
   *
   * The options come in ascending order and are drawn in that order. That is not a hint:
   * the pack deals the answer into every slot about equally often, and a ladder of prices
   * is how anyone would lay out a guess at one.
   */
  import { asOfDate } from '../../../lib/dates'
  import { formatGp } from '../../../lib/gp'
  import type { TypeViewProps } from '../props'

  /** An option index: the four buttons are `options[0]` to `options[3]`. */
  type Index = number

  interface Data {
    options: number[]
    as_of: string
    /** Reveal only. */
    answer_index?: Index
  }

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    result = null,
    onAnswer,
  }: TypeViewProps<Index> = $props()

  const q = $derived(data as unknown as Data)
  const answer = $derived(revealed ? (q.answer_index ?? null) : null)
  const picked = $derived(
    typeof yourValue === 'number' && Number.isInteger(yourValue) ? yourValue : null,
  )
</script>

<p class="ask">What does it go for on the Grand Exchange?</p>

<div class="choices">
  {#each q.options as option, index (index)}
    <button
      type="button"
      class="choice"
      class:picked={picked === index}
      class:right={answer === index}
      class:wrong={revealed && picked === index && answer !== index}
      disabled={revealed || !canAnswer || picked !== null}
      onclick={() => onAnswer(index)}
    >
      <span class="price">{formatGp(option)} <span class="unit">gp</span></span>
      {#if picked === index}<span class="mark">your answer</span>{/if}
      {#if answer === index}<span class="mark">correct</span>{/if}
    </button>
  {/each}
</div>

{#if !canAnswer}
  <p class="note">
    {revealed
      ? 'This one was not scored for you.'
      : 'This one is not scored for you — sit back and watch.'}
  </p>
{:else if revealed && result !== null}
  <p class="verdict" class:good={result.correct}>
    {result.correct ? `Right — ${result.points} points` : 'Wrong — no points'}
  </p>
{:else if revealed}
  <p class="note">No answer from you this round, so no points.</p>
{/if}

{#if revealed}
  <p class="note asof">Grand Exchange price, rounded, as of {asOfDate(q.as_of)}.</p>
{/if}

<style>
  .ask {
    font-size: 1.1rem;
    margin: 0 0 1.25rem;
    color: var(--muted);
  }

  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: calc(1.25rem - var(--border-give)) calc(0.75rem - var(--border-give));
  }

  .price {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 1.35rem;
    font-weight: 600;
  }

  .unit {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
  }

  /* As in `MoreLess`: a disabled button is still the record of what we picked. */
  .choice.picked {
    opacity: 1;
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .choice.right {
    opacity: 1;
    border-color: var(--ok);
    box-shadow: inset 0 0 0 2px var(--ok);
    color: var(--ok);
  }

  .choice.wrong {
    opacity: 1;
    border-color: var(--bad);
    box-shadow: inset 0 0 0 2px var(--bad);
    color: var(--bad);
  }

  .choice.right .unit,
  .choice.wrong .unit,
  .choice.right .mark,
  .choice.wrong .mark {
    color: inherit;
  }

  .mark {
    font-size: 0.72rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .verdict {
    margin: 1rem 0 0;
    font-weight: 600;
    color: var(--bad);
  }

  .verdict.good {
    color: var(--ok);
  }

  .asof {
    margin: 1rem 0 0;
  }
</style>
