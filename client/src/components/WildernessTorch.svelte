<script lang="ts">
  /**
   * The game's wall torch, turned from side-on to three-quarters so it faces the page: its
   * iron arm reaches back to the wall on the far side. Colours are SVG attributes rather than
   * styles, which `style-src 'self'` would refuse.
   *
   * The view box reaches above the flames so they sit at its half height, where the light
   * comes from.
   */
  import { TORCH as ART } from '../lib/wallLights'

  let { side }: { side: 'left' | 'right' } = $props()
</script>

<svg viewBox="0 -34 100 194" focusable="false">
  <path d="M6 110 20 106 20 134 6 137z" fill={ART.plate} />
  <path d="M6 110 20 106 20 108 6 112z" fill={ART.ironLit} />
  <path d="M42 124h16l-7 35h-2z" fill={ART.wood} />
  <path d="M50 124h8l-7 35h-1z" fill={ART.woodShade} />
  <path d="M45 126h2l2.5 30h-.5z" fill={ART.woodGrain} />
  <path d="M40 96 46 91h8l6 5 1 14-5 9H44l-5-9z" fill={ART.head} />
  <path
    d="M39.5 100h21l.1 2H39.4zM39.2 105h21.6l.1 2H39.1zM39.6 111h20.8l-.8 2H40.4z"
    fill={ART.headBand}
  />
  <path d="M53 91h1l6 5 1 14-5 9h-4z" fill={ART.headShade} opacity=".75" />
  <path d="M42 94 46 91h8l4 3-8 3z" fill={ART.charred} />
  <g class="flames" class:late={side === 'right'}>
    <g fill={ART.flame} opacity=".75">
      <path d="M38 93 38.5 68 43 42 48 66 50 93z" />
      <path d="M48 94 50 60 56 32 61 58 63 93z" />
    </g>
    <g fill={ART.flameHeart} opacity=".9">
      <path d="M41 93 42 74 44 56 47 74 48 93z" />
      <path d="M51 94 53 72 56 48 59 72 60 93z" />
    </g>
    <path d="M44 94 45 86 47 94zM54 94 56 84 58 94z" fill={ART.flameRoot} />
  </g>
  <path d="M18 112 38 116v11l-20 3z" fill={ART.arm} />
  <path d="M18 112 38 116v2.5l-20-4z" fill={ART.armLit} />
  <path d="M36 116h28v11H36z" fill={ART.band} />
  <path d="M36 116h28v2.5H36z" fill={ART.bandLit} />
  <path d="M55 116h9v11h-9z" fill={ART.bandShade} />
</svg>

<style>
  svg {
    display: block;
    width: 100%;
  }

  /* The flames lick upward from the head, out of step with the other torch. */
  .flames {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: lick 0.55s infinite alternate ease-in-out;
  }

  .late {
    animation-delay: -0.3s;
  }

  @keyframes lick {
    to {
      transform: scale(0.95, 1.07);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flames {
      animation: none;
    }
  }
</style>
