<script lang="ts">
  /**
   * Your points for the question just revealed, over your running total (D8, section 7.2).
   *
   * One slot, in the same place in every mode, so the player learns where to look once:
   * `Room` draws it at the head of the reveal, never inside a type's view. It is where the
   * verdict lives now that no button turns green or red:
   *
   * | Outcome                | Shows                                  |
   * |------------------------|----------------------------------------|
   * | Right                  | `+850` with ✓, in `--ok`               |
   * | Wrong                  | `+0` with ✗, in `--bad`                |
   * | No answer              | `No answer · +0`, muted, and no ✗      |
   * | Graded (closest guess) | `+340`, and the number is the verdict  |
   *
   * A timeout is not a wrong answer, and says so. Under the points, in `--muted` and the
   * same tabular figures, is the running total: the number the standings are about to
   * show, from the same `standings` they will show it from, so the two cannot disagree.
   * What the slot does not carry is the reason for the number: a speed bonus explained
   * mid-reveal is a second thing to read in a beat that is already short.
   */
  import type { PlayerResult } from '../lib/protocol'

  let {
    result,
    canAnswer,
    total,
  }: {
    /** Our row of `question_closed.results`; null if we did not answer. */
    result: PlayerResult | null
    /** False when the question was never ours to score: the slot says so instead. */
    canAnswer: boolean
    /** Our points after this question, from the standings; null if we are not in them. */
    total: number | null
  } = $props()

  const numbers = new Intl.NumberFormat('en-GB')

  type Outcome = 'right' | 'wrong' | 'graded' | 'none' | 'unscored'
  const outcome = $derived<Outcome>(
    !canAnswer
      ? 'unscored'
      : result === null
        ? 'none'
        : result.correct
          ? 'right'
          : result.points > 0
            ? 'graded'
            : 'wrong',
  )
  const points = $derived(`+${numbers.format(result?.points ?? 0)}`)
  /** The whole slot in one sentence, for a screen reader. */
  const spoken = $derived(
    {
      right: `Right, ${points} points`,
      wrong: 'Wrong, no points',
      graded: `${points} points`,
      none: 'No answer, no points',
      unscored: 'Not scored for you',
    }[outcome] + (total === null ? '' : `. ${numbers.format(total)} in total.`),
  )
</script>

<div class="slot surface {outcome}" role="status">
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
    align-items: flex-end;
    min-width: 6.5rem;
    padding: calc(0.35rem - var(--border-give)) calc(0.7rem - var(--border-give));
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
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

  .right .earned {
    color: var(--ok);
  }

  .wrong .earned {
    color: var(--bad);
  }

  .none .earned,
  .unscored .earned {
    color: var(--muted);
    font-size: 1rem;
    font-weight: 600;
  }

  .glyph {
    font-size: 1.1rem;
  }

  .total {
    color: var(--muted);
    font-size: 0.95rem;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
