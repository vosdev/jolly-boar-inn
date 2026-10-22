<script lang="ts">
  /**
   * TzHaar's sulphur vent: a cone of obsidian round a pool of lava, as the game draws it.
   * Colours are SVG attributes rather than styles, which `style-src 'self'` would refuse.
   *
   * It stands in the lower half of its view box, so the lava, where the light comes from,
   * sits at half its height.
   */
  import { VENT as ART } from '../lib/wallLights'

  let { side }: { side: 'left' | 'right' } = $props()
</script>

<svg viewBox="0 0 100 160" focusable="false">
  <g transform="translate(0 68)">
    <path
      d="M19 11.9 25 4.6 37.2 0l23.4.9 20 4.5 5.5 16.1 6.4 15.9 7.4 15-4.9 12.7-22.5 10-42.2-2.1L0 66l4.7-18.2 6.4-12.5 1.2-5.3z"
      fill={ART.rock}
    />
    <path d="M19 11.9 39.2 15.5 30.3 73 0 66l4.7-18.2 6.4-12.5 1.2-5.3z" fill={ART.rockLit} />
    <path
      d="M62.9 17.4 76 11.8l4.6-6.4 5.5 16.1 6.4 15.9 7.4 15-4.9 12.7-22.5 10z"
      fill={ART.rockShade}
    />
    <path d="M19 11.9 25 4.6 37.2 0l23.4.9 20 4.5-4.6 6.4-13.1 5.6-23.7-1.9z" fill={ART.rim} />
    <path
      d="M24.6 10.9 27.6 6.4l11.3-4.5 20 .8L74 5.4 71.2 11l-11.3 4.5-19-.9z"
      fill={ART.rimInner}
    />
    <g class="lava" class:late={side === 'right'}>
      <path d="M28.6 11.8 38.7 8.4l19.8.9 12.7 1.7-11.3 4.5-19-.9z" fill={ART.lava} />
      <path d="M52 9 58.5 9.3 71.2 11l-11.3 4.5-4.9-.3z" fill={ART.lavaHot} />
    </g>
    <path
      d="M19 11.9 39.2 15.5 62.9 17.4 76 11.8l.4 1.2-13.4 5.8-24-1.9-20.4-3.7z"
      fill={ART.lip}
    />
  </g>
</svg>

<style>
  svg {
    display: block;
    width: 100%;
  }

  /* The lava simmers, out of step with the other vent. */
  .lava {
    animation: simmer 2.4s infinite alternate ease-in-out;
  }

  .late {
    animation-delay: -1.1s;
  }

  @keyframes simmer {
    to {
      opacity: 0.8;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lava {
      animation: none;
    }
  }
</style>
