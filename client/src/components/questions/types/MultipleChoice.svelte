<script lang="ts">
  /**
   * `multiple_choice`: two to six written answers, and one of them right.
   *
   * The most shared view in the game. Bestiary, Drop Table, Odd One Out, Who Said That?,
   * Clipped and most of what a host writes are all this, and differ only in what sits
   * above it — which is the stem's business, picked by the mode. So this draws the
   * answers and nothing else: the question is the stem's `prompt`, and the view never
   * repeats it.
   *
   * `data` arrives in the two shapes `questions/types/multiple_choice.py` sends:
   *
   * - while open, `client_view(payload)`: the prompt, the options, and an `image` ref.
   *   The options are the question, so they are on the wire from the start.
   * - after close, `reveal(payload)`: the same plus `answer_index` and, if the author
   *   gave one, an `explanation` of why.
   *
   * The answers are text of any length up to a line, so they stack on a phone and sit two
   * abreast where there is room, rather than the fixed grid of four prices.
   */
  import type { TypeViewProps } from '../props'

  /** An option index: the buttons are `options[0]` to `options[n - 1]`. */
  type Index = number

  interface Data {
    options: string[]
    /** Reveal only. */
    answer_index?: Index
    /** Reveal only, and optional there. */
    explanation?: string
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
      <span class="text">{option}</span>
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

{#if revealed && q.explanation}
  <p class="explanation">{q.explanation}</p>
{/if}

<style>
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }

  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: calc(1rem - var(--border-give)) calc(0.75rem - var(--border-give));
  }

  .text {
    font-size: 1.1rem;
    font-weight: 600;
    overflow-wrap: anywhere;
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

  .explanation {
    margin: 1rem 0 0;
    overflow-wrap: anywhere;
  }
</style>
