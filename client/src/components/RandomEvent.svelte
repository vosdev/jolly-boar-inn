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
   * stands on the right of the round's host's scroll, their name and line on the sheet
   * from the first frame, then the prompt typed in, and the answers under the line. The
   * timing is `lib/interlude.ts`'s, planned once from what is left of the hold when the
   * event takes the stage, and only for a question that arrived `live`: a reconnect, a
   * reveal and reduced motion get the settled stage. The typing is a mask over a prompt
   * that is whole in the DOM, and whole for a screen reader, from the first frame. In the
   * reveal the NPC hands the stage back in its last `RETURN_MS`, counted to `nextAt`.
   *
   * The sheet keeps room for two lines of the reveal's `explanation` and for the points
   * from the start, so the answers under it do not move when they arrive.
   *
   * An NPC this build has no copy for is the Mysterious Old Man (`randomEventFor`), the
   * same honest fallback `viewFor` makes for a mode it cannot draw.
   *
   * The same card draws the reveal, so the NPC stays on screen until the round takes the
   * floor back. `reveal` being non-null is what says which of the two this is.
   */
  import { onMount, untrack, type Snippet } from 'svelte'
  import { get } from 'svelte/store'

  import { awardFor } from '../lib/award'
  import { RETURN_MS, SETTLED, interludeFor, reducedMotion, typedAt } from '../lib/interlude'
  import { hostOf } from '../lib/modes'
  import type { OpenQuestion, PlayerResult } from '../lib/protocol'
  import { randomEventFor } from '../lib/randomEvents'
  import { serverOffsetMs } from '../lib/stores'
  import PointsSlot from './PointsSlot.svelte'
  import Question from './questions/Question.svelte'
  import Stage from './stage/Stage.svelte'

  let {
    question,
    reveal = null,
    yourValue,
    result = null,
    onAnswer,
    live = false,
    nextAt = null,
    children,
    below,
  }: {
    /** An open question whose `random_event` is set, or the one being revealed. */
    question: OpenQuestion
    /** `question_closed.reveal`, or null while the question is open. */
    reveal?: Record<string, unknown> | null
    yourValue: unknown
    result?: PlayerResult | null
    onAnswer: (value: unknown) => void
    /** The question arrived as it opened, so its entrance is the room's to see. */
    live?: boolean
    /** The reveal's end, `room.next_at`; null when nothing follows it. */
    nextAt?: string | null
    /** In the panel under the answers: the reveal's tally. */
    children?: Snippet
    /** Under that panel: the waiting line. */
    below?: Snippet
  } = $props()

  const npc = $derived(randomEventFor(question.random_event ?? ''))
  /** A server from before the hold existed sends none, and then there is none. */
  const answerableMs = $derived(Date.parse(question.answerable_at ?? question.opened_at))
  const prompt = $derived(typeof question.view.prompt === 'string' ? question.view.prompt : '')
  /** By code point, so an emoji or an accent is one letter typed, never half of one. */
  const letters = $derived([...prompt])
  const explanation = $derived(
    reveal !== null && typeof reveal.explanation === 'string' ? reveal.explanation : '',
  )

  /** Decided once, when the event takes the stage, so a tick cannot cut it short. */
  const startedAt = Date.now()
  const interlude = untrack(() =>
    live && reveal === null && !reducedMotion()
      ? interludeFor(answerableMs - (startedAt + get(serverOffsetMs)), letters.length)
      : SETTLED,
  )

  let nowMs = $state(Date.now())
  const serverMs = $derived(nowMs + $serverOffsetMs)
  const held = $derived(
    reveal === null && !Number.isNaN(answerableMs) && answerableMs - serverMs > 0,
  )
  const shown = $derived(typedAt(interlude, letters.length, nowMs - startedAt))
  const typing = $derived(reveal === null && shown < letters.length)
  const returnMs = $derived(nextAt === null ? NaN : Date.parse(nextAt) - RETURN_MS)
  const returning = $derived(reveal !== null && returnMs - serverMs <= 0)

  function tick(): void {
    nowMs = Date.now()
  }

  /**
   * One wake-up at the server's `at`, rather than a tick every 100ms. It is measured from
   * the moment it is armed and not from `nowMs`, which is only as fresh as the last tick:
   * every `pong` moves the offset and arms it again, and the part already waited must not
   * be waited twice. Each tick arms it again, and a timer that fires a hair early sets
   * another.
   */
  function wakeAt(at: number): () => void {
    return wakeIn(at - (Math.max(nowMs, Date.now()) + $serverOffsetMs))
  }

  /**
   * A whole millisecond at least: a timer that fires inside the millisecond it was armed
   * in leaves `nowMs` as it was, and then nothing arms the next one.
   */
  function wakeIn(ms: number): () => void {
    const timer = setTimeout(tick, Math.max(1, Math.ceil(ms)))
    return () => clearTimeout(timer)
  }

  $effect(() => {
    if (held) return wakeAt(answerableMs)
  })

  $effect(() => {
    if (reveal !== null && !returning && !Number.isNaN(returnMs)) return wakeAt(returnMs)
  })

  // Typing runs on this browser's clock from the arrival, as the plan does: a letter at a
  // time, each at the moment it is due.
  $effect(() => {
    if (!typing) return
    const due =
      startedAt + interlude.typeFrom + ((shown + 1) / letters.length) * interlude.typeFor
    return wakeIn(due - Math.max(nowMs, Date.now()))
  })

  // A backgrounded tab's timers are throttled; coming back to it should not wait on one.
  onMount(() => {
    document.addEventListener('visibilitychange', tick)
    return () => document.removeEventListener('visibilitychange', tick)
  })
