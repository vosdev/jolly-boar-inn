<script lang="ts">
  /**
   * Two lit candle lanterns on the inn's wall, either side of the page, behind everything.
   *
   * Drawn only while `jolly` is the page's theme, and only on a window wide enough to leave
   * them a gutter beside the content: on a phone the clue scroll and its host stand where
   * they would hang. The right lantern is the left one mirrored, so both turn the same face
   * toward the page. Shapes and colours are SVG attributes rather than styles, which
   * `style-src 'self'` would refuse.
   */
  import { onMount } from 'svelte'

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
            <stop offset="0" stop-color="#f6d87a" />
            <stop offset=".5" stop-color="#fde9a0" />
            <stop offset="1" stop-color="#f3d475" />
          </linearGradient>
          <filter id="inn-lantern-shadow-{side}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <!-- The bracket's shadow on the wall, from the candle above it. -->
        <path
          d="M22 123 70 125 42 156z"
          fill="#120c04"
          opacity=".45"
          filter="url(#inn-lantern-shadow-{side})"
          transform="translate(2 5)"
        />
        <path
          d="M2 45 12 33 67 34 93 40 95 58 85 111 37 121 14 104z"
          fill="url(#inn-lantern-glass-{side})"
        />
        <path d="M2 45 30 69 37 121 14 104z" fill="#f0cf6e" />
        <!-- The floor is the frame's bottom: left, back, right and front corners. -->
        <path d="M14 104 62 94 85 111 37 121z" fill="#8f7428" />
        <path
          d="M14 104 62 94 85 111"
          fill="none"
          stroke="#7a6024"
          stroke-width="2.2"
          stroke-linejoin="round"
          opacity=".8"
        />
        <path d="M64 38h5l-4.5 56h-5z" fill="#c9a84a" />
        <path d="M44 109 47 74 53 72 56 110z" fill="#e9c95e" />
        <path d="M44 109 47 74 49 74 48.5 110z" fill="#f7e29a" />
        <path d="M44 109c3 1.5 9 1.5 12 1" stroke="#b8952e" stroke-width="1.2" fill="none" />
        <g class="flare">
          <path d="M25 54 49 61 72 47 51 62 66 58 51 63z" fill="#e9c24a" opacity=".7" />
          <path d="M49 63 49.5 56 51.5 63z" fill="#d9a400" />
        </g>
        <g
          fill="none"
          stroke="#45403d"
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
        <path d="M12 103 37 120 37 127 12 110z" fill="#2f2b29" />
        <path d="M37 120 86 110 86 117 37 127z" fill="#3e3936" />
        <path d="M6 27 53 10 66 15 93 39 33 49z" fill="#47413e" />
        <path d="M53 10 66 15 93 39 45 42z" fill="#3b3634" />
        <path d="M6 27 33 49 36 43z" fill="#2f2b29" />
        <path d="M39 18 35 10 47 0 61 8 58 8 47 3 38 11 41 18z" fill="#57514d" />
        <!-- The shelf it stands on, and the bracket under that into the wall. -->
        <path d="M6 110 37 129 92 117 92 120 37 133 6 113z" fill="#2a2624" />
        <path d="M6 110 37 129 92 117 86 115 37 125 12 108z" fill="#5a534e" />
        <path d="M22 123 37 133 42 156z" fill="#4a4441" />
        <path d="M37 133 70 125 42 156z" fill="#2f2b29" />
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

    --lantern-width: 5.25rem;
    --light-reach: 36rem;
    /* Level with Broav on Home. */
    --lantern-y: calc(var(--topbar-height) + 9.5rem);
    /* Halfway across the gutter beside the wide column, so no screen's content covers one. */
    --lantern-x: calc((100vw - var(--page-wide)) / 4);
  }

  /* Only where the gutter holds a lantern with room to spare. */
  @media (min-width: 80rem) {
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
