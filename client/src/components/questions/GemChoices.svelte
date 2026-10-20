<script lang="ts" generics="Option">
  /**
   * The options of a "pick one of these" question, one gem each, in position order.
   *
   * One column on a phone and as many as fit beside each other above that, so six
   * 56px buttons stack to about 380px on a 375px screen, which leaves the prompt on it.
   *
   * The reveal changes the layout, not a colour: the answer is drawn large across the
   * top, and the rest go small beneath it, in one row for up to three and two rows for
   * four or five. They keep their position order, and so does the DOM: the answer moves
   * up with CSS `order`, so a screen reader still reads the options one to six. While a
   * pick waits for everyone else, the layout stays as it was and only the fade speaks.
   * What an option says is the caller's — a written answer, a price — through `label`;
   * which gem it is, and what state it is in, is decided here, the same way for every
   * mode that uses it.
   *
   * With `ticked`, a tap ticks or unticks an option instead of answering with it, and
   * `full` holds the unticked ones once as many are ticked as the question takes. An
   * answer of several options reveals with all of them lit across the top at their usual
   * size, since several large ones would push the rest off a phone.
   *
   * Given `results` on the reveal, every option says how many picked it.
   */
  import type { Snippet } from 'svelte'

  import type { PlayerResult } from '../../lib/protocol'
  import GemButton, { GEMS, gemState, pickCounts } from './GemButton.svelte'

  let {
    options,
    picked,
    answer,
    revealed,
    canAnswer,
    onAnswer,
    label,
    ticked = null,
    full = false,
    compact = false,
    results = null,
  }: {
    options: Option[]
    /** What we answered: empty until it is sent. */
    picked: ReadonlySet<number>
    /** The right option's index; empty until the reveal. */
    answer: ReadonlySet<number>
    revealed: boolean
    canAnswer: boolean
    onAnswer: (index: number) => void
    label: Snippet<[Option, number]>
    /** The options ticked so far, before submitting; null where a tap answers. */
    ticked?: ReadonlySet<number> | null
    /** As many are ticked as may be: the rest are held. */
    full?: boolean
    /** Gems drop to 44px, for a caller whose button would otherwise sit below the screen. */
    compact?: boolean
    /** `question_closed.results`, for each option's count; null while open. */
    results?: Record<string, PlayerResult> | null
  } = $props()

  // Six is the cap (section 2), and a pack that broke it must still draw something: a
  // seventh option reuses the last gem rather than vanishing.
  const gemAt = (index: number) => GEMS[Math.min(index, GEMS.length - 1)] ?? null

  const settled = $derived(
    revealed && [...answer].some((index) => index >= 0 && index < options.length),
  )
  /** The rows under the answer: three across at most, and four as two by two. */
  const columns = $derived.by(() => {
    const rest = options.length - answer.size
    return rest === 4 ? 2 : Math.max(1, Math.min(rest, 3))
  })
  const counts = $derived(revealed && results !== null ? pickCounts(results, options.length) : null)
  const answered = $derived(results === null ? 0 : Object.keys(results).length)
  const sizeAt = (index: number) =>
    !settled ? 'normal' : !answer.has(index) ? 'small' : answer.size > 1 ? 'normal' : 'large'
  const heldAt = (index: number) =>
    revealed || !canAnswer || picked.size > 0 || (full && !ticked?.has(index))
</script>

<div class="gems" class:settled class:compact={compact && !revealed} style:--columns={columns}>
  {#each options as option, index (index)}
    <GemButton
      gem={gemAt(index)}
      status={gemState(index, picked, answer, revealed)}
      mine={picked.has(index)}
      size={sizeAt(index)}
      checked={ticked === null || picked.size > 0 || revealed || !canAnswer
        ? null
        : ticked.has(index)}
      votes={counts === null ? null : { count: counts[index] ?? 0, of: answered }}
      disabled={heldAt(index)}
      onclick={() => onAnswer(index)}
    >
      {@render label(option, index)}
    </GemButton>
  {/each}
</div>

<style>
  .gems {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.5rem;
  }

  .compact > :global(.gem) {
    min-height: 44px;
  }

  .settled {
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  }

  .settled > :global(.correct) {
    grid-column: 1 / -1;
    order: -1;
  }
</style>
