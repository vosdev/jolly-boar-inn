<script lang="ts" generics="Option">
  /**
   * The options of a "pick one of these" question, one gem each, in position order (D8).
   *
   * One column on a phone and as many as fit beside each other above that, so seven
   * 56px buttons stack to about 440px on a 375px screen, which leaves the prompt on it.
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
    /** Our pick, or null. */
    picked: number | null
    /** The right option's index; null until the reveal. */
    answer: number | null
    revealed: boolean
    canAnswer: boolean
    onAnswer: (index: number) => void
    label: Snippet<[Option, number]>
  } = $props()

  // Seven is the cap (section 2), and a pack that broke it must still draw something: an
  // eighth option reuses the last gem rather than vanishing.
  const gemAt = (index: number) => GEMS[Math.min(index, GEMS.length - 1)]
</script>

<div class="gems">
  {#each options as option, index (index)}
    <GemButton
      gem={gemAt(index)}
      status={gemState(index, picked, answer, revealed)}
      mine={picked === index}
      disabled={revealed || !canAnswer || picked !== null}
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
</style>
