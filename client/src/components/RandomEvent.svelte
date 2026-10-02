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
   * It is the plain version of the card. The NPC taking the stage from the round's host —
   * the picture on the right, the scroll moving across, the prompt typed out — is still to
   * come, and so are the pictures. Until then the card is text: a name, a line and the
   * question, with the picture's slot left empty rather than filled with a stand-in.
   *
   * An NPC this build has no copy for is the Mysterious Old Man (`randomEventFor`), the
   * same honest fallback `viewFor` makes for a mode it cannot draw.
   *
   * The same card draws the reveal, so the NPC stays on screen until the round takes the
   * floor back. `reveal` being non-null is what says which of the two this is.
   */
  import { onMount } from 'svelte'

  import type { OpenQuestion, PlayerResult } from '../lib/protocol'
  import { randomEventFor } from '../lib/randomEvents'
  import { serverOffsetMs } from '../lib/stores'
  import Question from './questions/Question.svelte'

  let {
    question,
    reveal = null,
    yourValue,
    result = null,
    onAnswer,
  }: {
    /** An open question whose `random_event` is set, or the one being revealed. */
    question: OpenQuestion
    /** `question_closed.reveal`, or null while the question is open. */
    reveal?: Record<string, unknown> | null
    yourValue: unknown
    result?: PlayerResult | null
    onAnswer: (value: unknown) => void
  } = $props()

  const npc = $derived(randomEventFor(question.random_event ?? ''))
  /** A server from before the hold existed sends none, and then there is none. */
  const answerableMs = $derived(Date.parse(question.answerable_at ?? question.opened_at))

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

<div class="event">
  <header class="who">
    <div class="words">
      <p class="kicker">Random event</p>
      <h2 class="name">{npc.name}</h2>
      <p class="line">{npc.line}</p>
    </div>
    <!-- The NPC's picture goes here, found by `npc.asset`. Empty until there is one. -->
    <div class="portrait" aria-hidden="true"></div>
  </header>
  <Question {question} {reveal} {yourValue} {result} {onAnswer} {held} />
</div>

<style>
  .who {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--line);
  }

  .words {
    min-width: 0;
  }

  .kicker {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  .name {
    margin: 0.1rem 0 0.35rem;
  }

  .line {
    margin: 0;
    font-style: italic;
    overflow-wrap: anywhere;
  }

  .portrait {
    flex: none;
    width: 4rem;
    height: 4rem;
    border: 1px dashed var(--line);
    border-radius: var(--radius);
  }
</style>
