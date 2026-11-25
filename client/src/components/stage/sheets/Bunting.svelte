<script lang="ts">
  /**
   * The Party Room's card, in a border of the tablecloth's checks, bunting strung along its
   * top: fixed-size flags on swags whose count follows the width, knotted at every end on
   * the checks, the flags hanging into the paper's margin above the words.
   */
  import { ART, BUNTING_HEIGHT, buntingLayout } from '../../../lib/sheet'
  import type { SheetProps } from './index'

  let { children }: SheetProps = $props()

  let width = $state(0)
  let height = $state(0)
  const FLAG_COLOURS = [ART.flagRed, ART.flagYellow, ART.flagGreen, undefined]
  // The box is BUNTING_HEIGHT * --k tall, so its two sides give the width at scale 1.
  const bunting = $derived(buntingLayout(height ? (width * BUNTING_HEIGHT) / height : 0))
</script>

{#snippet over()}
  <div class="bunting" bind:clientWidth={width} bind:clientHeight={height} aria-hidden="true">
    <svg viewBox="0 0 {bunting.width} {BUNTING_HEIGHT}">
      {#each bunting.swags as d (d)}
        <path class="swag" {d} fill="none" stroke={ART.string} stroke-width="1.5" />
      {/each}
      {#each bunting.flags as flag (flag.d)}
        {@const colour = FLAG_COLOURS[flag.colour % FLAG_COLOURS.length]}
        <path
          class="flag"
          class:blue={!colour}
          d={flag.d}
          transform={flag.transform}
          fill={colour}
        />
      {/each}
      {#each bunting.knots as x (x)}
        <g class="knot" transform="translate({x} 0)">
          <path
            d="M0 5q-2 3 0 5.5t0.4 5"
            fill="none"
            stroke={ART.string}
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <circle cy="3" r="2.6" fill={ART.string} />
        </g>
      {/each}
    </svg>
  </div>
{/snippet}

{@render children(undefined, over)}

<style>
  :global(.scroll[data-sheet='bunting']) {
    --rim: calc(10px * var(--k));
  }

  :global(.scroll[data-sheet='bunting'] .reveal) {
    border-radius: 4px;
    background: repeating-conic-gradient(
        var(--accent) 0 25%,
        color-mix(in srgb, var(--accent), white 35%) 0 50%
      )
      0 0 / calc(12px * var(--k)) calc(12px * var(--k));
  }

  :global(.scroll[data-sheet='bunting'] .paper) {
    border-radius: 2px;
  }

  .bunting {
    position: absolute;
    z-index: 1;
    left: calc(5px * var(--k));
    right: calc(5px * var(--k));
    top: calc(2px * var(--k));
    height: calc(30px * var(--k));
  }

  .bunting svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .blue {
    fill: var(--accent);
  }
</style>
