<script lang="ts">
  /**
   * The stage's sheet (section 8 of ideas/design.md), drawn as the theme's `sheet` says by
   * its component in `sheets/`. This file holds what every sheet shares: the paper, the
   * words on it and the award pinned to it.
   *
   * Every sheet sets its words in by the scroll's margins, `--frame-*`, and draws its
   * decorations inside them, so the same words make the same size of sheet in every theme.
   *
   * It is inline SVG and CSS on layer 8's tokens rather than an image, because an `<img>`
   * cannot read the theme's custom properties (section 13). `--scroll-scale` on any ancestor
   * sizes the rolls, margins and pin, and `--scroll-text` the words.
   *
   * Whatever is drawn on the sheet reads `--ink` and `--muted`, which the sheet points at
   * the scroll's own inks, so a stem needs no idea what it is written on to be legible.
   *
   * Outside this file and `sheets/` only the root is styled: `.scroll`, or `[data-sheet]`
   * for what is written on a sheet. The stage asks for anything deeper through the props
   * below, so a wrapper renamed here breaks nothing elsewhere.
   */
  import type { Snippet } from 'svelte'

  import { NO_AWARD, pinFor, type Award } from '../../lib/award'
  import type { Sheet } from '../../lib/sheet'
  import Confetti from './Confetti.svelte'
  import Rosette from './Rosette.svelte'
  import { SHEETS } from './sheets'

  let {
    award = NO_AWARD,
    sheet = 'scroll',
    theme = '',
    hideWords = false,
    fill = false,
    edge = false,
    content = $bindable(null),
    children: words,
  }: {
    award?: Award
    sheet?: Sheet
    /** The page's theme, which picks the rosette's mark. */
    theme?: string
    /** Fade the words off the sheet and keep them off, the sheet itself staying put. */
    hideWords?: boolean
    /** Stretch the sheet to the height its parent gives it, as the TV's does. */
    fill?: boolean
    /**
     * Under 448px of screen, run the words to 1rem inside the cut rolls, for a sheet laid
     * edge to edge across the screen.
     */
    edge?: boolean
    /** The element the words are written in. */
    content?: HTMLElement | null
    children: Snippet
  } = $props()

  const pin = $derived(pinFor(theme))
  const Drawn = $derived(SHEETS[sheet])
</script>

<div class="scroll" class:fill class:edge data-sheet={sheet}>
  <Drawn>
    {#snippet children(behind, over)}
      <div class="reveal">
        <div class="paper">
          {@render behind?.()}
          <div class="content" class:hidden={hideWords} bind:this={content}>
            {@render words()}
          </div>
        </div>
        {@render over?.()}
        {#if award.kind !== 'none'}
          <!-- Hidden from a screen reader: the points slot has already said the verdict. -->
          <div class="award" aria-hidden="true" data-award={award.kind}>
            <span class="pin"><Rosette mark={pin} /></span>
            {#if award.kind === 'confetti'}
              <Confetti />
            {/if}
          </div>
        {/if}
      </div>
    {/snippet}
  </Drawn>
</div>

<style>
  .scroll {
    --k: var(--scroll-scale, 1);
    --roll-w: calc(26px * var(--k));
    --finial: calc(22px * var(--k));
    --tuck: calc(5px * var(--k));
    /* How far every sheet sets its words in: the scroll's rolls and margins. */
    --frame-top: calc(16.5px * var(--k) + 1.1rem * var(--k));
    --frame-side: calc(26px * var(--k) + 0.9rem * var(--k));
    --frame-bottom: calc(16.5px * var(--k) + 1rem * var(--k));
    position: relative;
    padding: calc(var(--finial) * 0.75) calc(var(--roll-w) - var(--tuck));
  }

  /* What a sheet may set on the root for itself, at no specificity, so its own rule wins. */
  :where(.scroll) {
    /* The border a sheet draws round its paper, which its paper's padding gives back. */
    --rim: 0px;
    filter: drop-shadow(0 3px 0 rgb(0 0 0 / 0.22));
  }

  /* Only the scroll has rolls to make room for. */
  .scroll:not([data-sheet='scroll']) {
    --roll-w: 0px;
    --finial: 0px;
    --tuck: 0px;
  }

  .reveal {
    position: relative;
    box-sizing: border-box;
    padding: var(--rim);
  }

  .paper {
    --ink: var(--scroll-ink);
    --muted: var(--scroll-muted);
    position: relative;
    display: flex;
    flex-direction: column;
    padding: calc(1.1rem * var(--k)) calc(0.9rem * var(--k) + var(--tuck)) calc(1rem * var(--k));
    /* Four lines of prompt at the least, so a one-liner still makes a sheet. */
    min-height: calc(
      var(--scroll-lines, 4) * 1.3 * max(1rem, 1.2rem * var(--scroll-text, 1)) + 2.1rem * var(--k)
    );
    background: var(--scroll-paper);
    color: var(--ink);
    --font-display: 'RuneScape', var(--font-body);
    --font-numeric: var(--font-display);
    font-family: var(--font-display);
    font-synthesis: none;
    /* Every sheet centres its words; only the host's bubble reads from the left. */
    text-align: center;
  }

  /* At the paper's own specificity, so an `edge` sheet's phone padding still wins. */
  :where(.scroll:not([data-sheet='scroll'])) .paper {
    padding: calc(var(--frame-top) - var(--rim)) calc(var(--frame-side) - var(--rim))
      calc(var(--frame-bottom) - var(--rim));
  }

  /* A column, so a line on the sheet can centre itself in whatever height is left. */
  .content {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* As long as a random event's NPC takes to leave, `RETURN_GUEST_OUT_MS` of `lib/interlude.ts`. */
  .content.hidden {
    opacity: 0;
    animation: words-out 225ms ease-in both;
  }

  @keyframes words-out {
    from {
      opacity: 1;
    }
  }

  .fill,
  .fill > .reveal {
    display: flex;
    flex-direction: column;
  }

  .fill > .reveal,
  .fill > .reveal > .paper {
    flex: 1;
  }

  /* A hand-over holds the scroll at a size while what is on it changes: the sheet fills
     it, whatever its words would make it. */
  .scroll:global(.morphing) {
    box-sizing: border-box;
  }

  .scroll:global(.morphing) .reveal {
    height: 100%;
  }

  .scroll:global(.morphing) .paper {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* The pin hangs from the sheet's bottom edge, 65% of the way across. */
  .award {
    position: absolute;
    z-index: 2;
    left: 65%;
    bottom: calc(-42px * var(--k));
    width: calc(42px * var(--k));
    height: calc(66px * var(--k));
    transform: translateX(-50%);
  }

  .pin {
    display: block;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 2px 0 rgb(0 0 0 / 0.3));
    transform-origin: 50% 30%;
    animation: pin 200ms ease-out;
  }

  @keyframes pin {
    from {
      transform: scale(0.4) rotate(-20deg);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pin {
      animation: none !important;
    }

    .content.hidden {
      animation: none !important;
    }
  }

  /* Under 448px of screen the sheet runs edge to edge and the screen cuts the rolls in half,
     as `sheets/Scroll.svelte` places them. */
  @media (max-width: 447.98px) {
    .scroll {
      padding-inline: 0;
    }

    .edge .paper {
      padding-inline: calc(var(--roll-w) / 2 + 1rem);
    }
  }
</style>
