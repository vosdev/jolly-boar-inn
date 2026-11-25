<script lang="ts">
  /**
   * Morytania's gravestone: a slab of grey stone under a low arch, an engraved rule inside
   * its edge, a crack down one side and moss at its foot. A long sheet, the hiscores, stands
   * up as a pillar.
   */
  import { ART } from '../../../lib/sheet'
  import Facets from './Facets.svelte'
  import type { SheetProps } from './index'

  let { children }: SheetProps = $props()
</script>

{#snippet behind()}
  <Facets />
  <svg class="crack" viewBox="0 0 60 70" aria-hidden="true">
    <path d="M40 0L34 18L42 28L30 46L34 56L26 70" />
  </svg>
  <!-- A clump of moss in each corner of its foot, the same size on any width of stone. -->
  <svg class="moss left" viewBox="0 0 48 16" aria-hidden="true">
    <ellipse cx="18" cy="11" rx="17" ry="5" fill={ART.mossDark} />
    <ellipse cx="17" cy="10" rx="13" ry="3.5" fill={ART.moss} />
    <ellipse cx="38" cy="13" rx="10" ry="3" fill={ART.mossDark} />
  </svg>
  <svg class="moss right" viewBox="0 0 48 16" aria-hidden="true">
    <ellipse cx="34" cy="12" rx="12" ry="4" fill={ART.mossDark} />
    <ellipse cx="33" cy="11" rx="8" ry="2.5" fill={ART.moss} />
  </svg>
{/snippet}

{@render children(behind, undefined)}

<style>
  :global(.scroll[data-sheet='gravestone'] .paper) {
    border-radius: 50% 50% 4px 4px / calc(26px * var(--k)) calc(26px * var(--k)) 4px 4px;
    background:
      radial-gradient(ellipse 25% 20% at 75% 30%, rgb(0 0 0 / 0.06), transparent),
      radial-gradient(ellipse 30% 25% at 25% 55%, rgb(255 255 255 / 0.1), transparent),
      var(--scroll-paper);
    box-shadow:
      inset 0 0 0 2px var(--scroll-edge),
      inset 0 0 0 9px var(--scroll-paper),
      inset 0 0 0 10.5px color-mix(in srgb, var(--scroll-edge) 45%, transparent);
    overflow: hidden;
  }

  /* The crack runs down the margin, clear of the words. */
  .crack {
    position: absolute;
    right: calc(4px * var(--k));
    top: calc(20px * var(--k));
    width: calc(60px * var(--k));
    height: calc(70px * var(--k));
    fill: none;
    stroke: var(--scroll-edge);
    stroke-width: 1.5;
  }

  .moss {
    position: absolute;
    bottom: 0;
    width: calc(48px * var(--k));
    height: calc(16px * var(--k));
  }

  .moss.left {
    left: calc(4px * var(--k));
  }

  .moss.right {
    right: calc(4px * var(--k));
  }
</style>
