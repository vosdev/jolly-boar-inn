<script lang="ts">
  /**
   * Prifddinas's crystal door, after the city gate's: pale faceted crystal rounded at the top
   * inside a rim of bark, lit from within, the gate's ring carved faintly behind its words,
   * branches curling at its top corners and crystal growing at its foot.
   */
  import { ART } from '../../../lib/sheet'
  import type { SheetProps } from './index'

  let { children }: SheetProps = $props()
</script>

{#snippet behind()}
  <!-- The ring and compass star carved into the city gate's doors. -->
  <svg class="gate-mark" viewBox="-60 -60 120 120" aria-hidden="true">
    <circle r="50" />
    <circle r="37" />
    <path
      d="M0-37V37M-37 0H37M-30-22C-10-5 10-5 30-22M-30 22C-10 5 10 5 30 22M-22-30C-5-10-5 10-22 30M22-30C5-10 5 10 22 30"
    />
  </svg>
{/snippet}

{#snippet over()}
  {#each ['left', 'right'] as side (side)}
    <svg class="branch {side}" viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M3 40C2 26 4 14 12 7 17 3 23 2 27 5M10 12C7 8 7 4 9 1M15 6C20 9 21 14 18 18"
        fill="none"
        stroke={ART.gateWoodDark}
        stroke-width="5"
        stroke-linecap="round"
      />
      <path
        d="M3 40C2 26 4 14 12 7 17 3 23 2 27 5M10 12C7 8 7 4 9 1M15 6C20 9 21 14 18 18"
        fill="none"
        stroke={ART.gateWood}
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <svg class="crystals {side}" viewBox="0 0 36 30" aria-hidden="true">
      <path d="M2 30 7 10 12 30Z" fill={ART.gateCrystal} />
      <path d="M7 10 12 30H7Z" fill={ART.gateCrystalShade} />
      <path d="M11 30 18 0 25 30Z" fill={ART.gateCrystal} />
      <path d="M18 0 25 30H18Z" fill={ART.gateCrystalShade} />
      <path d="M24 30 29 14 34 30Z" fill={ART.gateCrystal} />
      <path d="M29 14 34 30H29Z" fill={ART.gateCrystalShade} />
    </svg>
  {/each}
{/snippet}

{@render children(behind, over)}

<style>
  :global(.scroll[data-sheet='gate']) {
    filter: drop-shadow(
        0 0 calc(10px * var(--k)) color-mix(in srgb, var(--panel-raised) 45%, transparent)
      )
      drop-shadow(0 calc(4px * var(--k)) calc(8px * var(--k)) rgb(10 30 10 / 0.35));
  }

  :global(.scroll[data-sheet='gate'] .paper) {
    background:
      linear-gradient(
        118deg,
        color-mix(in srgb, var(--scroll-paper), var(--panel-raised) 55%) 0 22%,
        transparent 22%
      ),
      linear-gradient(
        242deg,
        color-mix(in srgb, var(--scroll-paper), var(--panel-raised) 35%) 0 28%,
        transparent 28%
      ),
      linear-gradient(
        160deg,
        transparent 0 64%,
        color-mix(in srgb, var(--scroll-paper), var(--scroll-muted) 10%) 64%
      ),
      var(--scroll-paper);
    border-radius: calc(44px * var(--k)) calc(44px * var(--k)) calc(8px * var(--k))
      calc(8px * var(--k));
    box-shadow:
      inset 0 0 0 calc(3px * var(--k)) var(--scroll-edge),
      inset 0 0 0 calc(5px * var(--k))
        color-mix(in srgb, var(--scroll-paper), var(--panel-raised) 70%),
      inset 0 0 calc(20px * var(--k)) color-mix(in srgb, var(--panel-raised) 60%, transparent);
  }

  .gate-mark {
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(110px * var(--k));
    height: calc(110px * var(--k));
    transform: translate(-50%, -50%);
    fill: none;
    stroke: var(--scroll-muted);
    stroke-width: 4.5;
    stroke-linecap: round;
    opacity: 0.12;
  }

  .branch,
  .crystals {
    position: absolute;
    z-index: 2;
  }

  .branch {
    top: 0;
    width: calc(40px * var(--k));
    height: calc(40px * var(--k));
  }

  .branch.left {
    left: 0;
  }

  .branch.right {
    right: 0;
    transform: scaleX(-1);
  }

  .crystals {
    bottom: 0;
    width: calc(36px * var(--k));
    height: calc(30px * var(--k));
  }

  .crystals.left {
    left: calc(4px * var(--k));
  }

  .crystals.right {
    right: calc(4px * var(--k));
    transform: scaleX(-1);
  }
</style>
