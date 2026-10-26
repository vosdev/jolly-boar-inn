<script lang="ts">
  /**
   * An NPC interrupting the round: who they are, what they say, and their question, with
   * the answers held back until the question's `answerable_at`.
   *
   * The hold is the server's, not a flourish of this card's. The server takes no answer
   * before `answerable_at` (`not_open`) and starts the question's clock there, so the
   * seconds the NPC holds the floor cost nobody a speed bucket. All this card does is not
   * offer buttons the server would refuse. It counts to `answerable_at` the way `Timer`
   * counts to a close: the server's timestamp against this browser's clock corrected by
   * `serverOffsetMs`, recomputed rather than decremented. That is also what makes a
   * reconnect in the middle of the hold come out right with no message of its own: the
   * `welcome` snapshot carries the same `answerable_at` and a `server_time` to correct by,
   * and the card simply waits out whatever is left.
   *
   * It is drawn on the stage as the interlude of section 12 of ideas/design.md: the NPC
   * stands on the right above the sheet in the round's host's place, their name in their
   * bubble from the first frame, their `intro` typed in there, a pause, then the plain
   * question typed on the sheet, and the answers under the line. Once the question is up the bubble dims. A question with no intro types its
   * prompt alone. The
   * timing is `lib/interlude.ts`'s, planned once from what is left of the hold when the
   * event takes the stage, and only for a question that arrived `live`: a reconnect, a
   * reveal and reduced motion get the settled stage. The typing is a mask over text that
   * is whole in the DOM, and whole for a screen reader, from the first frame. In the
   * reveal the bubble comes back with the NPC's `right` or `wrong` to your answer and the
   * `explanation`, your points go on a chip on the bubble's name row, and the NPC hands the stage back
   * in its last `RETURN_MS`, counted to `nextAt`.
   *
   * The bubble keeps room for the reveal's words, two lines of explanation among them, from
   * the start, so nothing under them moves when they arrive.
   * The TV keeps the old stage: the NPC's words all on the sheet, beside it.
   *
   * An NPC this build has no copy for is the Mysterious Old Man (`randomEventFor`), the
   * same honest fallback `viewFor` makes for a mode it cannot draw.
   *
   * The same card draws the reveal, so the NPC stays on screen until the round takes the
   * floor back. `reveal` being non-null is what says which of the two this is.
   *
   * On the room's TV (`tv`) the panel beside the sheet is who is still to answer, then the
   * reveal, as for a round's question, and the NPC has no points to react to.
   */
  import { untrack, type Snippet } from 'svelte'
  import { get } from 'svelte/store'

  import { NO_AWARD, awardFor } from '../lib/award'
  import { RETURN_MS, SETTLED, interludeFor, reducedMotion } from '../lib/interlude'
  import { hostOf } from '../lib/modes'
  import type { OpenQuestion, PlayerResult } from '../lib/protocol'
  import { randomEventFor } from '../lib/randomEvents'
  import { serverOffsetMs } from '../lib/stores'
  import { TV_CLOSE_MS } from '../lib/tv'
  import { Typist, Until, lettersOf, type Line } from '../lib/typing.svelte'
  import PointsSlot from './PointsSlot.svelte'
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
    tv = false,
    children,
  }: {
    /** An open question whose `random_event` is set, or the one being revealed. */
    question: OpenQuestion
    /** `question_closed.reveal`, or null while the question is open. */
    reveal?: Record<string, unknown> | null
    yourValue: unknown
    result?: PlayerResult | null
    /** `question_closed.results`, every player's row; null while open. */
    results?: Record<string, PlayerResult> | null
    onAnswer: (value: unknown) => void
    /** The question arrived as it opened, so its entrance is the room's to see. */
    live?: boolean
    /** The reveal's end, `room.next_at`. */
    nextAt?: string | null
    /** This browser is the room's TV. */
    tv?: boolean
    /** In the panel under the answers: the reveal's tally. */
    children?: Snippet
  } = $props()

  const npc = $derived(randomEventFor(question.random_event ?? ''))
  /** A server from before the hold existed sends none, and then there is none. */
  const answerableMs = $derived(Date.parse(question.answerable_at ?? question.opened_at))
  const prompt = $derived(typeof question.view.prompt === 'string' ? question.view.prompt : '')
  const intro = $derived(typeof question.view.intro === 'string' ? question.view.intro : '')
  /**
   * What the NPC types, in order: their intro and the question, or the question alone. A
   * question with no prompt of its own is its stem's, typed as a round's would be.
   */
  const lines: Line[] = $derived(
    prompt === ''
      ? stemLines(question.mode, question.view)
      : intro !== ''
        ? [intro, prompt]
        : [prompt],
  )
  const letters = $derived(lines.map(lettersOf))
  /** Which of the lines is the question, typed on the sheet after the intro in the bubble. */
  const asked = $derived(intro !== '' ? 1 : 0)
  const explanation = $derived(
    reveal !== null && typeof reveal.explanation === 'string' ? reveal.explanation : '',
  )
  /** Nothing for somebody the question was never theirs to answer. */
  const reaction = $derived(
    reveal === null || !question.you_can_answer
      ? null
      : (result?.points ?? 0) > 0
        ? npc.right
        : npc.wrong,
  )

  const longerVerdict = $derived(npc.right.length >= npc.wrong.length ? npc.right : npc.wrong)

  /** Decided once, when the event takes the stage, so a tick cannot cut it short. */
  const startedAt = Date.now()
  const interlude = untrack(() =>
    live && reveal === null && !reducedMotion()
      ? interludeFor(answerableMs - (startedAt + get(serverOffsetMs)), letters)
      : SETTLED,
  )

  const typist = new Typist(() => letters, interlude, startedAt)
  const answerable = new Until(() => answerableMs)
  const held = $derived(reveal === null && !Number.isNaN(answerableMs) && !answerable.passed)
  const returnMs = $derived(nextAt === null ? NaN : Date.parse(nextAt) - RETURN_MS)
  const leaving = new Until(() => returnMs)
  const returning = $derived(reveal !== null && leaving.passed)
  /** The TV's reveal closes before the NPC hands the stage back, so only the stage moves then. */
  const closing = new Until(() => returnMs - TV_CLOSE_MS)
