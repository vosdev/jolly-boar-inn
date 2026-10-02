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
   */
  import type { Snippet } from 'svelte'

  import GemButton, { GEMS, gemState } from './GemButton.svelte'

  let {
    options,
    picked,
    answer,
    revealed,
    canAnswer,
    onAnswer,
    label,
  }: {
    options: Option[]
    /** Our pick: empty, or one index. */
    picked: ReadonlySet<number>
    /** The right option's index; empty until the reveal. */
    answer: ReadonlySet<number>
    revealed: boolean
    canAnswer: boolean
    onAnswer: (index: number) => void
    label: Snippet<[Option, number]>
  } = $props()

  // Six is the cap (section 2), and a pack that broke it must still draw something: a
  // seventh option reuses the last gem rather than vanishing.
  const gemAt = (index: number) => GEMS[Math.min(index, GEMS.length - 1)] ?? null

  const settled = $derived(
    revealed && [...answer].some((index) => index >= 0 && index < options.length),
  )
  /** The rows under the answer: three across at most, and four as two by two. */
  const columns = $derived.by(() => {
    const rest = options.length - 1
    return rest === 4 ? 2 : Math.max(1, Math.min(rest, 3))
  })
  const sizeAt = (index: number) => (!settled ? 'normal' : answer.has(index) ? 'large' : 'small')
</script>

<div class="gems" class:settled style:--columns={columns}>
  {#each options as option, index (index)}
    <GemButton
      gem={gemAt(index)}
      status={gemState(index, picked, answer, revealed)}
      mine={picked.has(index)}
      size={sizeAt(index)}
      disabled={revealed || !canAnswer || picked.size > 0}
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

  .settled {
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  }

  .settled > :global(.large) {
    grid-column: 1 / -1;
    order: -1;
  }
</style>
