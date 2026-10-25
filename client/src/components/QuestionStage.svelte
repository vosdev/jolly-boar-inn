<script lang="ts">
  /**
   * The question area of a room: one question, open or revealed, and what you did with it.
   *
   * It picks the random event's card or the plain question once, for both halves of the
   * question's life, so a change to either half cannot miss the other. While the question
   * is open, how the room is doing is the table panel's. Correctness is nobody's until
   * `question_closed`.
   *
   * A round's question is on the stage (section 8 of ideas/design.md): its stem on the
   * scroll, and under the line the answers in a panel.
   * The host stands above the sheet and speaks throughout: its ask line types in its bubble
   * before the stem types on the sheet, once we have answered its waiting line shows, dimmed,
   * picked by how fast `answer_ack` says we were once it arrives, and on the reveal a line reacting to how we did and the explanation, while what we earned
   * goes on a chip on the box's name row and anything we scored pins the ribbon. Somebody the
   * question was never theirs to answer gets the room's reveal line and no chip. Who is in
   * goes to the room's table. A random event draws its own stage, with its NPC speaking.
   *
   * Which of a host's lines it says is `pickLines`'s, from the question's place in its round,
   * so every screen in the room says the same one.
   *
   * A question that arrived as it opened types its ask line and stem in the hold the
   * server gives it before `answerable_at` (`lib/interlude.ts`), once the stage has come
   * over from the screen before, and the answers wait under the line until then. A reconnect, a reveal and reduced motion get the stem whole; the
   * answers still wait, because that is a rule of the game, not an animation.
   *
   * `children` goes inside the panel under the answers: the reveal's tally. `stemOnly`
   * leaves the answers out, for a preview whose answers a player cannot try yet.
   * `answersOnly` is its counterpart, for a phone while the room's TV shows the question:
   * no stage, stem, picture or event card, only the answers and, once you answer, the host's
   * waiting line under them, and on the reveal your points on their plaque. Everything about the room as a whole, the
   * tally, each option's count, the others' guesses and the explanation, is the TV's.
   *
   * `tv` is the TV's own: the stage with no answers while the question is open, and
   * beside the scroll the panel of who is still to answer, which widens into the whole
   * reveal. The TV keeps the stage without a bubble: the host says its ask line, then its
   * reveal line, at the sheet's foot, but there are no points, pin or confetti, since the
   * TV answers nothing.
   */
  import { untrack, type Snippet } from 'svelte'
  import { get } from 'svelte/store'

  import type { OpenQuestion, PlayerResult } from '../lib/protocol'
  import { NO_AWARD, awardFor, verdictFor } from '../lib/award'
  import { QUESTION_TYPE_FROM_MS, SETTLED, interludeFor, reducedMotion } from '../lib/interlude'
  import { hostOf, INNKEEPER, MODES, PACES, VERDICTS, paceOf, pickLines } from '../lib/modes'
  import { stageArrival } from '../lib/sharedStage.svelte'
  import { answerAck, serverOffsetMs } from '../lib/stores'
  import { TV_CLOSE_MS } from '../lib/tv'
  import { Typist, Until, lettersOf } from '../lib/typing.svelte'
  import PointsSlot from './PointsSlot.svelte'
  import RandomEvent from './RandomEvent.svelte'
  import { stemLines } from './questions/index'
  import Question from './questions/Question.svelte'
  import Said from './stage/Said.svelte'
  import Stage from './stage/Stage.svelte'
  import Typed from './stage/Typed.svelte'
  import TvReveal from './TvReveal.svelte'
  import TvWaiting from './TvWaiting.svelte'

  let {
    question,
    reveal = null,
    yourValue,
    result = null,
    results = null,
    onAnswer,
    live = false,
    nextAt = null,
    stemOnly = false,
    answersOnly = false,
    tv = false,
    hero = null,
    children,
  }: {
    /** The question as it was sent open, which still picks the view once it has closed. */
    question: OpenQuestion
    /** `question_closed.reveal`, or null while the question is open. */
    reveal?: Record<string, unknown> | null
    yourValue: unknown
    result?: PlayerResult | null
    /** `question_closed.results`, every player's row; null while open. */
    results?: Record<string, PlayerResult> | null
    onAnswer: (value: unknown) => void
    /** The question arrived in `question_open`, not a `welcome`: a random event's entrance plays. */
    live?: boolean
    /** The reveal's end, for a random event's return. */
    nextAt?: string | null
    stemOnly?: boolean
    answersOnly?: boolean
    /** This browser is the room's TV. */
    tv?: boolean
    /** A picture to stand in the innkeeper's place; other hosts keep their own. */
    hero?: string | null
    children?: Snippet
  } = $props()

  const host = $derived(hostOf(question.mode))
  const yours = $derived(!tv && question.you_can_answer)
  const lines = $derived(
    pickLines(host, question, {
      verdict: yours && reveal !== null ? verdictFor(result, true) : null,
      pace: yours ? paceOf($answerAck) : null,
    }),
  )
  /** Every line we might hear, held unseen so the box does not grow for the longest. */
  const unheardLines = $derived(
    yours
      ? [
          ...PACES.map((pace) => pickLines(host, question, { pace }).waiting),
          ...VERDICTS.map((verdict) => pickLines(host, question, { verdict }).reveal),
        ]
      : [],
  )
  const explanation = $derived(
    reveal !== null && typeof reveal.explanation === 'string' ? reveal.explanation : '',
  )

  const answerableMs = $derived(Date.parse(question.answerable_at ?? question.opened_at))
  /** A server from before every question held sends none, and then there is none. */
  const hasHold = $derived(answerableMs > Date.parse(question.opened_at))
  const stem = $derived(stemLines(question.mode, question.view))
  /** The ask line first, in the bubble, then the stem's; a mode this build does not know types nothing. */
  const letters = $derived(
    stem.length === 0 && MODES[question.mode] === undefined
      ? []
      : [lines.ask, ...stem].map(lettersOf),
  )
  /** Decided once, when the question takes the stage, so a tick cannot cut it short. */
  const startedAt = Date.now()
  const holdMs = untrack(() => answerableMs - (startedAt + get(serverOffsetMs)))
  const scene = untrack(() => question.question_id)
  const arrival = untrack(() =>
    reveal === null ? stageArrival({ host: host.host.id, scene, within: holdMs }) : 0,
  )
  const plan = untrack(() =>
    live && reveal === null && !question.random_event && !reducedMotion()
      ? interludeFor(holdMs, letters, Math.max(QUESTION_TYPE_FROM_MS, arrival), arrival)
      : SETTLED,
  )
  const typist = new Typist(() => letters, plan, startedAt)
  /** What the bubble says now; the others keep their room in it unseen. */
  const spoken = $derived(reveal !== null ? revealLine : yourValue !== null ? waitingLine : askLine)
  const answerable = new Until(() => answerableMs)
  const held = $derived(reveal === null && !answerable.passed)
  /** The TV's reveal fading off its panel, so the next question starts from an empty one. */
  const closing = new Until(() => (nextAt === null ? NaN : Date.parse(nextAt) - TV_CLOSE_MS))
