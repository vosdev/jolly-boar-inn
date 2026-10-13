<script lang="ts">
  /**
   * `more_less`: of two items, which one costs more — or less?
   *
   * The question is one line and two names. The line is `MoreLessStem`'s, on the scroll,
   * and names the metric: a pack mixes `ge_price` and `high_alch` questions, and the two
   * disagree wildly for the same item, so "which costs more?" alone is unanswerable. This
   * view is the two names under it. The date the values come from is not needed to
   * answer, so it stays on the reveal.
   *
   * `data` is whatever the server sent, and it arrives in two shapes from the same
   * module in `questions/types/more_less.py`:
   *
   * - while open, `client_view(payload)`: the metric, the direction, and both subjects
   *   with no values at all. Neither price is on the wire until the question closes.
   * - after close, `reveal(payload)`: the same fields plus each `value` and
   *   `answer_index`.
   *
   * `revealed` says which one it is, so the cast below only reads the values and the
   * answer once the server has actually sent them.
   *
   * The two buttons are `GemButton`'s plain variant: panel-coloured, never a gem,
   * because they will carry the item picture, but with the same five states as every
   * other answer button. So the right answer on the reveal gets a ✓ and an `--ok` ring
   * and nothing that looks like a press, and a question left unanswered shows neither
   * button pressed — which it used to, by drawing the answer in the pressed style.
   */
  import { asOfDate } from '../../../lib/dates'
  import GemButton, { gemState, indexSet, pickCounts } from '../GemButton.svelte'
  import type { TypeViewProps } from '../props'
  import { phrasingFor } from './moreLess'

  /** An option index: the two buttons are `options[0]` and `options[1]`. */
  type Index = 0 | 1

  interface Subject {
    name: string
    /** `item:<id>`. Unused until the renders ship, which is when buttons get icons. */
    asset?: string
  }

  interface Option {
    subject: Subject
    /** Reveal only. */
    value?: number
  }

  interface Data {
    metric: string
    direction: 'more' | 'less'
    options: Option[]
    as_of: string
    /** Reveal only. */
    answer_index?: Index
  }

  let { data, revealed, yourValue, canAnswer, onAnswer, results = null }: TypeViewProps<Index> = $props()

  // The wire type is `Record<string, unknown>`; this component is the thing that knows
  // what the keys mean, which is why the type map lives one level up and not in here.
  const q = $derived(data as unknown as Data)

  const metric = $derived(phrasingFor(q.metric).label)
  const answer = $derived(revealed ? (q.answer_index ?? null) : null)
  const picked = $derived(yourValue === 0 || yourValue === 1 ? (yourValue as Index) : null)

  const counts = $derived(revealed && results !== null ? pickCounts(results, 2) : null)
  const answered = $derived(results === null ? 0 : Object.keys(results).length)

  const gp = new Intl.NumberFormat()

  function coins(value: number | undefined): string {
    return value === undefined ? '?' : `${gp.format(value)} gp`
  }
</script>

<div class="choices">
  <!-- Keyed by position: nothing stops a pair naming one item twice, and a duplicate key
       throws. -->
  {#each q.options as option, index (index)}
    <GemButton
      gem={null}
      status={gemState(index, indexSet(picked), indexSet(answer), revealed)}
      mine={picked === index}
      votes={counts === null ? null : { count: counts[index] ?? 0, of: answered }}
      disabled={revealed || !canAnswer || picked !== null}
      onclick={() => onAnswer(index as Index)}
    >
      <!-- The item render goes here once the assets ship; `option.subject.asset` is
           already `item:<id>` in every payload. -->
      <span class="choice">
        <span class="who">{option.subject.name}</span>
        {#if revealed}<span class="value">{coins(option.value)}</span>{/if}
      </span>
    </GemButton>
  {/each}
</div>

{#if revealed}
  <p class="note asof">{metric}, as of {asOfDate(q.as_of)}.</p>
{/if}

<style>
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
    padding: 1rem 0;
    font-size: 1.1rem;
  }

  .who {
    overflow-wrap: anywhere;
  }

  .value {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.95rem;
    font-weight: 400;
  }

  .note {
    margin: 1rem 0 0;
  }

  .asof {
    margin: 1rem 0 0;
  }

  @media (max-width: 30rem) {
    .choices {
      grid-template-columns: 1fr;
    }
  }
</style>
