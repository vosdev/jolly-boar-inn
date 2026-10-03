<script lang="ts">
  /**
   * An NPC interrupting the round: who they are, what they say, and their question, with
   * the answers held back until the question's `answerable_at`.
   *
   * The hold is the server's, not a flourish of this card's. The server takes no answer
   * before `answerable_at` (`not_open`) and starts the question's clock there, so the two
   * seconds the NPC holds the floor cost nobody a speed bucket. All this card does is not
   * offer buttons the server would refuse. It counts to `answerable_at` the way `Timer`
   * counts to a close: the server's timestamp against this browser's clock corrected by
   * `serverOffsetMs`, recomputed rather than decremented. That is also what makes a
   * reconnect in the middle of the hold come out right with no message of its own: the
   * `welcome` snapshot carries the same `answerable_at` and a `server_time` to correct by,
   * and the card simply waits out whatever is left.
   *
   * It is drawn on the stage (section 12 of ideas/design.md): the NPC stands on the right
   * of the round's host's scroll, with their name, line and question on the sheet and the
   * answers under the line. Their entrance plays only for a question that opens with most
   * of the hold still ahead; on a reveal, or a reconnect near its end, they are simply
   * there. The typed prompt and the return to the host are still to come.
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
    /** In the panel under the answers: the reveal's tally. */
    children?: Snippet
    /** Under that panel: the waiting line. */
    below?: Snippet
  } = $props()

  const npc = $derived(randomEventFor(question.random_event ?? ''))
  /** A server from before the hold existed sends none, and then there is none. */
  const answerableMs = $derived(Date.parse(question.answerable_at ?? question.opened_at))

  // An entrance needs the hold to play in: the swap takes 400 ms.
  const ENTRANCE_MS = 400

  /** Decided once, when the event takes the stage, so a tick cannot cut it short. */
  const entering = untrack(
    () =>
      reveal === null &&
      answerableMs - (Date.now() + get(serverOffsetMs)) > ENTRANCE_MS,
  )

  let nowMs = $state(Date.now())
  const held = $derived(
    reveal === null &&
      !Number.isNaN(answerableMs) &&
      answerableMs - (nowMs + $serverOffsetMs) > 0,
  )

  function tick(): void {
    nowMs = Date.now()
  }

  // One wake-up, when the buttons are due, rather than a tick every 100ms for two seconds.
  // It is measured from the moment it is armed and not from `nowMs`, which is only as fresh
  // as the last tick: every `pong` moves the offset and arms it again mid-hold, and the part
  // of the hold already waited must not be waited twice. It reads `nowMs` all the same, so
  // each tick arms it again, and a timer that fires a hair early sets another.
  $effect(() => {
    if (!held) return
    const armed = Math.max(nowMs, Date.now())
    const timer = setTimeout(tick, answerableMs - (armed + $serverOffsetMs))
    return () => clearTimeout(timer)
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
    <h2 class="name">{npc.name}</h2>
    <p class="line">{npc.line}</p>
    {@render stem()}
    {#if reveal !== null}
      <div class="said">
        <PointsSlot {result} canAnswer={question.you_can_answer} onScroll />
      </div>
    {/if}
  {/snippet}
  <Stage
    host={hostOf(question.segment.mode).host.id}
    guest={npc.asset.replace(/^npc:/, '')}
    {entering}
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

<Question {question} {reveal} {yourValue} {result} {onAnswer} {held} frame={staged} />

<style>
  .kicker {
    margin: 0;
    font-size: max(0.7rem, 0.8rem * var(--scroll-text, 1));
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .name {
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

  /* The foot of the sheet, where a round's points go too. */
  .said {
    display: flex;
    justify-content: flex-end;
    margin-top: auto;
    padding-top: 0.2rem;
  }

  @container (max-width: 26rem) {
    .answers {
      padding: calc(0.5rem - var(--border-give));
    }
  }
</style>
