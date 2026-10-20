<script lang="ts">
  /**
   * The inn's lit white candle lantern on its shelf, as the game draws it. Shapes and colours
   * are SVG attributes rather than styles, which `style-src 'self'` would refuse.
   */
  import { LANTERN as ART } from '../lib/wallLights'

  /** Which side it hangs on, which keeps its ids apart from the other's. */
  let { side }: { side: 'left' | 'right' } = $props()
</script>

<svg viewBox="0 0 97 160" focusable="false">
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
  <g class="flare" class:late={side === 'right'}>
    <path d="M25 54 49 61 72 47 51 62 66 58 51 63z" fill={ART.flare} opacity=".7" />
    <path d="M49 63 49.5 56 51.5 63z" fill={ART.flame} />
  </g>
  <g fill="none" stroke={ART.frame} stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
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

<style>
  svg {
    display: block;
    width: 100%;
  }

  .flare {
    animation: flare 1.7s infinite alternate ease-in-out;
  }

  /* Out of step with the other lantern, so the two never flare together. */
  .late {
    animation-delay: -0.8s;
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
    .flare {
      animation: none;
    }
  }
</style>