</script>

{#snippet staged(stem: Snippet, answers: Snippet | null)}
  {#snippet sheet()}
    {#if tv}
      <div class="tv-stem">{@render stem()}</div>
      <div class="said">
        {#if reveal !== null}
          <p class="line">{lines.reveal}</p>
        {:else}
          <p class="line"><Typed line={lines.ask} shown={typist.shown[0]} /></p>
        {/if}
      </div>
    {:else}
      {@render stem()}
    {/if}
  {/snippet}
  {#snippet said()}
    <Said
      name={host.host.name}
      line={spoken}
      later={[askLine, waitingLine, revealLine, unheard].filter((other) => other !== spoken)}
      chip={yours && reveal !== null ? points : undefined}
    />
  {/snippet}
  <Stage
    host={host.host.id}
    hero={host.host.id === INNKEEPER.id ? hero : null}
    {scene}
    within={reveal === null ? holdMs : Infinity}
    paper={sheet}
    said={tv ? undefined : said}
    bubble={tv ? null : reveal === null && yourValue !== null ? 'dim' : 'on'}
    award={reveal === null || tv ? NO_AWARD : awardFor(result)}
    {tv}
  >
    {#if tv}
      {@render tvPanel(answers)}
    {:else if (answers !== null && !stemOnly) || children}
      <section class="panel answers">
        {#if !stemOnly}{@render answers?.()}{/if}
        {@render children?.()}
      </section>
    {/if}
  </Stage>
{/snippet}

{#snippet askLine()}
  <p><Typed line={lines.ask} shown={typist.shown[0]} /></p>
{/snippet}

{#snippet waitingLine()}
  <p>{lines.waiting}</p>
{/snippet}

{#snippet points()}
  <PointsSlot {result} canAnswer chip />
{/snippet}

{#snippet unheard()}
  <div class="overlap">
    {#each unheardLines as line, i (i)}<p>{line}</p>{/each}
  </div>
{/snippet}

{#snippet revealLine()}
  <p>{lines.reveal}</p>
  {#if explanation !== ''}<p>{explanation}</p>{/if}
{/snippet}

{#snippet tvPanel(answers: Snippet | null)}
  {#if reveal === null}
    <TvWaiting />
  {:else}
    <TvReveal closing={closing.passed}>
      {@render answers?.()}
      {@render children?.()}
    </TvReveal>
  {/if}
{/snippet}

{#snippet bare(stem: Snippet, answers: Snippet | null)}
  {#if reveal !== null}
    <PointsSlot {result} canAnswer={question.you_can_answer} />
  {/if}
  <section class="panel answers">
    {#if answers === null}{@render stem()}{:else}{@render answers()}{/if}
  </section>
  {#if reveal === null && yourValue !== null}
    <p class="host-line">{lines.waiting}</p>
  {/if}
{/snippet}

{#if answersOnly}
  <div class="bare">
    <Question
      {question}
      {reveal}
      {yourValue}
      {result}
      {onAnswer}
      held={hasHold ? held : undefined}
      explain={false}
      frame={bare}
    />
  </div>
{:else if question.random_event}
  <RandomEvent {question} {reveal} {yourValue} {result} {results} {onAnswer} {live} {nextAt} {tv}>
    {@render children?.()}
  </RandomEvent>
{:else}
  <Question
    {question}
    {reveal}
    {yourValue}
    {result}
    {results}
    {onAnswer}
    held={hasHold ? held : undefined}
    shown={typist.shown.slice(1)}
    explain={tv}
    frame={staged}
  />
{/if}

<style>
  /* The lines a player might hear, one over another, for the tallest's height. */
  .overlap {
    display: grid;
  }

  .overlap > p {
    grid-area: 1 / 1;
    margin: 0;
  }

  /* The TV's foot of the sheet, two host lines tall whatever is on it yet: a waiting line that
     wraps would otherwise grow the sheet, and the shorter reveal line shrink it again. */
  .said {
    --line-size: max(0.85rem, 0.95rem * var(--scroll-text, 1));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: auto;
    padding-top: 0.2rem;
    min-height: calc(0.2rem + 2 * 1.5 * var(--line-size));
  }

  /* The TV's sheet is the window's shape, taller than its words: the question stands in
     the middle of the room above the foot, rather than at the top of an empty sheet. */
  .tv-stem {
    display: flex;
    flex-direction: column;
    margin-block: auto;
  }

  .tv-stem + .said {
    margin-top: 0;
  }

  .line {
    margin: 0;
    font-size: var(--line-size);
    line-height: 1.5;
    font-style: italic;
  }

  /* On a phone the panel gives its padding to the gems: six of them at 56px and a
     two-line prompt have to fit in the 650px a 375x812 phone shows. */
  @container (max-width: 26rem) {
    .answers {
      padding: calc(0.5rem - var(--border-give));
    }
  }

  /* The stage's width without the stage, so the answers sit where they would under it. */
  .bare {
    display: grid;
    gap: 0.75rem;
    width: 100%;
    max-width: 30rem;
    margin-inline: auto;
  }

  .bare > :global(.slot) {
    justify-self: center;
  }

  /* The host is the TV's, so on the phone its waiting line stands alone, quieter than the answers. */
  .host-line {
    margin: 0;
    color: var(--muted);
    font-style: italic;
    text-align: center;
  }
</style>
