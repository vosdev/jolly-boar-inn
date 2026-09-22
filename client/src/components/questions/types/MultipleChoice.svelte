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
   * The answers are text of any length up to a line, one gem each (D8), stacked on a phone
   * and two abreast where there is room. Whether you were right is the points slot's to
   * say, over in `Room`; this only shows which answer it was.
   */
  import GemChoices from '../GemChoices.svelte'
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

  let { data, revealed, yourValue, canAnswer, onAnswer }: TypeViewProps<Index> = $props()

  const q = $derived(data as unknown as Data)
  const answer = $derived(revealed ? (q.answer_index ?? null) : null)
  const picked = $derived(
    typeof yourValue === 'number' && Number.isInteger(yourValue) ? yourValue : null,
  )
</script>

<GemChoices
  options={q.options}
  {picked}
  {answer}
  {revealed}
  {canAnswer}
  {onAnswer}
>
  {#snippet label(option: string)}{option}{/snippet}
</GemChoices>

{#if !canAnswer && !revealed}
  <p class="note">This one is not scored for you — sit back and watch.</p>
{/if}

{#if revealed && q.explanation}
  <p class="explanation">{q.explanation}</p>
{/if}

<style>
  .note {
    margin: 1rem 0 0;
  }

  .explanation {
    margin: 1rem 0 0;
    overflow-wrap: anywhere;
  }
</style>
