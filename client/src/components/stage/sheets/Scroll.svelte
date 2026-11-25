<script lang="ts">
  /**
   * The clue scroll: a sheet torn top and bottom between two upright rolls, after the game's
   * quest reward scroll. The rolls' knobs are fixed-size pieces and only a roll's body
   * stretches, along its length, where its bands run, so no height of sheet distorts them.
   */
  import Facets from './Facets.svelte'
  import type { SheetProps } from './index'

  let { children }: SheetProps = $props()
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
    <path
      class="stroke"
      d="M8 14.5C8 8 13 3.5 20 3.5S32 8 32 14.5zM13 14h14v5H13zM17 0.8h6v2.7h-6z"
    />
  </svg>
{/snippet}

{#snippet behind()}
  <Facets />
{/snippet}

{@render roll('left')}
{@render children(behind, undefined)}
{@render roll('right')}

<style>
  :global(.scroll[data-sheet='scroll'] .paper) {
    box-shadow:
      inset 14px 0 12px -10px color-mix(in srgb, var(--scroll-edge) 55%, transparent),
      inset -14px 0 12px -10px color-mix(in srgb, var(--scroll-edge) 55%, transparent);
    /* Torn top and bottom: the notches keep their depth in px and spread across in %. */
    clip-path: polygon(
      0 7px,
      7% 3px,
      15% 6px,
      24% 1px,
      29% 3px,
      31% 13px,
      33.5% 3px,
      45% 5px,
      57% 0,
      66% 4px,
      72% 1px,
      74% 10px,
      76.5% 2px,
      88% 6px,
      100% 3px,
      100% calc(100% - 6px),
      92% calc(100% - 2px),
      81% calc(100% - 5px),
      69% calc(100% - 1px),
      61% calc(100% - 4px),
      49% calc(100% - 3px),
      47% calc(100% - 12px),
      45% calc(100% - 2px),
      33% calc(100% - 6px),
      22% calc(100% - 1px),
      12% calc(100% - 5px),
      0 calc(100% - 2px)
    );
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

  /* The rolls' wood and paper: flat bands, like the game's own shading. */
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

  /* Under 448px of screen the sheet runs edge to edge and the screen cuts the rolls in half,
     so the roll's centre sits on the edge. */
  @media (max-width: 447.98px) {
    .roll.left {
      left: calc(-0.5 * var(--roll-w));
    }

    .roll.right {
      right: calc(-0.5 * var(--roll-w));
    }
  }
</style>
