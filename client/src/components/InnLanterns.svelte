<script lang="ts">
  /**
   * Two lit candle lanterns on the inn's wall, either side of the page, behind everything.
   *
   * Drawn only while `jolly` is the page's theme, and only on a window wide enough to leave
   * them room beside the clue scroll: on a phone the scroll and its host stand where they
   * would hang. The right lantern is the left one mirrored, so both turn the same face
   * toward the page. Shapes and colours are SVG attributes rather than styles, which
   * `style-src 'self'` would refuse.
   */
  import { onMount } from 'svelte'

  import { ART } from '../lib/innLanterns'
  import { watchTheme } from '../lib/theme'

  let jolly = $state(false)

  onMount(() =>
    watchTheme((theme) => {
      jolly = theme === 'jolly'
    }),
  )

  const SIDES = ['left', 'right'] as const
</script>

{#if jolly}
  <div class="inn-lanterns" aria-hidden="true">
    {#each SIDES as side (side)}
      <div class="light {side}"></div>
      <svg class="lantern {side}" viewBox="0 0 97 160" focusable="false" data-lantern={side}>
        <defs>
          <linearGradient id="inn-lantern-glass-{side}" x1="0" x2="1">
            <stop offset="0" stop-color={ART.glassEdge} />
            <stop offset=".5" stop-color={ART.glassLit} />
            <stop offset="1" stop-color={ART.glassFar} />
          </linearGradient>
          <filter id="inn-lantern-shadow-{side}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <!-- The bracket's shadow on the wall, from the candle above it. -->
        <path
          d="M22 123 70 125 42 156z"
          fill={ART.shadow}
          opacity=".45"
          filter="url(#inn-lantern-shadow-{side})"
          transform="translate(2 5)"
        />
        <path
          d="M2 45 12 33 67 34 93 40 95 58 85 111 37 121 14 104z"
          fill="url(#inn-lantern-glass-{side})"
        />
        <path d="M2 45 30 69 37 121 14 104z" fill={ART.glassSide} />
        <!-- The floor is the frame's bottom: left, back, right and front corners. -->
        <path d="M14 104 62 94 85 111 37 121z" fill={ART.floor} />
        <path
          d="M14 104 62 94 85 111"
          fill="none"
          stroke={ART.floorEdge}
          stroke-width="2.2"
          stroke-linejoin="round"
          opacity=".8"
        />
        <path d="M64 38h5l-4.5 56h-5z" fill={ART.post} />
        <path d="M44 109 47 74 53 72 56 110z" fill={ART.candle} />
        <path d="M44 109 47 74 49 74 48.5 110z" fill={ART.candleLit} />
        <path d="M44 109c3 1.5 9 1.5 12 1" stroke={ART.candleFoot} stroke-width="1.2" fill="none" />
        <g class="flare">
          <path d="M25 54 49 61 72 47 51 62 66 58 51 63z" fill={ART.flare} opacity=".7" />
          <path d="M49 63 49.5 56 51.5 63z" fill={ART.flame} />
        </g>
        <g
          fill="none"
          stroke={ART.frame}
          stroke-width="4"
          stroke-linejoin="round"
          stroke-linecap="round"
        >
          <path d="M2 46 14 104" />
          <path d="M30 70 37 121" />
          <path d="M95 59 85 111" />
          <path d="M29 69 95 58" />
          <path d="M2 46 29 69" />
          <path d="M12 33 2 46" />
          <path d="M93 40 95 59" />
          <path d="M14 104 37 121 85 111" />
        </g>
        <path d="M12 103 37 120 37 127 12 110z" fill={ART.ironDark} />
        <path d="M37 120 86 110 86 117 37 127z" fill={ART.iron} />
        <path d="M6 27 53 10 66 15 93 39 33 49z" fill={ART.roof} />
        <path d="M53 10 66 15 93 39 45 42z" fill={ART.roofShade} />
        <path d="M6 27 33 49 36 43z" fill={ART.ironDark} />
        <path d="M39 18 35 10 47 0 61 8 58 8 47 3 38 11 41 18z" fill={ART.handle} />
        <!-- The shelf it stands on, and the bracket under that into the wall. -->
        <path d="M6 110 37 129 92 117 92 120 37 133 6 113z" fill={ART.shelfEdge} />
        <path d="M6 110 37 129 92 117 86 115 37 125 12 108z" fill={ART.shelfTop} />
        <path d="M22 123 37 133 42 156z" fill={ART.bracketLit} />
        <path d="M37 133 70 125 42 156z" fill={ART.ironDark} />
      </svg>
    {/each}
  </div>
{/if}

<style>
  /* Under #app's content, like the Party Room's floor, but fixed: a lantern is on the wall,
     so it stays where it hangs while the page scrolls past. */
  .inn-lanterns {
    display: none;
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;

    /* Either side of Broav and the clue scroll, which fill the reading column on Home: each
       lantern stands halfway across the gap beside it, and shrinks as that gap narrows. */
    --beside-stage: calc((100vw - var(--page-width)) / 2);
    --lantern-width: clamp(2.5rem, var(--beside-stage) - 1rem, 5.25rem);
    --light-reach: calc(var(--lantern-width) * 7);
    --lantern-y: calc(var(--topbar-height) + 9.5rem);
    --lantern-x: calc(var(--beside-stage) / 2);
  }

  /* Below this the gap beside the stage is too narrow for even the smallest lantern. */
  @media (min-width: 50rem) {
    .inn-lanterns {
      display: block;
    }
  }

  .light,
  .lantern {
    position: absolute;
    top: var(--lantern-y);
  }

  .left {
    left: var(--lantern-x);
  }

  .right {
    right: var(--lantern-x);
  }

  .light {
    width: var(--light-reach);
    height: var(--light-reach);
    margin-top: calc(var(--light-reach) / -2);
    background: radial-gradient(
      circle,
      rgb(255 205 110 / 0.5) 0%,
      rgb(245 170 70 / 0.24) 30%,
      rgb(230 150 50 / 0.08) 55%,
      transparent 70%
    );
    animation: flicker 4.1s infinite;
  }

  .light.left {
    margin-left: calc(var(--light-reach) / -2);
  }

  .light.right {
    margin-right: calc(var(--light-reach) / -2);
    animation-duration: 3.3s;
    animation-delay: -1.2s;
  }

  /* The glass sits at half the drawing's height, so (x, y) is where the light comes from. */
  .lantern {
    width: var(--lantern-width);
    transform: translate(-50%, -50%);
  }

  .lantern.right {
    transform: translate(50%, -50%) scaleX(-1);
  }

  .flare {
    animation: flare 1.7s infinite alternate ease-in-out;
  }

  .right .flare {
    animation-delay: -0.8s;
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

  @keyframes flare {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.7;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .light,
    .flare {
      animation: none;
    }
  }
</style>
