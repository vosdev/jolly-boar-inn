<script lang="ts">
  /**
   * The jungle's bark cloth, woven fine, inside four lengths of bamboo lashed at the corners.
   * A pole's bands run along it, so it stretches without distorting.
   */
  import { ART } from '../../../lib/sheet'
  import type { SheetProps } from './index'

  let { children }: SheetProps = $props()
</script>

{#snippet pole(side: 'top' | 'bottom' | 'left' | 'right')}
  {@const upright = side === 'left' || side === 'right'}
  <svg
    class="pole {side}"
    viewBox={upright ? '0 0 10 100' : '0 0 100 10'}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <g transform={upright ? 'matrix(0 1 1 0 0 0)' : undefined}>
      <rect width="100" height="10" fill={ART.bambooEdge} />
      <rect y="1" width="100" height="8" fill={ART.bamboo} />
      <rect y="2.5" width="100" height="2.5" fill={ART.bambooLight} />
      <rect y="7" width="100" height="2" fill={ART.bambooDark} />
    </g>
  </svg>
{/snippet}

{#snippet over()}
  {@render pole('top')}
  {@render pole('bottom')}
  {@render pole('left')}
  {@render pole('right')}
  {#each ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as corner (corner)}
    <svg class="lashing {corner}" viewBox="0 0 18 18" aria-hidden="true">
      <rect width="18" height="18" rx="3" fill={ART.lashing} />
      <path
        d="M0 4L4 0H8L0 8ZM0 12L12 0H16L0 16ZM4 18L18 4V8L8 18ZM12 18L18 12V16L16 18Z"
        fill={ART.lashingLight}
      />
    </svg>
  {/each}
{/snippet}

{@render children(undefined, over)}

<style>
  :global(.scroll[data-sheet='bamboo']) {
    --rim: calc(11px * var(--k));
  }

  :global(.scroll[data-sheet='bamboo'] .paper) {
    background:
      repeating-linear-gradient(
        0deg,
        color-mix(in srgb, var(--scroll-edge) 10%, transparent) 0 1px,
        transparent 1px 6px
      ),
      var(--scroll-paper);
  }

  .pole {
    position: absolute;
    z-index: 1;
    --pole: calc(11px * var(--k));
  }

  .pole.top,
  .pole.bottom {
    left: 0;
    width: 100%;
    height: var(--pole);
  }

  .pole.top {
    top: calc(4px * var(--k));
  }

  .pole.bottom {
    bottom: calc(4px * var(--k));
  }

  /* An upright pole is the same length of bamboo turned on its side. */
  .pole.left,
  .pole.right {
    top: 0;
    height: 100%;
    width: var(--pole);
  }

  .pole.left {
    left: calc(4px * var(--k));
  }

  .pole.right {
    right: calc(4px * var(--k));
  }

  .lashing {
    position: absolute;
    z-index: 2;
    width: calc(18px * var(--k));
    height: calc(18px * var(--k));
  }

  .lashing.top-left {
    left: 0;
    top: 0;
  }

  .lashing.top-right {
    right: 0;
    top: 0;
  }

  .lashing.bottom-left {
    left: 0;
    bottom: 0;
  }

  .lashing.bottom-right {
    right: 0;
    bottom: 0;
  }
</style>
