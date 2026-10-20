<script lang="ts">
  /**
   * `price_is_right`: four prices for one item, and which one it goes for.
   *
   * The item and the question line are the stem's to show (`PriceStem`, on the scroll);
   * this view is the four prices. The options arrive as integers and are written here, with
   * `lib/gp.ts`, the way the game writes a stack — which is the reason the server keeps
   * them numbers at all (architecture section 2). The generator rounds every price to two
   * figures, and two figures is exactly what that notation shows, so no two buttons ever
   * read the same.
   *
   * `data` arrives in the two shapes `questions/types/price_is_right.py` sends:
   *
   * - while open, `client_view(payload)`: the subject, the four options and `as_of`,
   *   which the splash and footer say instead. The options are the question, so they are
   *   on the wire from the start.
   * - after close, `reveal(payload)`: the same plus `value` and `answer_index`.
   *
   * The options come in ascending order and are drawn in that order. That is not a hint:
   * the pack deals the answer into every slot about equally often, and a ladder of prices
   * is how anyone would lay out a guess at one. The rungs are gems, sapphire at the
   * cheapest, and the verdict is the points slot's.
   */
  import { formatGp } from '../../../lib/gp'
  import { indexSet } from '../GemButton.svelte'
  import GemChoices from '../GemChoices.svelte'
  import type { TypeViewProps } from '../props'

  /** An option index: the four buttons are `options[0]` to `options[3]`. */
  type Index = number

  interface Data {
    options: number[]
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

<GemChoices options={q.options} {picked} {answer} {revealed} {canAnswer} {results} {onAnswer}>
  {#snippet label(option: number)}
    <span class="price">{formatGp(option)} <span class="unit">gp</span></span>
  {/snippet}
</GemChoices>

<style>
  /* In em, so the price grows with the answer's button on a reveal and shrinks with the
     rest beneath it. */
  .price {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 1.35em;
    font-weight: 600;
  }

  .unit {
    font-size: 0.6em;
    font-weight: 400;
  }
</style>
