<script lang="ts" module>
  import type { PlayerResult } from '../lib/protocol'

  const numbers = new Intl.NumberFormat('en-GB')

  type Outcome = 'right' | 'wrong' | 'graded' | 'none' | 'unscored'

  function outcomeOf(result: PlayerResult | null, canAnswer: boolean): Outcome {
    if (!canAnswer) return 'unscored'
    if (result === null) return 'none'
    if (result.correct) return 'right'
    return result.points > 0 ? 'graded' : 'wrong'
  }

  /** The whole slot in one sentence, for a screen reader: `Room` announces it too. */
  export function verdictSentence(
    result: PlayerResult | null,
    canAnswer: boolean,
    total: number | null,
  ): string {
    const points = `+${numbers.format(result?.points ?? 0)}`
    const said = {
      right: `Right, ${points} points`,
      wrong: 'Wrong, no points',
      graded: `${points} points`,
      none: 'No answer, no points',
      unscored: 'Not scored for you',
    }[outcomeOf(result, canAnswer)]
    return said + (total === null ? '' : `. ${numbers.format(total)} in total.`)
  }
</script>

<script lang="ts">
  /**
   * Your points for the question just revealed (section 10).
   *
   * One slot, in the same place in every mode, so the player learns where to look once:
   * on the clue scroll, where the host says it at the foot of the sheet, and on a plaque
   * above a random event's card. Never inside a type's view. It is where the verdict
   * lives now that no button turns green or red:
   *
   * | Outcome                | Shows                                  |
   * |------------------------|----------------------------------------|
   * | Right                  | `+850` with ✓, in `--ok` on the plaque |
   * | Wrong                  | `+0` with ✗, in `--bad` on the plaque  |
   * | No answer              | `No answer · +0`, muted, and no ✗      |
   * | Graded (closest guess) | `+340`, and the number is the verdict  |
   *
   * A timeout is not a wrong answer, and says so. On the scroll the verdict is in the
   * scroll's ink, since `--ok` and `--bad` are measured against the panel and not the
   * parchment; the glyph carries it. A running total, where one is given, goes under the
   * points. What the slot never carries is the reason for the number: a speed bonus
   * explained mid-reveal is a second thing to read in a beat that is already short.
   *
   * It is not a live region of its own: one that appears already filled is often never
   * read, so `Room`'s announcer says the same sentence instead.
   */

  let {
    result,
    canAnswer,
    total = null,
    onScroll = false,
  }: {
    /** Our row of `question_closed.results`; null if we did not answer. */
    result: PlayerResult | null
    /** False when the question was never ours to score: the slot says so instead. */
    canAnswer: boolean
    /** Our points after this question, from the standings; null to leave it off. */
    total?: number | null
    /** Written on the clue scroll rather than on a plaque of its own. */
    onScroll?: boolean
  } = $props()

  const outcome = $derived(outcomeOf(result, canAnswer))
  const points = $derived(`+${numbers.format(result?.points ?? 0)}`)
  const spoken = $derived(verdictSentence(result, canAnswer, total))
</script>

<div class="slot {outcome}" class:surface={!onScroll} class:plaque={!onScroll}>
  <span class="sr">{spoken}</span>
  <p class="earned" aria-hidden="true">
    {#if outcome === 'right'}
      <span class="glyph">✓</span>{points}
    {:else if outcome === 'wrong'}
      <span class="glyph">✗</span>{points}
    {:else if outcome === 'none'}
      No answer · +0
    {:else if outcome === 'unscored'}
      Not scored
    {:else}
      {points}
    {/if}
  </p>
  {#if total !== null}
    <p class="total" aria-hidden="true">{numbers.format(total)}</p>
  {/if}
</div>

<style>
  /* A small plaque of its own, like Timer's was: it sits on the page beside the heading,
     and a theme's page may be a floor that --ok and --bad do not read against. */
  .slot {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
  }

  .plaque {
    align-items: flex-end;
    min-width: 6.5rem;
    padding: calc(0.35rem - var(--border-give)) calc(0.7rem - var(--border-give));
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    text-align: right;
  }

  p {
    margin: 0;
    line-height: 1.2;
  }

  .earned {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 1.6rem;
    font-weight: 700;
  }

  .plaque.right .earned {
    color: var(--ok);
  }

  .plaque.wrong .earned {
    color: var(--bad);
  }

  .none .earned,
  .unscored .earned {
    color: var(--muted);
    font-size: 1rem;
    font-weight: 600;
  }

  /* On the scroll it is one line of the sheet, sized with the words on it. */
  .slot:not(.plaque, .none, .unscored) .earned {
    font-size: max(1.2rem, 1.4rem * var(--scroll-text, 1));
  }

  .glyph {
    font-size: 1.1rem;
  }

  .total {
    color: var(--muted);
    font-size: 0.95rem;
  }
</style>
