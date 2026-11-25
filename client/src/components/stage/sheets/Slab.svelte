<script lang="ts">
  /** The TzHaar's obsidian slab, chipped at the edges and lit from within by the lava. */
  import Facets from './Facets.svelte'
  import type { SheetProps } from './index'

  let { children }: SheetProps = $props()
</script>

{#snippet behind()}
  <Facets />
{/snippet}

{@render children(behind, undefined)}

<style>
  :global(.scroll[data-sheet='slab']) {
    filter: drop-shadow(0 0 1.5px var(--scroll-edge))
      drop-shadow(0 0 9px color-mix(in srgb, var(--scroll-edge) 35%, transparent))
      drop-shadow(0 3px 0 rgb(0 0 0 / 0.4));
  }

  :global(.scroll[data-sheet='slab'] .paper) {
    --facet-shade: black;
    --facet-shade-opacity: 0.16;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--scroll-paper), white 8%),
      var(--scroll-paper) 40%,
      color-mix(in srgb, var(--scroll-paper), black 25%)
    );
    clip-path: polygon(
      0 10px,
      4% 2px,
      18% 0,
      30% 5px,
      44% 1px,
      61% 3px,
      70% 0,
      86% 4px,
      97% 0,
      100% 12px,
      99% 40%,
      100% 72%,
      98% calc(100% - 8px),
      88% 100%,
      71% calc(100% - 4px),
      58% 100%,
      40% calc(100% - 5px),
      24% 100%,
      9% calc(100% - 3px),
      0 calc(100% - 12px),
      1% 60%,
      0 30%
    );
  }
</style>