</script>

{#snippet staged(stem: Snippet, answers: Snippet | null)}
  {#snippet sheet()}
    <p class="kicker">Random event</p>
    <h2 class="who">{npc.name}</h2>
    <p class="line">{npc.line}</p>
    {#if answers === null || prompt === ''}
      {@render stem()}
    {:else if typing}
      <p class="ask"><span class="sr">{prompt}</span><span aria-hidden="true">{letters
            .slice(0, shown)
            .join('')}<span class="untyped">{letters.slice(shown).join('')}</span></span></p>
    {:else}
      <p class="ask">{prompt}</p>
    {/if}
    <div class="foot">
      <p class="explanation">{explanation}</p>
      <div class="said">
        {#if reveal !== null}
          <PointsSlot {result} canAnswer={question.you_can_answer} onScroll />
        {/if}
      </div>
    </div>
  {/snippet}
  <Stage
    host={hostOf(question.segment.mode).host.id}
    guest={npc.asset.replace(/^npc:/, '')}
    entering={interlude.enter}
    {returning}
    paper={sheet}
    award={reveal === null ? 'none' : awardFor(result)}
  >
    {#if answers !== null || children}
      <section class="panel answers">
        {@render answers?.()}
        {@render children?.()}
      </section>
    {/if}
    {@render below?.()}
  </Stage>
{/snippet}

<Question
  {question}
  {reveal}
  {yourValue}
  {result}
  {onAnswer}
  {held}
  explain={false}
  frame={staged}
/>

<style>
  .kicker {
    margin: 0;
    font-size: max(0.7rem, 0.8rem * var(--scroll-text, 1));
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .who {
    margin: 0.1rem 0 0.3rem;
    font-family: var(--font-display);
    font-size: max(1.15rem, 1.5rem * var(--scroll-text, 1));
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .line {
    margin: 0 0 0.5rem;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
    font-style: italic;
    overflow-wrap: anywhere;
  }

  /* As a round's prompt on the scroll (`TextStem`), so the handwriting does not change. */
  .ask {
    margin: 0;
    font-size: max(1rem, 1.2rem * var(--scroll-text, 1));
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  /* Laid out and invisible: the prompt holds its full height while it types. */
  .untyped {
    color: transparent;
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

  /* The foot of the sheet, one line of points tall whether or not they are in yet. */
  .said {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-top: 0.2rem;
    min-height: calc(1.2 * max(1.2rem, 1.4rem * var(--scroll-text, 1)));
  }

  @container (max-width: 26rem) {
    .answers {
      padding: calc(0.5rem - var(--border-give));
    }
  }
</style>
