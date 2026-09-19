<script lang="ts">
  /**
   * `higher_lower`: is the target's metric higher or lower than the anchor's?
   *
   * One component per question type, picked by `question.type` in `Room.svelte`. There
   * is deliberately no shared question framework behind this: plan.md says to build two
   * modes concretely and extract the abstraction afterwards, and the second mode is
   * Phase 2.
   *
   * `data` is whatever the server sent for this question, and it arrives in two shapes
   * from the same module in `questions/types/higher_lower.py`:
   *
   * - while open, `client_view(payload)`: the metric, the anchor with its value, the
   *   target with only its name, and `as_of`. No answer, no target value — the server
   *   withholds those from every socket including the admin's (section 3).
   * - after close, `reveal(payload)`: the same fields plus `target.value` and `answer`.
   *
   * `revealed` says which one it is, so the cast below only reads `answer` and
   * `target.value` once the server has actually sent them.
   */
  import type { PlayerResult } from '../../lib/protocol'

  type Value = 'higher' | 'lower'

  interface Subject {
    name: string
    asset?: string
  }

  interface Side {
    subject: Subject
    /** Present on the anchor always, on the target only in the reveal. */
    value?: number
  }

  interface Data {
    metric: string
    anchor: Side
    target: Side
    as_of: string
    /** Reveal only. */
    answer?: Value
  }

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    result = null,
    onAnswer,
  }: {
    /** `client_view` while open, `reveal` after close. */
    data: Record<string, unknown>
    revealed: boolean
    /** What we answered, optimistic or acked; null if we have not. */
    yourValue: unknown
    /**
     * False for a `host_only` question, and for our own room question in Phase 2.
     * Still the question's own `you_can_answer` during the reveal — what the buttons do
     * then is decided by `revealed`, and this stays the reason we were left out.
     */
    canAnswer: boolean
    /** Our row out of `question_closed.results`; null while open, or if we sat it out. */
    result?: PlayerResult | null
    onAnswer: (value: Value) => void
  } = $props()

  // The wire type is `dict[str, Any]`; this component is the thing that knows what the
  // keys mean, which is exactly why the type switch lives one level up and not in here.
  const q = $derived(data as unknown as Data)

  const METRICS: Record<string, string> = {
    ge_price: 'Grand Exchange price',
    high_alch: 'high alchemy value',
    shop_price: 'shop price',
  }

  const metric = $derived(METRICS[q.metric] ?? q.metric)
  const answer = $derived(revealed ? (q.answer ?? null) : null)
  const picked = $derived(typeof yourValue === 'string' ? (yourValue as Value) : null)

  const OPTIONS: { value: Value; label: string }[] = [
    { value: 'higher', label: 'Higher' },
    { value: 'lower', label: 'Lower' },
  ]

  const gp = new Intl.NumberFormat()

  function coins(value: number | undefined): string {
    return value === undefined ? '?' : `${gp.format(value)} gp`
  }

  /** `as_of` is a plain date; render it in the reader's locale, not ISO. */
  function asOf(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`)
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
</script>

<p class="ask">
  Is the {metric} of <strong>{q.target.subject.name}</strong> higher or lower than
  <strong>{q.anchor.subject.name}</strong>?
</p>

<div class="pair">
  <div class="side">
    <span class="who">{q.anchor.subject.name}</span>
    <span class="value">{coins(q.anchor.value)}</span>
  </div>
  <span class="versus" aria-hidden="true">vs</span>
  <div class="side" class:solved={revealed}>
    <span class="who">{q.target.subject.name}</span>
    <span class="value">{coins(revealed ? q.target.value : undefined)}</span>
  </div>
</div>

<div class="choices">
  {#each OPTIONS as option (option.value)}
    <button
      type="button"
      class="choice"
      class:picked={picked === option.value}
      class:right={answer === option.value}
      class:wrong={revealed && picked === option.value && answer !== option.value}
      disabled={revealed || !canAnswer || picked !== null}
      onclick={() => onAnswer(option.value)}
    >
      {option.label}
      {#if picked === option.value}<span class="mark">your answer</span>{/if}
      {#if answer === option.value}<span class="mark">correct</span>{/if}
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

<p class="note asof">Prices as of {asOf(q.as_of)}.</p>

<style>
  .ask {
    font-size: 1.15rem;
    margin: 0 0 1rem;
  }

  .pair {
    display: flex;
    align-items: stretch;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }

  .side.solved {
    border-color: var(--accent);
  }

  .who {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .value {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 1.1rem;
    color: var(--muted);
  }

  .solved .value {
    color: var(--ink);
  }

  .versus {
    align-self: center;
    color: var(--muted);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
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
    gap: 0.2rem;
    padding: 1rem 0.75rem;
    font-size: 1.1rem;
    font-weight: 600;
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

  .mark {
    font-size: 0.72rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .choice.right .mark,
  .choice.wrong .mark {
    color: inherit;
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
    .pair {
      flex-direction: column;
    }
  }
</style>
