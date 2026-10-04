<script lang="ts">
  /**
   * The question area of a room: one question, open or revealed, and what you did with it.
   *
   * It picks the random event's card or the plain question once, for both halves of the
   * question's life, so a change to either half cannot miss the other. While the question
   * is open and you have answered, the waiting line goes under it: up to fifteen
   * seconds in which people look up at each other, so it says how the room is doing
   * rather than one flat line. The band is all `answer_ack` carries, how fast or how
   * early, never whether it was right. Correctness is nobody's until `question_closed`.
   *
   * A round's question is on the stage (section 8 of ideas/design.md): its stem on the
   * scroll, and under the line the answers in a panel, with the waiting line below them.
   * Once we have answered the host says its waiting line at the foot of the sheet, and on
   * the reveal its reveal line and what we earned, and anything we scored pins the ribbon. The line the points go on is held from the start, so the
   * answers under the sheet do not move when they arrive. A random event draws its own
   * stage, with its NPC in the host's place.
   *
   * `children` goes inside the panel under the answers: the reveal's tally.
   */
  import type { Snippet } from 'svelte'

  import type { OpenQuestion, PlayerResult } from '../lib/protocol'
  import { awardFor } from '../lib/award'
  import { hostOf } from '../lib/modes'
  import { answerAck, answerCount } from '../lib/stores'
  import PointsSlot from './PointsSlot.svelte'
  import RandomEvent from './RandomEvent.svelte'
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
  }: {
    /** The question as it was sent open, which still picks the view once it has closed. */
    question: OpenQuestion
    /** `question_closed.reveal`, or null while the question is open. */
    reveal?: Record<string, unknown> | null
    yourValue: unknown
    result?: PlayerResult | null
    onAnswer: (value: unknown) => void
    /** The question arrived in `question_open`, not a `welcome`: a random event's entrance plays. */
    live?: boolean
    /** The reveal's end, for a random event's return. */
    nextAt?: string | null
    children?: Snippet
  } = $props()

  const host = $derived(hostOf(question.mode))

  /**
   * Where the answer landed, from `answer_ack`. A ranked question has no band, since a
   * guess is only worth something against the others, so it gets no badge. Built here
   * rather than in the markup because Svelte trims the leading space off an `{#if}`
   * block's first text node, and this clause needs one.
   */
  const landed = $derived.by(() => {
    const ack = $answerAck
    if (ack === null || ack.band === null) return null
    return ack.scoring === 'step'
      ? {
          badge: `step ${ack.band}`,
          sentence: `answered on step ${ack.band}, 1 being the earliest`,
        }
      : {
          badge: `${ack.band}/5`,
          sentence: `speed bucket ${ack.band} of 5, 1 being the fastest`,
        }
  })
</script>

{#snippet staged(stem: Snippet, answers: Snippet | null)}
  {#snippet sheet()}
    {@render stem()}
    <div class="said">
      {#if reveal !== null}
        <p class="line">{host.reveal}</p>
        <PointsSlot {result} canAnswer={question.you_can_answer} onScroll />
      {:else if yourValue !== null}
        <p class="line">{host.waiting}</p>
      {/if}
    </div>
  {/snippet}
  <Stage host={host.host.id} paper={sheet} award={reveal === null ? 'none' : awardFor(result)}>
    {#if answers !== null || children}
      <section class="panel answers">
        {@render answers?.()}
        {@render children?.()}
      </section>
    {/if}
    {@render waiting()}
  </Stage>
{/snippet}

{#snippet waiting()}
  {#if reveal === null && yourValue !== null}
    <div class="panel waiting" role="status">
      <p class="held">
        Answer in{#if landed !== null}<span
            class="band"
            title={landed.sentence}
            aria-label={landed.sentence}>{landed.badge}</span
          >{/if}
      </p>
      <p class="room">
        {#if $answerCount !== null && $answerCount.of > 0}
          <span class="count">{$answerCount.answered} of {$answerCount.of}</span>
          answered — waiting for the room
        {:else}
          Waiting for the room
        {/if}
      </p>
    </div>
  {/if}
{/snippet}

{#if question.random_event}
  <RandomEvent {question} {reveal} {yourValue} {result} {onAnswer} {live} {nextAt} below={waiting}>
    {@render children?.()}
  </RandomEvent>
{:else}
  <Question {question} {reveal} {yourValue} {result} {onAnswer} frame={staged} />
{/if}

<style>
  /* The foot of the sheet, two host lines tall whatever is on it yet: a waiting line that
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

  /* The points keep their width, so the host's line is what wraps; a squeezed
     "No answer · +0" would break onto a second line and grow the foot. */
  .said > :global(.slot) {
    flex: none;
    white-space: nowrap;
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

  .waiting {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    padding: calc(0.6rem - var(--border-give)) calc(1rem - var(--border-give));
    font-size: 0.9rem;
  }

  .waiting p {
    margin: 0;
  }

  .held {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-weight: 600;
  }

  .room {
    color: var(--muted);
  }

  .count {
    color: var(--ink);
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .band {
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-variant-numeric: tabular-nums;
    cursor: help;
  }
</style>
