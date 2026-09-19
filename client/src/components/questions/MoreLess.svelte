<script lang="ts">
  /**
   * `more_less`: of two items, which one costs more — or less?
   *
   * The screen while a question is open is one line and two names, and that is the whole
   * point of it. The one thing that line cannot leave out is the metric: a pack mixes
   * `ge_price` and `high_alch` questions, and the two disagree wildly for the same item
   * — often enough to flip which of the pair is the answer — so "which costs more?" on
   * its own is a question nobody can answer. Each metric names its own source instead.
   * The date the values come from is not needed to answer, so it stays on the reveal.
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
   */
  import type { QuestionProps } from './props'

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

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    result = null,
    onAnswer,
  }: QuestionProps<Index> = $props()

  // The wire type is `Record<string, unknown>`; this component is the thing that knows
  // what the keys mean, which is why the type map lives one level up and not in here.
  const q = $derived(data as unknown as Data)

  /** How one metric reads: in the question while it is open, and on the reveal after. */
  interface Phrasing {
    /** Verb for "Which … MORE": a price is something an item costs, alchemy is worth. */
    verb: string
    /** Where the value comes from, e.g. `on the Grand Exchange`. Empty reads as before. */
    source: string
    /** The noun the reveal footnote names it by. */
    label: string
  }

  // One table and not two: a metric added later cannot end up phrased in the question and
  // nameless on the reveal, or the other way round.
  const METRICS: Record<string, Phrasing> = {
    ge_price: {
      verb: 'costs',
      source: 'on the Grand Exchange',
      label: 'Grand Exchange price',
    },
    high_alch: {
      verb: 'is worth',
      source: 'through High Alchemy',
      label: 'high alchemy value',
    },
    shop_price: { verb: 'costs', source: 'in a shop', label: 'shop price' },
  }

  // A room can be playing a pack written against a newer schema than this client knows,
  // so an unknown metric still has to ask something: the bare question it asked before
  // any of this, and the raw id on the reveal.
  const phrasing = $derived(
    METRICS[q.metric] ?? { verb: 'costs', source: '', label: q.metric },
  )
  const metric = $derived(phrasing.label)
  const source = $derived(phrasing.source ? ` ${phrasing.source}` : '')
  const answer = $derived(revealed ? (q.answer_index ?? null) : null)
  const picked = $derived(yourValue === 0 || yourValue === 1 ? (yourValue as Index) : null)

  const gp = new Intl.NumberFormat()

  function coins(value: number | undefined): string {
    return value === undefined ? '?' : `${gp.format(value)} gp`
  }

  /** `as_of` is a plain date; render it in the reader's locale, not ISO. */
  function asOf(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`)
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
  }
</script>

<p class="ask">
  Which {phrasing.verb} <span class="word {q.direction}">{q.direction}</span>{source}?
</p>

<div class="choices">
  {#each q.options as option, index (option.subject.name)}
    <button
      type="button"
      class="choice"
      class:picked={picked === index}
      class:right={answer === index}
      class:wrong={revealed && picked === index && answer !== index}
      disabled={revealed || !canAnswer || picked !== null}
      onclick={() => onAnswer(index as Index)}
    >
      <!-- The item render goes here once the assets ship; `option.subject.asset` is
           already `item:<id>` in every payload. -->
      <span class="who">{option.subject.name}</span>
      {#if revealed}<span class="value">{coins(option.value)}</span>{/if}
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
  <p class="note asof">{metric}, as of {asOf(q.as_of)}.</p>
{/if}

<style>
  .ask {
    font-size: 1.35rem;
    font-weight: 600;
    margin: 0 0 1.25rem;
  }

  /* `--ok` and `--bad` mean right and wrong in the reveal below; a direction that
     borrowed them would sit next to a button using them to mean something else. */
  .word {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .word.more {
    color: var(--more);
  }

  .word.less {
    color: var(--less);
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
    padding: 1.5rem 0.75rem;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .who {
    overflow-wrap: anywhere;
  }

  .value {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.95rem;
    font-weight: 400;
    color: var(--muted);
  }

  /* A disabled button is still the record of what we picked, so it keeps its colour
     rather than fading out with the rest. */
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

  .choice.right .value,
  .choice.wrong .value,
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

  @media (max-width: 30rem) {
    .choices {
      grid-template-columns: 1fr;
    }
  }
</style>
