<script lang="ts" module>
  /**
   * The seven gems, in the game's value order, which is also the order of the options:
   * position 1 is always sapphire, position 2 always emerald (section 2). A two-option
   * question shows sapphire and emerald, never sapphire and zenyte.
   */
  export const GEMS = [
    'sapphire',
    'emerald',
    'ruby',
    'diamond',
    'dragonstone',
    'onyx',
    'zenyte',
  ] as const

  export type Gem = (typeof GEMS)[number]

  /**
   * The five states of section 2, and nothing else:
   *
   * - `idle`: answerable, or held because somebody else's answer is not ours to see.
   * - `waiting`: we pressed this one and the question is still open.
   * - `correct`: revealed, and this is the answer. Keeps its gem and gains the `--ok` ring.
   * - `faded`: revealed, and this is not the answer. Loses its fill, never its text.
   * - `wrong`: revealed, not the answer, and ours. Faded like the rest, with a ✗ and "you".
   */
  export type GemState = 'idle' | 'waiting' | 'correct' | 'faded' | 'wrong'

  export function gemState(
    index: number,
    picked: number | null,
    answer: number | null,
    revealed: boolean,
  ): GemState {
    if (!revealed) return picked === index ? 'waiting' : 'idle'
    if (answer === index) return 'correct'
    return picked === index ? 'wrong' : 'faded'
  }
</script>

<script lang="ts">
  /**
   * One answer on a gem (D8): the button `multiple_choice`, `price_is_right` and, later,
   * `ordering` all answer with.
   *
   * **On reveal no button changes colour.** That is the whole of section 2's rule, and
   * everything here serves it. The winner keeps its own gem and gains an `--ok` ring and
   * a ✓; every other button fades to a wash of its gem over the panel, with its text at
   * full strength because people want to read what the other options said; your own
   * wrong pick fades too but keeps a ✗ and a "you". Green and red never become a fill,
   * so an emerald button cannot spend half a second looking right.
   *
   * Every state is carried by a shape as well as a colour — a ring, a glyph, a word — so
   * the reveal reads the same with the colour taken out: the only ✓ is the answer, the
   * only ✗ is yours, and the "you" says which one you pressed.
   *
   * `gem: null` is the plain variant, for `more_less`, whose two buttons carry a picture
   * and keep the panel's colours rather than a gem's (section 2), but whose reveal obeys
   * the same five states: the plain one fades by dropping to `--muted` behind a dashed
   * edge instead of losing a fill it never had.
   *
   * The fade is `color-mix(in srgb, gem 25%, panel)`. `server/scripts/check_contrast.py`
   * holds `--gem-ink` to 4.5:1 against exactly that mix in every theme, as
   * `FADED_GEM_SHARE`; change the two together.
   */
  import type { Snippet } from 'svelte'

  let {
    gem,
    status,
    mine = false,
    disabled,
    onclick,
    children,
  }: {
    /** Which gem; null for the plain panel button. */
    gem: Gem | null
    status: GemState
    /**
     * We pressed this one. `waiting` and `wrong` already say so; this is for the one
     * state that does not, a right answer, which keeps its "you" on the reveal.
     */
    mine?: boolean
    disabled: boolean
    onclick: () => void
    children: Snippet
  } = $props()

  const yours = $derived(mine || status === 'waiting' || status === 'wrong')
  /** What the glyphs and the "you" say, in words, for a screen reader. */
  const spoken = $derived(
    {
      idle: '',
      waiting: ', your answer',
      correct: mine ? ', the correct answer, yours' : ', the correct answer',
      faded: '',
      wrong: ', your answer, wrong',
    }[status],
  )
</script>

<button
  type="button"
  class="gem {gem ?? 'plain'} {status}"
  aria-pressed={yours}
  {disabled}
  {onclick}
>
  {#if status === 'correct'}
    <span class="glyph ok" aria-hidden="true">✓</span>
  {:else if status === 'wrong'}
    <span class="glyph bad" aria-hidden="true">✗</span>
  {/if}
  <span class="content">{@render children()}</span>
  {#if yours}
    <span class="you" aria-hidden="true">you</span>
  {/if}
  {#if spoken !== ''}<span class="sr">{spoken}</span>{/if}
</button>

<style>
  .gem {
    --fill: var(--gem-sapphire);
    /* What the ring and the ink are drawn in: the gem's ink on a gem, the panel's on a
       plain button. */
    --mark: var(--gem-ink);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    /* Thumb targets at a pub table: 56px, whatever the answer's length. */
    min-height: 56px;
    padding: calc(0.5rem - var(--border-give)) calc(0.75rem - var(--border-give));
    background: var(--fill);
    color: var(--mark);
    border: var(--border-width) solid color-mix(in srgb, var(--fill) 55%, var(--mark));
    font-weight: 600;
    text-align: center;
    transition: background-color 200ms ease-out;
  }

  .sapphire {
    --fill: var(--gem-sapphire);
  }
  .emerald {
    --fill: var(--gem-emerald);
  }
  .ruby {
    --fill: var(--gem-ruby);
  }
  .diamond {
    --fill: var(--gem-diamond);
  }
  .dragonstone {
    --fill: var(--gem-dragonstone);
  }
  .onyx {
    --fill: var(--gem-onyx);
  }
  .zenyte {
    --fill: var(--gem-zenyte);
  }
  .plain {
    --fill: var(--panel);
    --mark: var(--ink);
  }

  .gem:hover:not(:disabled) {
    border-color: var(--mark);
  }

  /* A held button is still the answer it was, not a greyed-out control: the global
     disabled fade would take the text below 4.5:1, which is the one thing a faded
     option must keep. The states below say what disabled means here instead. */
  .gem:disabled {
    opacity: 1;
    cursor: default;
  }

  .content {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* Pressed and waiting: a heavy ring in the gem's own ink, which the contrast check
     holds to 4.5:1 on every gem, so it reads without any colour at all. */
  .waiting {
    box-shadow: inset 0 0 0 3px var(--mark);
  }

  /* The answer: its gem, untouched, and the --ok ring the check holds to 3:1 on every
     gem. Outside as well as in, so it also reads against the panel around it. */
  .correct {
    box-shadow:
      inset 0 0 0 3px var(--ok),
      0 0 0 2px var(--ok);
  }

  .faded,
  .wrong {
    background: color-mix(in srgb, var(--fill) 25%, var(--panel));
    border-color: var(--line);
    font-weight: 400;
  }

  .faded :global(*),
  .wrong :global(*) {
    font-weight: 400;
  }

  .wrong {
    box-shadow: inset 0 0 0 2px var(--bad);
  }

  /* A plain button has no fill to lose, so it recedes in its ink and its edge. --muted
     is held to 4.5:1 on --panel, so the text still reads. */
  .plain.faded,
  .plain.wrong {
    color: var(--muted);
    border-style: dashed;
  }

  /* A glyph brings its own ground, so its colour never has to read against a gem. */
  .glyph {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
  }

  .glyph.ok {
    background: var(--ok);
    color: var(--ok-ink);
  }

  .glyph.bad {
    background: var(--bad);
    color: var(--bad-ink);
  }

  .you {
    flex: none;
    padding: 0 0.35rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    line-height: 1.5;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .gem {
      transition: none;
    }
  }
</style>
