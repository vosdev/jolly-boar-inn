<script lang="ts">
  /**
   * A light on the wall either side of the page, behind everything, in the themes that
   * hang one: the inn's candle lanterns, both Gauntlets' glowing door logos. Zanaris has no
   * lights, only a fairy ring on the floor in their place, and keeps the left one on a phone.
   *
   * Drawn only on a window wide enough to leave them room beside the stage: on a phone the
   * sheet and its host stand where they would hang. The right one is the left one mirrored,
   * so both turn the same face toward the page.
   */
  import { onMount } from 'svelte'

  import fairyRing from '../assets/sprites/fairy-ring.svg'
  import { watchTheme } from '../lib/theme'
  import GauntletDoorLogo from './GauntletDoorLogo.svelte'
  import InnLantern from './InnLantern.svelte'

  const LIT = ['jolly', 'gauntlet', 'corrupted_gauntlet', 'zanaris'] as const
  type Lit = (typeof LIT)[number]

  let lit = $state<Lit | null>(null)

  onMount(() =>
    watchTheme((theme) => {
      lit = (LIT as readonly string[]).includes(theme) ? (theme as Lit) : null
    }),
  )

  const SIDES = ['left', 'right'] as const
</script>

{#if lit}
  <div class="wall-lights" data-lights={lit} aria-hidden="true">
    {#each SIDES as side (side)}
      <div class="light {side}"></div>
      <div class="fitting {side}" data-light={side}>
        {#if lit === 'jolly'}
          <InnLantern {side} />
        {:else if lit === 'zanaris'}
          <img class="ring" src={fairyRing} alt="" width="250" height="127" draggable="false" />
        {:else}
          <GauntletDoorLogo gauntlet={lit} />
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Under #app's content, like the Party Room's floor, but fixed: a light is on the wall,
     so it stays where it hangs while the page scrolls past. */
  .wall-lights {
    display: none;
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;

    /* Either side of Broav and the sheet, which fill the reading column on Home: each light
       stands halfway across the gap beside it, and shrinks as that gap narrows. On a wide
       screen it stays near the sheet rather than drifting off with the window's edge, away
       from the centred page. */
    --beside-stage: calc((100vw - var(--page-width)) / 2);
    --fitting-width: clamp(2.5rem, var(--beside-stage) - 1rem, 5.25rem);
    --light-reach: calc(var(--fitting-width) * 7);
    --fitting-y: calc(var(--topbar-height) + 9.5rem);
    --fitting-x: calc(var(--beside-stage) - min(var(--beside-stage) / 2, 10rem));
  }

  /* Below this the gap beside the stage is too narrow for even the smallest light. */
  @media (min-width: 50rem) {
    .wall-lights {
      display: block;
    }
  }

  /* A candle's warm glow, flickering. */
  [data-lights='jolly'] {
    --light-near: rgb(255 205 110 / 0.5);
    --light-mid: rgb(245 170 70 / 0.24);
    --light-far: rgb(230 150 50 / 0.08);
    --flicker: flicker;
  }

  /* The crystal's cyan, steady: nothing burns in it. */
  [data-lights='gauntlet'] {
    --light-near: rgb(26 200 216 / 0.42);
    --light-mid: rgb(26 200 216 / 0.2);
    --light-far: rgb(26 200 216 / 0.07);
    --logo-glow: rgb(26 200 216 / 0.9);
    --flicker: none;
  }

  /* The corruption's red, as steady. */
  [data-lights='corrupted_gauntlet'] {
    --light-near: rgb(226 72 62 / 0.42);
    --light-mid: rgb(226 72 62 / 0.2);
    --light-far: rgb(226 72 62 / 0.07);
    --logo-glow: rgb(226 72 62 / 0.9);
    --flicker: none;
  }

  .light,
  .fitting {
    position: absolute;
    top: var(--fitting-y);
  }

  .left {
    left: var(--fitting-x);
  }

  .right {
    right: var(--fitting-x);
  }

  .light {
    width: var(--light-reach);
    height: var(--light-reach);
    margin-top: calc(var(--light-reach) / -2);
    background: radial-gradient(
      circle,
      var(--light-near) 0%,
      var(--light-mid) 30%,
      var(--light-far) 55%,
      transparent 70%
    );
    animation: var(--flicker) 4.1s infinite;
  }

  .light.left {
    margin-left: calc(var(--light-reach) / -2);
  }

  .light.right {
    margin-right: calc(var(--light-reach) / -2);
    animation-duration: 3.3s;
    animation-delay: -1.2s;
  }

  /* Each drawing's light source sits at half its height, so (x, y) is where the light
     comes from. */
  .fitting {
    width: var(--fitting-width);
    transform: translate(-50%, -50%);
  }

  .fitting.right {
    transform: translate(50%, -50%) scaleX(-1);
  }

  /* A fairy ring at its own size, pixel for pixel, whatever room the stage leaves: it lies on
     the floor, half under the page, and gives off no light. */
  [data-lights='zanaris'] {
    --fitting-width: 250px;
  }

  [data-lights='zanaris'] .light {
    display: none;
  }

  .ring {
    display: block;
    image-rendering: pixelated;
  }

  /* On a phone the stage fills the window, so only the left ring shows, in the bottom
     corner and partly off it, behind the page. */
  @media (max-width: 49.99rem) {
    .wall-lights[data-lights='zanaris'] {
      display: block;
    }

    [data-lights='zanaris'] .fitting.left {
      top: auto;
      bottom: 0;
      left: -40px;
      transform: none;
    }

    [data-lights='zanaris'] .fitting.right {
      display: none;
    }
  }

  @keyframes flicker {
    0%,
    100% {
      opacity: 1;
    }
    18% {
      opacity: 0.9;
    }
    24% {
      opacity: 1;
    }
    57% {
      opacity: 0.93;
    }
    63% {
      opacity: 0.98;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .light {
      animation: none;
    }
  }
</style>
