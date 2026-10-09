<script lang="ts">
  /**
   * The clue scroll (section 8 of ideas/design.md): a sheet torn top and bottom between two
   * upright rolls, drawn after the game's quest reward scroll.
   *
   * It is inline SVG and CSS on layer 8's tokens rather than an image, because an `<img>`
   * cannot read the theme's custom properties (section 13). The knobs are fixed-size
   * pieces and only a roll's body stretches, along its length, where its bands run, so no
   * height of sheet distorts them. `--scroll-scale` on any ancestor sizes the rolls,
   * margins and ribbon, and `--scroll-text` the words.
   *
   * Whatever is drawn on the sheet reads `--ink` and `--muted`, which the sheet points at
   * the scroll's own inks, so a stem needs no idea it is on parchment to be legible.
   */
  import type { Snippet } from 'svelte'

  import ribbonUrl from '../../assets/stage/ribbon.svg'
  import type { Award } from '../../lib/award'
  import Confetti from './Confetti.svelte'

  let {
    opening = false,
    award = 'none',
    children,
  }: {
    /** Unroll from the middle as it mounts; otherwise it is simply there. */
    opening?: boolean
    award?: Award
    children: Snippet
  } = $props()

</script>

{#snippet roll(side: 'left' | 'right')}
  <div class="roll {side}" aria-hidden="true">
    {@render finial('top')}
    <svg class="body" viewBox="0 0 40 10" preserveAspectRatio="none">
      <rect class="p" x="1.5" y="0" width="37" height="10" />
      <rect class="sh2" x="1.5" y="0" width="7.5" height="10" />
      <rect class="sh1" x="9" y="0" width="7" height="10" />
      <rect class="hi" x="22" y="0" width="6" height="10" />
      <rect class="sh1" x="32" y="0" width="6.5" height="10" />
      <rect class="ln" x="0" y="0" width="1.5" height="10" />
      <rect class="ln" x="38.5" y="0" width="1.5" height="10" />
    </svg>
    {@render finial('bottom')}
  </div>
{/snippet}

<!-- A roll's end at its natural size: knob, neck, rim, and the start of the roll. -->
{#snippet finial(end: 'top' | 'bottom')}
  <svg class="finial {end}" viewBox="0 0 40 34">
    <rect class="p" x="1.5" y="25" width="37" height="9" />
    <rect class="sh2" x="1.5" y="25" width="7.5" height="9" />
    <rect class="sh1" x="9" y="25" width="7" height="9" />
    <rect class="hi" x="22" y="25" width="6" height="9" />
    <rect class="sh1" x="32" y="25" width="6.5" height="9" />
    <rect class="ln" x="0" y="25" width="1.5" height="9" />
    <rect class="ln" x="38.5" y="25" width="1.5" height="9" />
    <path class="rim" d="M0 19h40v6.5H0z" />
    <path class="wood2 half" d="M20 19h20v6.5H20z" />
    <path class="stroke" d="M0 19h40v6.5H0z" />
    <rect class="wood" x="13" y="14" width="14" height="5" />
    <rect class="wood2" x="20" y="14" width="7" height="5" />
    <path class="wood" d="M8 14.5C8 8 13 3.5 20 3.5S32 8 32 14.5z" />
    <path class="wood2" d="M20 3.5c7 0 12 4.5 12 11H20z" />
    <rect class="wood2" x="17" y="0.8" width="6" height="3" />
    <path class="stroke" d="M8 14.5C8 8 13 3.5 20 3.5S32 8 32 14.5zM13 14h14v5H13zM17 0.8h6v2.7h-6z" />
  </svg>
{/snippet}

<div class="scroll" class:opening>
  {@render roll('left')}
  <div class="reveal">
    <div class="paper">
      <svg class="facets" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
        <path class="fl" d="M0 0L18 0L26 22L8 60L0 60Z" />
        <path class="fd" d="M18 0L40 0L34 30L26 22Z" />
        <path class="fl" d="M40 0L63 0L55 26L34 30Z" />
        <path class="fd" d="M26 22L34 30L30 60L8 60Z" />
        <path class="fl" d="M34 30L55 26L60 60L30 60Z" />
        <path class="fd" d="M63 0L84 0L78 34L55 26Z" />
        <path class="fd" d="M55 26L78 34L86 60L60 60Z" />
        <path class="fl" d="M84 0L100 0L100 44L78 34Z" />
        <path class="fd" d="M78 34L100 44L100 60L86 60Z" />
      </svg>
      <div class="content">
        {@render children()}
      </div>
    </div>
    {#if award !== 'none'}
      <!-- Hidden from a screen reader: the points slot has already said the verdict. -->
      <div class="award" aria-hidden="true" data-award={award}>
        <img class="ribbon" src={ribbonUrl} alt="" draggable="false" />
        {#if award === 'confetti'}
          <Confetti />
        {/if}
      </div>
    {/if}
  </div>
  {@render roll('right')}
</div>

<style>
  .scroll {
    --k: var(--scroll-scale, 1);
    --roll-w: calc(26px * var(--k));
    --finial: calc(22px * var(--k));
    --tuck: calc(5px * var(--k));
    position: relative;
    padding: calc(var(--finial) * 0.75) calc(var(--roll-w) - var(--tuck));
    filter: drop-shadow(0 3px 0 rgb(0 0 0 / 0.22));
  }

  .roll {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    width: var(--roll-w);
    display: flex;
    flex-direction: column;
  }

  .roll.left {
    left: 0;
  }

  .roll.right {
    right: 0;
    transform: scaleX(-1);
  }

  .roll svg {
    display: block;
    width: 100%;
    flex: none;
  }

  .finial {
    height: var(--finial);
  }

  .finial.bottom {
    transform: scaleY(-1);
  }

  .roll .body {
    flex: 1;
    height: 0;
    min-height: 0;
  }

  .reveal {
    position: relative;
  }

  .paper {
    --ink: var(--scroll-ink);
    --muted: var(--scroll-muted);
    position: relative;
    display: flex;
    flex-direction: column;
    padding: calc(1.1rem * var(--k)) calc(0.9rem * var(--k) + var(--tuck)) calc(1rem * var(--k));
    /* Four lines of prompt at the least, so a one-liner still makes a sheet. */
    min-height: calc(4 * 1.3 * max(1rem, 1.2rem * var(--scroll-text, 1)) + 2.1rem * var(--k));
    background: var(--scroll-paper);
    color: var(--ink);
    --font-display: 'RuneScape', var(--font-body);
    --font-numeric: var(--font-display);
    font-family: var(--font-display);
    font-synthesis: none;
    box-shadow:
      inset 14px 0 12px -10px color-mix(in srgb, var(--scroll-edge) 55%, transparent),
      inset -14px 0 12px -10px color-mix(in srgb, var(--scroll-edge) 55%, transparent);
    /* Torn top and bottom: the notches keep their depth in px and spread across in %. */
    clip-path: polygon(
      0 7px, 7% 3px, 15% 6px, 24% 1px, 29% 3px, 31% 13px, 33.5% 3px, 45% 5px, 57% 0,
      66% 4px, 72% 1px, 74% 10px, 76.5% 2px, 88% 6px, 100% 3px,
      100% calc(100% - 6px), 92% calc(100% - 2px), 81% calc(100% - 5px), 69% calc(100% - 1px),
      61% calc(100% - 4px), 49% calc(100% - 3px), 47% calc(100% - 12px), 45% calc(100% - 2px),
      33% calc(100% - 6px), 22% calc(100% - 1px), 12% calc(100% - 5px), 0 calc(100% - 2px)
    );
  }

  .facets {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* A column, so a line on the sheet can centre itself in whatever height is left. */
  .content {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* The rolls' wood and paper: flat bands, like the game's own shading. */
  .fl {
    fill: white;
    fill-opacity: var(--scroll-facet-light);
  }

  .fd {
    fill: var(--scroll-edge);
    fill-opacity: 0.08;
  }

  .p {
    fill: color-mix(in srgb, var(--scroll-paper), var(--scroll-edge) 12%);
  }

  .hi {
    fill: white;
    fill-opacity: 0.3;
  }

  .sh1 {
    fill: var(--scroll-edge);
    fill-opacity: 0.25;
  }

  .sh2 {
    fill: var(--scroll-edge);
    fill-opacity: 0.5;
  }

  .ln {
    fill: var(--scroll-edge);
  }

  .wood {
    fill: color-mix(in srgb, var(--scroll-paper), var(--scroll-edge) 45%);
  }

  .wood2 {
    fill: color-mix(in srgb, var(--scroll-paper), var(--scroll-edge) 70%);
  }

  .wood2.half {
    opacity: 0.5;
  }

  .rim {
    fill: color-mix(in srgb, var(--scroll-paper), var(--scroll-edge) 25%);
  }

  .stroke {
    fill: none;
    stroke: var(--scroll-edge);
    stroke-width: 1.3;
  }

  /* Open from the middle: the rolls travel outward and uncover the sheet between them. */
  .opening .roll.left {
    animation: roll-left 300ms ease-out;
  }

  .opening .roll.right {
    animation: roll-right 300ms ease-out;
  }

  .opening .reveal {
    animation: uncover 300ms ease-out;
  }

  @keyframes roll-left {
    from {
      left: calc(50% - var(--roll-w));
    }
  }

  @keyframes roll-right {
    from {
      right: calc(50% - var(--roll-w));
    }
  }

  @keyframes uncover {
    from {
      clip-path: inset(0 50%);
    }
    to {
      clip-path: inset(0 0);
    }
  }

  /* The ribbon hangs from the sheet's bottom edge, 65% of the way across. */
  .award {
    position: absolute;
    z-index: 2;
    left: 65%;
    bottom: calc(-42px * var(--k));
    width: calc(42px * var(--k));
    height: calc(66px * var(--k));
    transform: translateX(-50%);
  }

  .ribbon {
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
    .roll,
    .reveal,
    .ribbon {
      animation: none !important;
    }
  }

  /* Under 448px of screen the sheet runs edge to edge and the screen cuts the rolls in half,
     so the roll's centre sits on the edge. */
  @media (max-width: 447.98px) {
    .scroll {
      padding-inline: 0;
    }

    .roll.left {
      left: calc(-0.5 * var(--roll-w));
    }

    .roll.right {
      right: calc(-0.5 * var(--roll-w));
    }
  }
</style>
