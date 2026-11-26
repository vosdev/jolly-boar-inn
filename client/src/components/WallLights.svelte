<script lang="ts">
  /**
   * A light on the wall either side of the page, behind everything, in the themes that
   * hang one: the inn's candle lanterns, the Wilderness's torches, TzHaar's sulphur vents,
   * and the inn's. Prifddinas hangs no light but an elven clan's symbol, the same clan either
   * side and chosen once per page load; Zanaris has no lights, only a fairy ring on the floor
   * in their place.
   *
   * Drawn either side only on a window wide enough to leave them room beside the stage: on a
   * phone the sheet and its host stand where they would hang, so only the left one shows, in
   * the bottom corner, and only in a game (`corner`), where no footer covers that floor. The
   * right one is the left one mirrored, so both turn the same face toward the page. Nor behind a TV's stage, which is scaled
   * over the room they would hang in (`tvFit`).
   *
   * Beside a room laid out for a desktop (`roomShown`) they stand on the floor its frame
   * leaves, measured from the room's edge rather than the window's, at one height; where
   * the room fills the window there is no floor for them.
   */
  import { onMount } from 'svelte'

  import fairyRing from '../assets/sprites/fairy-ring.svg'
  import { roomShown } from '../lib/roomFit'
  import { watchTheme } from '../lib/theme'
  import { tvFit } from '../lib/tv'
  import { pickClan } from '../lib/clans'
  import ClanSymbol from './ClanSymbol.svelte'
  import InnLantern from './InnLantern.svelte'
  import SulphurVent from './SulphurVent.svelte'
  import WildernessTorch from './WildernessTorch.svelte'

  /** Whether a phone shows the left light in its bottom corner: true while a game is played. */
  let { corner = false }: { corner?: boolean } = $props()

  const LIT = ['jolly', 'wilderness', 'tzhaar', 'prifddinas', 'zanaris'] as const
  type Lit = (typeof LIT)[number]

  let lit = $state<Lit | null>(null)

  const clan = pickClan()

  onMount(() =>
    watchTheme((theme) => {
      lit = (LIT as readonly string[]).includes(theme) ? (theme as Lit) : null
    }),
  )

  const SIDES = ['left', 'right'] as const

  /** The narrowest floor beside a room that a light still stands on, in px. */
  const LEAST_FLOOR = 48

  const floor = $derived($roomShown === null ? null : $roomShown.fit.left)
</script>

{#if lit && $tvFit === null}
  <div
    class="wall-lights"
    class:beside-room={floor !== null}
    class:no-floor={floor !== null && floor < LEAST_FLOOR}
    class:corner
    style:--room-floor={floor === null ? null : `${floor}px`}
    data-lights={lit}
    aria-hidden="true"
  >
    {#each SIDES as side (side)}
      <div class="light {side}"></div>
      <div class="fitting {side}" data-light={side}>
        {#if lit === 'jolly'}
          <InnLantern {side} />
        {:else if lit === 'wilderness'}
          <WildernessTorch {side} />
        {:else if lit === 'tzhaar'}
          <SulphurVent {side} />
        {:else if lit === 'zanaris'}
          <img class="ring" src={fairyRing} alt="" width="250" height="127" draggable="false" />
        {:else}
          <ClanSymbol {clan} />
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Under #app's content, like the Party Room's floor: a light is on the wall, so it
     scrolls away with the page rather than following the window down it. */
  .wall-lights {
    display: none;
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;

    /* Either side of the page's column: each light stands halfway across the gap beside
       it, and shrinks as that gap narrows. On a wide screen it stays near the sheet rather
       than drifting off with the window's edge, away from the centred page. */
    --beside-stage: calc((100vw - var(--page-width)) / 2);
    --fitting-width: clamp(2.5rem, var(--beside-stage) - 1rem, 5.25rem);
    --light-reach: calc(var(--fitting-width) * 7);
    --fitting-y: calc(var(--topbar-height) + 9.5rem);
    --fitting-x: calc(var(--beside-stage) - min(var(--beside-stage) / 2, 10rem));
  }

  .beside-room {
    --beside-stage: var(--room-floor);
  }

  /* Home's column is wider than the reading column, so its lights stand beside that. */
  :global(body:has(main .home)) .wall-lights {
    --beside-stage: calc((100vw - var(--home-width)) / 2);
  }

  /* Below this the gap beside the stage is too narrow for even the smallest light. */
  @media (min-width: 50rem) {
    .wall-lights {
      display: block;
    }
  }

  .wall-lights.no-floor {
    display: none;
  }

  /* Short of the narrowest light either side of Home's column. */
  @media (width < 67rem) {
    :global(body:has(main .home)) .wall-lights {
      display: none;
    }
  }

  /* A candle's warm glow, flickering. */
  [data-lights='jolly'] {
    --light-near: rgb(255 205 110 / 0.5);
    --light-mid: rgb(245 170 70 / 0.24);
    --light-far: rgb(230 150 50 / 0.08);
    --flicker: flicker;
  }

  /* A torch's orange, flickering. */
  [data-lights='wilderness'] {
    --light-near: rgb(240 150 60 / 0.4);
    --light-mid: rgb(226 110 44 / 0.2);
    --light-far: rgb(200 70 30 / 0.07);
    --flicker: flicker;
  }

  /* The lava's red, and only a little of it. */
  [data-lights='tzhaar'] {
    --light-near: rgb(232 54 30 / 0.42);
    --light-mid: rgb(212 46 28 / 0.16);
    --light-reach: calc(var(--fitting-width) * 2.6);
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

  /* The lava lies in an open pool, so its light rises: it fades out round the pool's edge
     rather than stopping there, and never reaches the floor below the vent. */
  [data-lights='tzhaar'] .light {
    background: radial-gradient(
      ellipse 50% 34%,
      var(--light-near) 0%,
      var(--light-mid) 45%,
      transparent 100%
    );
    mask-image: linear-gradient(to bottom, black 38%, transparent 56%);
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

  /* A symbol gives off no light but its own glow, and stands in a box half again as wide
     as a light and three times as tall, so a tall one and a round one look alike in size. */
  [data-lights='prifddinas'] .light {
    display: none;
  }

  [data-lights='prifddinas'] .fitting {
    width: calc(var(--fitting-width) * 1.5);
    height: calc(var(--fitting-width) * 3);
  }

  [data-lights='prifddinas'] .fitting.right {
    transform: translate(50%, -50%);
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

  /* On a phone the stage fills the window, so only the left light shows, in the page's
     bottom corner and partly off it, behind the page, smaller and with less reach. A fairy
     ring keeps its own size and lies flat in the corner. */
  @media (max-width: 49.99rem) {
    .wall-lights.corner {
      display: block;
      --fitting-width: 4.5rem;
      --light-reach: calc(var(--fitting-width) * 5);
      --fitting-x: 2.75rem;
      --fitting-y: calc(100% - 5.5rem);
    }

    .wall-lights.corner[data-lights='tzhaar'] {
      --light-reach: calc(var(--fitting-width) * 2.6);
    }

    .wall-lights.corner[data-lights='zanaris'] {
      --fitting-width: 250px;
    }

    .right {
      display: none;
    }

    [data-lights='zanaris'] .fitting.left {
      top: auto;
      bottom: 0;
      left: -40px;
      transform: none;
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
