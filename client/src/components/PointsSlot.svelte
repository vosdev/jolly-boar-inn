<script lang="ts" module>
  import { itemName, type ItemPoints } from '../lib/heldItems'
  import type { PlayerResult } from '../lib/protocol'

  const numbers = new Intl.NumberFormat('en-GB')

  type Outcome = 'right' | 'wrong' | 'graded' | 'none' | 'unscored'

  function outcomeOf(result: PlayerResult | null, canAnswer: boolean): Outcome {
    if (!canAnswer) return 'unscored'
    if (result === null) return 'none'
    if (result.correct) return 'right'
    return result.points > 0 ? 'graded' : 'wrong'
  }

  /** The whole slot in one sentence, for a screen reader reading the slot. */
  export function verdictSentence(
    result: PlayerResult | null,
    canAnswer: boolean,
    total: number | null,
    item: ItemPoints | null = null,
  ): string {
    const points = `+${numbers.format(result?.points ?? 0)}`
    const said = {
      right: `Right, ${points} points`,
      wrong: 'Wrong, no points',
      graded: `${points} points`,
      none: 'No answer, no points',
      unscored: 'Not scored for you',
    }[outcomeOf(result, canAnswer)]
    const found =
      item === null
        ? ''
        : `. ${itemName(item.item, item.charges)}, +${numbers.format(item.points)} more`
    return said + found + (total === null ? '' : `. ${numbers.format(total)} in total.`)
  }
</script>

<script lang="ts">
  /**
   * Your points for the question just revealed (section 10).
   *
   * One slot, in the same place in every mode, so the player learns where to look once:
   * a chip at the right end of the dialogue box's name row, where the host reacts to it, and
   * on a plaque where there is no box. Never inside a type's view. It is where the verdict
   * lives now that no button turns green or red:
   *
   * | Outcome                | Shows                                  |
   * |------------------------|----------------------------------------|
   * | Right                  | `+850`, in `--ok` on the plaque        |
   * | Wrong                  | `+0`, in `--bad` on the plaque         |
   * | No answer              | `No answer · +0`, muted                |
   * | Graded (closest guess) | `+340`, and the number is the verdict  |
   *
   * A timeout is not a wrong answer, and says so. On the chip the verdict is in the box's
   * ink, since `--ok` and `--bad` are measured against `--panel` and not `--panel-raised`;
   * the number and the host's line carry it. A running total, where one is given, goes under the
   * points. What the slot never carries is the reason for the number: a speed bonus
   * explained mid-reveal is a second thing to read in a beat that is already short.
   * An item's points are the one addition, as their own part with its icon: "+120" then
   * "Ring of Life +380", since the item is already on screen and its name explains them.
   *
   * It is not a live region: the sentence is there for a screen reader that reads the slot.
   */

  import ItemIcon from './ItemIcon.svelte'

  let {
    result,
    canAnswer,
    total = null,
    chip = false,
    item = null,
  }: {
    /** Our row of `question_closed.results`; null if we did not answer. */
    result: PlayerResult | null
    /** False when the question was never ours to score: the slot says so instead. */
    canAnswer: boolean
    /** Our points after this question, from the standings; null to leave it off. */
    total?: number | null
    /** A chip on the dialogue box's name row rather than a plaque of its own. */
    chip?: boolean
    /** What your item added on this close; null when it added nothing. */
    item?: ItemPoints | null
  } = $props()

  const outcome = $derived(outcomeOf(result, canAnswer))
  const points = $derived(`+${numbers.format(result?.points ?? 0)}`)
  const spoken = $derived(verdictSentence(result, canAnswer, total, item))
</script>

<div class="slot {outcome}" class:surface={!chip} class:plaque={!chip} class:chip>
  <span class="sr">{spoken}</span>
  <p class="earned" aria-hidden="true">
    {#if outcome === 'none'}
      No answer · +0
    {:else if outcome === 'unscored'}
      Not scored
    {:else}
      {points}
    {/if}
    {#if item !== null}
      <span class="item-part"
        ><ItemIcon id={item.item} charges={item.charges} size={chip ? 18 : 22} label="" />
        {itemName(item.item, item.charges)} +{numbers.format(item.points)}</span
      >
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

  /* No taller than the name beside it, so the box does not grow when the points arrive. */
  .chip {
    margin-block: -0.2rem;
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 3px;
  }

  .chip .earned {
    font-size: 1.15rem;
    line-height: 1;
  }

  .chip.none .earned {
    font-size: 0.9rem;
  }

  .item-part {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding-left: 0.35rem;
    border-left: 1px solid var(--line);
    font-size: 0.8em;
    color: var(--ink);
    white-space: nowrap;
  }

  .total {
    color: var(--muted);
    font-size: 0.95rem;
  }
</style>
