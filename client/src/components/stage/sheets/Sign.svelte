<script lang="ts">
  /**
   * Zanaris's stone: teal and faceted, ragged at its edge like the Cosmic altar's sign but
   * only ever inside the sheet's margins, pale crystal at its corners and halfway down each
   * side, and a clump of the city's mushrooms in each corner of its foot. The edge's notches
   * keep their depth in px and spread along it in %, so any width of stone keeps its frame.
   */
  import mushroomsUrl from '../../../assets/textures/zanaris-mushrooms.svg'
  import { ART } from '../../../lib/sheet'
  import Facets from './Facets.svelte'
  import type { SheetProps } from './index'

  let { children }: SheetProps = $props()
</script>

{#snippet behind()}
  <!-- The stone's ragged edge, and inside it the stone itself, which clips its crystal. -->
  <div class="stone" aria-hidden="true">
    <div class="face">
      <Facets />
      {#each ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as corner (corner)}
        <svg class="shard {corner}" viewBox="0 0 60 40">
          <path fill={ART.signShard} d="M2 6L20 1L42 3L24 8L10 19L7 34L1 27Z" />
          <path fill={ART.signShardDark} d="M10 19L24 8L46 6L28 13L14 25Z" />
        </svg>
      {/each}
      {#each ['left', 'right'] as side (side)}
        <svg class="shard side {side}" viewBox="0 0 14 30">
          <path fill={ART.signShard} d="M1 0L12 9L9 23L1 30Z" />
        </svg>
      {/each}
    </div>
  </div>
  {#each ['left', 'right'] as side (side)}
    <img class="mushrooms {side}" src={mushroomsUrl} alt="" draggable="false" />
  {/each}
{/snippet}

{@render children(behind, undefined)}

<style>
  :global(.scroll[data-sheet='sign'] .paper) {
    --stone: polygon(
      calc(8px * var(--k)) calc(14px * var(--k)),
      13% calc(2px * var(--k)),
      30% calc(7px * var(--k)),
      50% 0,
      72% calc(5px * var(--k)),
      90% calc(1px * var(--k)),
      calc(100% - 4px * var(--k)) calc(16px * var(--k)),
      calc(100% - 7px * var(--k)) 40%,
      100% 63%,
      calc(100% - 6px * var(--k)) 87%,
      calc(100% - 26px * var(--k)) 100%,
      60% calc(100% - 6px * var(--k)),
      40% 100%,
      18% calc(100% - 4px * var(--k)),
      calc(10px * var(--k)) calc(100% - 12px * var(--k)),
      0 68%,
      calc(7px * var(--k)) 44%,
      0 26%
    );
    background: none;
  }

  .stone {
    position: absolute;
    inset: 0;
    clip-path: var(--stone);
    background: var(--scroll-edge);
  }

  .face {
    position: absolute;
    inset: calc(2px * var(--k));
    clip-path: var(--stone);
    background:
      radial-gradient(
        ellipse 70% 60% at 50% 35%,
        color-mix(in srgb, var(--scroll-paper), white 14%),
        transparent
      ),
      var(--scroll-paper);
  }

  .shard {
    position: absolute;
    width: calc(60px * var(--k));
    height: calc(40px * var(--k));
  }

  .shard.top-left {
    left: calc(6px * var(--k));
    top: calc(6px * var(--k));
  }

  .shard.top-right {
    right: calc(6px * var(--k));
    top: calc(6px * var(--k));
    transform: scaleX(-1);
  }

  .shard.bottom-left {
    left: calc(6px * var(--k));
    bottom: calc(6px * var(--k));
    transform: scaleY(-1);
  }

  .shard.bottom-right {
    right: calc(6px * var(--k));
    bottom: calc(6px * var(--k));
    transform: scale(-1);
  }

  .shard.side {
    top: calc(50% - 15px * var(--k));
    width: calc(14px * var(--k));
    height: calc(30px * var(--k));
  }

  .shard.side.left {
    left: calc(6px * var(--k));
  }

  .shard.side.right {
    right: calc(6px * var(--k));
    transform: scaleX(-1);
  }

  .mushrooms {
    position: absolute;
    bottom: calc(4px * var(--k));
    right: calc(4px * var(--k));
    width: calc(51px * var(--k));
  }

  .mushrooms.left {
    right: auto;
    left: calc(4px * var(--k));
    width: calc(39px * var(--k));
    transform: scaleX(-1);
  }
</style>
