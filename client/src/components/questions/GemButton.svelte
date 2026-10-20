<script lang="ts" module>
  /**
   * The six gems, which are also the order of the options: position 1 is always
   * sapphire, position 2 always emerald (section 2). A two-option question shows sapphire
   * and emerald, never sapphire and zenyte. Red topaz holds the fourth place diamond had,
   * because a near-white gem looked the same lit as faded; onyx, black on the dark
   * themes, went for the same reason.
   */
  export const GEMS = ['sapphire', 'emerald', 'ruby', 'red-topaz', 'dragonstone', 'zenyte'] as const

  export type Gem = (typeof GEMS)[number]

  /**
   * The five states of section 2. There are two looks between them, lit and faded, and a
   * "you" on whichever one we pressed:
   *
   * - `idle`: lit. Answerable, or held for somebody who cannot answer.
   * - `waiting`: lit, and ours; the question is still open and every other option fades.
   * - `correct`: lit. Revealed, and this is the answer, whoever pressed it.
   * - `faded`: revealed and not the answer, or not ours while ours waits.
   * - `wrong`: revealed, not the answer, and ours. Faded like the rest, and the "you" is
   *   the whole of the verdict on the button; the points slot says the rest.
   */
  export type GemState = 'idle' | 'waiting' | 'correct' | 'faded' | 'wrong'

  /**
   * Which state the option at `index` is in. `picked` and `answer` are sets rather than
   * one index each, so an answer of several options will not need a second signature.
   */
  export function gemState(
    index: number,
    picked: ReadonlySet<number>,
    answer: ReadonlySet<number>,
    revealed: boolean,
  ): GemState {
    if (!revealed) return picked.size === 0 ? 'idle' : picked.has(index) ? 'waiting' : 'faded'
    if (answer.has(index)) return 'correct'
    return picked.has(index) ? 'wrong' : 'faded'
  }

  /** One option index as a set, or the empty set for none. */
  export function indexSet(index: number | null): ReadonlySet<number> {
    return new Set(index === null ? [] : [index])
  }

  /**
   * How many picked each of `options` options, from `question_closed.results`: an index
   * for a pick of one, a list of indices for pick all that apply.
   */
  export function pickCounts(
    results: Record<string, { value: unknown }>,
    options: number,
  ): number[] {
    const counts: number[] = Array.from({ length: options }, () => 0)
    for (const { value } of Object.values(results)) {
      for (const index of Array.isArray(value) ? value : [value]) {
        if (Number.isInteger(index) && index >= 0 && index < options)
          counts[index] = (counts[index] ?? 0) + 1
      }
    }
    return counts
  }
</script>

<script lang="ts">
  /**
   * One answer on a gem: the button `multiple_choice` and `price_is_right` answer with.
   *
   * **On reveal no button changes colour.** That is the whole of section 2's rule, and
   * everything here serves it. The answer stays lit in its own gem and every other button
   * fades to a wash of its gem over the panel, with its text still readable because people
   * want to read what the other options said. A pick does the same while the question is
   * open: ours stays lit, the rest fade. No rings, no ✓ or ✗: lit or faded is the whole
   * signal, and a "you" marks what we pressed, right or wrong. Green and red never become
   * a fill, so an emerald button cannot spend half a second looking right.
   *
   * `gem: null` is the plain variant, for `more_less`, whose two buttons carry a picture
   * and keep the panel's colours rather than a gem's (section 2), but whose reveal obeys
   * the same five states: the plain one fades by dropping to `--muted` behind a dashed
   * edge instead of losing a fill it never had.
   *
   * Lit against faded is a fill and a weight, and the fade takes the edge's contrast with
   * it, so it still reads with the colour taken out.
   *
   * `size` is the reveal's layout (section 2): the answer is drawn `large` above the rest,
   * which are `small`, because a gem's hue is not the only thing that should say which
   * one was right. Everywhere else a button is `normal`.
   *
   * `checked` is for a question answered with several options: a box in the top right
   * corner, ticked or not, like a round's box on the create form. Ticking fades nothing,
   * so every option stays readable until the ticks are submitted. `place` puts a number in
   * the same box instead, for a question answered by putting its options in order.
   *
   * `tag: 'div'` is a gem that is not pressed itself, for an ordering row, which is moved by
   * a handle of its own: `end` puts it on the right, full height, and the box goes left.
   *
   * `votes` is the reveal's count of who picked it, with a bar along the bottom edge for
   * its share of who answered: how the room split, which nobody is named in, so it shows
   * whatever the room's `name_wrong_answers`. It is the one other thing a reveal adds. A
   * gem nobody picked shows no number, which its empty bar already says.
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
    size = 'normal',
    checked = null,
    place,
    said,
    votes = null,
    tag = 'button',
    disabled = false,
    onclick,
    end,
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
    size?: 'normal' | 'large' | 'small'
    /** Ticked or not, before a several-option answer is submitted; null for no box. */
    checked?: boolean | null
    /** Its number in a tapped order, null while untapped; leave it out for no box. */
    place?: number | null
    /** What a screen reader hears after the label, in place of what `status` says. */
    said?: string
    /** On a reveal: how many picked it, of how many answered; null for no count. */
    votes?: { count: number; of: number } | null
    tag?: 'button' | 'div'
    disabled?: boolean
    onclick?: () => void
    /** Something pressable of its own at the right edge; only on a `div`. */
    end?: Snippet
    children: Snippet
  } = $props()

  const yours = $derived(mine || status === 'waiting' || status === 'wrong')
  /** What lit, faded and the "you" say, in words, for a screen reader. */
  const spoken = $derived(
    said ??
      {
        idle: '',
        waiting: ', your answer',
        correct: mine ? ', the correct answer, yours' : ', the correct answer',
        faded: '',
        wrong: ', your answer, wrong',
      }[status],
  )
