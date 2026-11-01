<script lang="ts" generics="Option">
  /**
   * The options of a "pick one of these" question, one gem each, in position order.
   *
   * Two abreast on a phone, 56px tall, an odd last one across the row, so six take three
   * rows and leave the prompt on a 375px screen. On a stage wide enough (the desktop
   * frame's) they are at least 84px tall, three abreast, except two and four, which go two
   * abreast; five centre their last two. The width is the stage's, not the window's, so a
   * preview lays out as the room would at its size.
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
   * An answer of several options reveals with all of them lit across the top at their usual
   * size, since several large ones would push the rest off a phone.
   *
   * Given `results` on the reveal, every option says how many picked it, and with `named`
   * in the desktop room who (`lib/pickers.svelte.ts`).
   *
   * `stacked` is for options that run to whole sentences, which two abreast would stretch
   * past the phone's height: one a row on a phone, reveal included. A wide stage is as above.
   */
  import type { Snippet } from 'svelte'

  import { pickersAt, revealPickers } from '../../lib/pickers.svelte'
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
    results = null,
    named = false,
    stacked = false,
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
    /** `question_closed.results`, for each option's count; null while open. */
    results?: Record<string, PlayerResult> | null
    /** Name each option's pickers on it: a pick of one, never pick-all's several. */
    named?: boolean
    /** One option a row on a phone. */
    stacked?: boolean
  } = $props()

  const room = revealPickers()

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
  const held = $derived(revealed || !canAnswer || picked.size > 0)
</script>

<div
  class="gems"
  class:settled
  class:stacked
  class:pairs={options.length === 2 || options.length === 4}
  class:five={options.length === 5}
  class:odd={options.length % 2 === 1}
  style:--columns={columns}
>
  {#each options as option, index (index)}
    <GemButton
      gem={gemAt(index)}
      status={gemState(index, picked, answer, revealed)}
      mine={picked.has(index)}
      size={sizeAt(index)}
      votes={counts === null ? null : { count: counts[index] ?? 0, of: answered }}
      pickers={named && revealed ? pickersAt(room, results, index, answer.has(index)) : null}
      disabled={held}
      onclick={() => onAnswer(index)}
    >
      {@render label(option, index)}
    </GemButton>
  {/each}
</div>

<style>
  /* Six tracks, so a gem can take half the row or a third of it. */
  .gems {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .gems:not(.settled) > :global(*) {
    grid-column: span 3;
  }

  .odd:not(.settled) > :global(:last-child) {
    grid-column: 1 / -1;
  }

  .stacked:not(.settled) > :global(*) {
    grid-column: 1 / -1;
  }

  @container (min-width: 40rem) {
    .gems:not(.settled) {
      gap: 0.75rem;
    }

    .gems:not(.settled) > :global(*) {
      grid-column: span 2;
      min-height: 84px;
      font-size: 1.15rem;
    }

    .pairs:not(.settled) > :global(*) {
      grid-column: span 3;
    }

    .odd:not(.settled) > :global(:last-child) {
      grid-column: span 2;
    }

    .five:not(.settled) > :global(:nth-child(4)) {
      grid-column: 2 / span 2;
    }

    .five:not(.settled) > :global(:last-child) {
      grid-column: 4 / span 2;
    }
  }

  .settled {
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  }

  .settled > :global(.correct) {
    grid-column: 1 / -1;
    order: -1;
  }

  .stacked.settled {
    grid-template-columns: minmax(0, 1fr);
  }

  @container (min-width: 40rem) {
    .stacked.settled {
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    }
  }
</style>
