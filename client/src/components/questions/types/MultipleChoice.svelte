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
   * - while open, `client_view(payload)`: the prompt and the options.
   *   The options are the question, so they are on the wire from the start, in the
   *   server's seeded shuffle; an index here is a shown position, never the authored one.
   * - after close, `reveal(payload)`: the same plus `answer_index` and, if the author
   *   gave one, an `explanation` of why, which `Question` draws.
   *
   * The answers are text of any length up to a line, one gem each, stacked on a phone
   * and two abreast where there is room. Whether you were right is the points slot's to
   * say, over in `Room`; this only shows which answer it was.
   */
  import { indexSet } from '../GemButton.svelte'
  import GemChoices from '../GemChoices.svelte'
  import type { TypeViewProps } from '../props'

  /** An option index: the buttons are `options[0]` to `options[n - 1]`. */
  type Index = number

  interface Data {
    options: string[]
    /** Reveal only. */
    answer_index?: Index
  }

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    onAnswer,
    results = null,
  }: TypeViewProps<Index> = $props()

  const q = $derived(data as unknown as Data)
  const answer = $derived(indexSet(revealed ? (q.answer_index ?? null) : null))
  const picked = $derived(
    indexSet(typeof yourValue === 'number' && Number.isInteger(yourValue) ? yourValue : null),
  )
</script>

<GemChoices options={q.options} {picked} {answer} {revealed} {canAnswer} {results} {onAnswer} named>
  {#snippet label(option: string)}{option}{/snippet}
</GemChoices>