</script>

{#snippet inside()}
  <span class="content">{@render children()}</span>
  {#if checked !== null}
    <span class="tick" class:checked aria-hidden="true">{checked ? '✓' : ''}</span>
  {:else if place !== undefined}
    <span class="tick" class:checked={place !== null} aria-hidden="true">{place ?? ''}</span>
  {/if}
  {#if yours}
    <span class="you" aria-hidden="true">you</span>
  {/if}
  {#if votes !== null}
    {#if votes.count > 0}<span class="votes" aria-hidden="true">{votes.count}</span>{/if}
    <span class="bar" style:width="{votes.of === 0 ? 0 : (100 * votes.count) / votes.of}%"></span>
  {/if}
  {#if spoken !== ''}<span class="sr">{spoken}</span>{/if}
  {#if votes !== null}<span class="sr">, picked by {votes.count} of {votes.of}</span>{/if}
  {#if end !== undefined}<span class="end">{@render end()}</span>{/if}
{/snippet}

{#if tag === 'button'}
  <button
    type="button"
    class="gem {gem ?? 'plain'} {status} {size}"
    class:ticks={checked !== null || place !== undefined || end !== undefined}
    class:ended={end !== undefined}
    class:counted={votes !== null}
    aria-pressed={checked ?? (place === undefined ? yours : place !== null)}
    {disabled}
    {onclick}
  >
    {@render inside()}
  </button>
{:else}
  <div
    class="gem {gem ?? 'plain'} {status} {size}"
    class:ticks={checked !== null || place !== undefined || end !== undefined}
    class:ended={end !== undefined}
    class:counted={votes !== null}
  >
    {@render inside()}
  </div>
{/if}

<style>
  .gem {
    --fill: var(--gem-sapphire);
    /* What the text, the edge and the "you" are drawn in: the gem's ink on a gem, the
       panel's on a plain button. */
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
    /* A button has it from app.css; a div gem does not. */
    border-radius: min(var(--radius), 8px);
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
  .red-topaz {
    --fill: var(--gem-red-topaz);
  }
  .dragonstone {
    --fill: var(--gem-dragonstone);
  }
  .zenyte {
    --fill: var(--gem-zenyte);
  }
  .plain {
    --fill: var(--panel);
    --mark: var(--ink);
  }

  /* The revealed answer, above the rest. */
  .large {
    min-height: 84px;
    font-size: 1.25rem;
  }

  /* The options that were not the answer, under it, up to three across a phone. Held by
     then, so they are read rather than pressed and can go under the 56px a thumb needs;
     the "you" goes under the answer rather than beside it, where it would take a third
     of the width. */
  .small {
    flex-direction: column;
    gap: 0.2rem;
    min-height: 44px;
    padding: calc(0.35rem - var(--border-give)) calc(0.4rem - var(--border-give));
    font-size: 0.8rem;
  }

  button.gem:hover:not(:disabled) {
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

  /* A plain button has no fill to lose, so it recedes in its ink and its edge. --muted
     is held to 4.5:1 on --panel, so the text still reads. */
  .plain.faded,
  .plain.wrong {
    color: var(--muted);
    border-style: dashed;
  }

  /* Clear of the box, on both sides so the text stays centred. */
  .ticks {
    padding-inline: calc(2.5rem - var(--border-give));
  }

  .tick {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border: var(--border-width) solid var(--mark);
    border-radius: 4px;
    font-size: 1rem;
    line-height: 1;
  }

  .ended .tick {
    right: auto;
    left: 0.4rem;
  }

  .end {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
  }

  .tick.checked {
    background: var(--mark);
    color: var(--fill);
  }

  /* Filled in the lit gem's colour, a faded button's number would be its brightest part. */
  .faded .tick.checked {
    background: none;
    color: var(--mark);
  }

  .counted {
    overflow: hidden;
  }

  /* In the corner, clear of a centred label, like the tick box it never shares a button
     with: a count only comes with the reveal, and the boxes go with it. */
  .counted:not(.small) {
    padding-inline: calc(2.5rem - var(--border-give));
  }

  .votes {
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    line-height: 1;
  }

  .counted:not(.small) .votes {
    position: absolute;
    top: 0.45rem;
    right: 0.55rem;
  }

  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 4px;
    background: var(--mark);
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

  @media (prefers-reduced-motion: reduce) {
    .gem {
      transition: none;
    }
  }
</style>