</script>

{#snippet typed(i: number, kind: string)}
  <p class={kind}><Typed line={lines[i] ?? ''} shown={typist.shown[i]} /></p>
{/snippet}

{#snippet staged(stem: Snippet, answers: Snippet | null)}
  {#snippet words()}
    <h2 class="who">{npc.name}</h2>
    {#if answers === null || prompt === ''}
      {@render stem()}
    {:else if intro !== '' && reveal !== null}
      {@render typed(1, 'ask')}
      <p class="intro kept" aria-hidden="true">{intro}</p>
    {:else if intro !== ''}
      {@render typed(0, 'intro')}
      {@render typed(1, 'ask')}
    {:else}
      {@render typed(0, 'ask')}
    {/if}
  {/snippet}
  {#snippet sheet()}
    {#if tv}
      <div class="tv-words">{@render words()}</div>
      <div class="foot">
        <p class="explanation">{explanation}</p>
      </div>
    {:else}
      {#if answers === null || prompt === ''}
        {@render stem()}
      {:else}
        {@render typed(asked, 'ask')}
      {/if}
    {/if}
  {/snippet}
  {#snippet said()}
    <Said
      heading
      name={npc.name}
      line={reveal === null ? introLine : reactionLine}
      later={reveal === null ? reactionLine : introLine}
      chip={reveal !== null && question.you_can_answer ? points : undefined}
    />
  {/snippet}
  <Stage
    host={hostOf(question.segment.mode).host.id}
    guest={npc.asset.replace(/^npc:/, '')}
    entering={interlude.enter}
    {returning}
    scene={question.question_id}
    paper={sheet}
    said={tv ? undefined : said}
    bubble={tv ? null : reveal === null && !typist.typing ? 'dim' : 'on'}
    award={reveal === null || tv ? NO_AWARD : awardFor(result)}
    {tv}
  >
    {#if tv && reveal === null}
      <TvWaiting />
    {:else if tv}
      <TvReveal closing={closing.passed}>
        {@render answers?.()}
        {@render children?.()}
      </TvReveal>
    {:else if answers !== null || children}
      <section class="panel answers">
        {@render answers?.()}
        {@render children?.()}
      </section>
    {/if}
  </Stage>
{/snippet}

{#snippet points()}
  <PointsSlot {result} canAnswer chip />
{/snippet}

{#snippet introLine()}
  {#if intro !== '' && prompt !== ''}
    <p class="lore"><Typed line={intro} shown={typist.shown[0]} /></p>
  {/if}
{/snippet}

{#snippet reactionLine()}
  <!-- Before the reveal it stands unseen at the longer of the two verdicts, for the room. -->
  {#if question.you_can_answer}
    <p class="reaction">{reaction ?? longerVerdict}</p>
  {/if}
  <!-- Two lines kept from the start, so a reveal that explains grows nothing. -->
  <p class="explained">{explanation}</p>
{/snippet}

<Question
  {question}
  {reveal}
  {yourValue}
  {result}
  {results}
  {onAnswer}
  {held}
  shown={prompt === '' ? typist.shown : undefined}
  explain={false}
  frame={staged}
/>

<style>
  /* Two lines kept from the start, so a reveal that explains grows the bubble by nothing. */
  .explained {
    min-height: 2.6em;
  }

  .who {
    margin: 0.1rem 0 0.3rem;
    font-family: var(--font-display);
    font-size: max(1.15rem, 1.5rem * var(--scroll-text, 1));
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  /* The NPC's voice, before the bold question that is all a player in a hurry needs. */
  .intro {
    margin: 0 0 0.5rem;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
    font-style: italic;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  /* The intro has said its piece by the reveal, but its lines stay, under the question,
     so the sheet and the answers under it keep still. */
  .kept {
    visibility: hidden;
    margin: 0.5rem 0 0;
  }

  /* As a round's prompt on the scroll (`TextStem`), so the handwriting does not change. */
  .ask {
    margin: 0;
    font-size: max(1rem, 1.2rem * var(--scroll-text, 1));
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  /* On the TV's tall sheet the NPC's words stand in the middle above the foot (`QuestionStage`). */
  .tv-words {
    display: flex;
    flex-direction: column;
    margin-block: auto;
  }

  .tv-words + .foot {
    margin-top: 0;
  }

  .foot {
    margin-top: auto;
    padding-top: 0.4rem;
  }

  /* Two lines kept from the start, so a reveal that explains moves nothing below. */
  .explanation {
    margin: 0;
    min-height: 2.6em;
    font-size: max(0.85rem, 0.95rem * var(--scroll-text, 1));
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  @container (max-width: 26rem) {
    .answers {
      padding: calc(0.5rem - var(--border-give));
    }
  }
</style>
