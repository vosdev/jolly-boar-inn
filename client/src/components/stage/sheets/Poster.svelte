<script lang="ts">
  /**
   * The Wilderness's bounty poster: sooty paper inside a faded rule, a corner torn off, the
   * game's skull faint behind the words and a nail through each top corner.
   */
  import skullUrl from '../../../assets/sprites/skull.svg'
  import { ART } from '../../../lib/sheet'
  import type { SheetProps } from './index'

  let { children }: SheetProps = $props()
</script>

{#snippet behind()}
  <img class="skull" src={skullUrl} alt="" width="50" height="50" draggable="false" />
{/snippet}

{#snippet over()}
  {#each ['left', 'right'] as side (side)}
    <svg class="fixing {side}" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="5" fill={ART.nail} />
      <circle cx="3.6" cy="3.6" r="1.8" fill={ART.nailLight} />
    </svg>
  {/each}
{/snippet}

{@render children(behind, over)}

<style>
  :global(.scroll[data-sheet='poster'] .paper) {
    background:
      radial-gradient(ellipse 30% 20% at 80% 30%, rgb(0 0 0 / 0.18), transparent),
      radial-gradient(ellipse 35% 25% at 20% 85%, rgb(0 0 0 / 0.2), transparent),
      var(--scroll-paper);
    box-shadow:
      inset 0 0 0 6px var(--scroll-paper),
      inset 0 0 0 7.5px color-mix(in srgb, var(--scroll-ink) 35%, transparent),
      inset 0 0 22px 4px rgb(0 0 0 / 0.45);
    clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 20px, 100% 100%, 0 100%);
  }

  /* Darker than the paper, never lighter, so the ink keeps its contrast across it. */
  .skull {
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(104px * var(--k));
    height: auto;
    transform: translate(-50%, -50%);
    filter: brightness(0);
    opacity: 0.25;
  }

  .fixing {
    position: absolute;
    z-index: 1;
    top: calc(8px * var(--k));
    width: calc(8px * var(--k));
    height: calc(8px * var(--k));
  }

  .fixing.left {
    left: calc(10px * var(--k));
  }

  .fixing.right {
    right: calc(34px * var(--k));
  }
</style>
