<script lang="ts">
  /**
   * The logo over the Gauntlet's door, drawn flat: a ring of thorns around a compass star,
   * lit cyan as the crystal is, or red in the Corrupted Gauntlet. Colours are SVG attributes
   * rather than styles, which `style-src 'self'` would refuse.
   */
  import { DOOR_LOGO } from '../lib/wallLights'

  let { gauntlet }: { gauntlet: keyof typeof DOOR_LOGO } = $props()

  const ART = $derived(DOOR_LOGO[gauntlet])

  const THORNS =
    'M50 4.5 64 6.3 50-4.5ZM44.5 23.3 53.7 27.1 47.9 15ZM32.2 38.5 40.8 49.7 38.5 32.2ZM15 47.9 18.8 57.2 23.3 44.5ZM-4.5 50-6.3 64 4.5 50ZM-23.3 44.5-27.1 53.7-15 47.9ZM-38.5 32.2-49.7 40.8-32.2 38.5ZM-47.9 15-57.2 18.8-44.5 23.3ZM-50-4.5-64-6.3-50 4.5ZM-44.5-23.3-53.7-27.1-47.9-15ZM-32.2-38.5-40.8-49.7-38.5-32.2ZM-15-47.9-18.8-57.2-23.3-44.5ZM4.5-50 6.3-64-4.5-50ZM23.3-44.5 27.1-53.7 15-47.9ZM38.5-32.2 49.7-40.8 32.2-38.5ZM47.9-15 57.2-18.8 44.5-23.3Z'
  // The cross and the four arcs that bow in toward the star between the two rings.
  const SPOKES =
    'M0-37V37M-37 0H37M-30-22C-10-5 10-5 30-22M-30 22C-10 5 10 5 30 22M-22-30C-5-10-5 10-22 30M22-30C5-10 5 10 22 30'
  const STAR = 'M0-18 4.5-4.5 18 0 4.5 4.5 0 18-4.5 4.5-18 0-4.5-4.5Z'
</script>

<svg viewBox="-66 -66 132 132" focusable="false">
  <path d={THORNS} fill={ART.glow} stroke={ART.glow} stroke-width="2" stroke-linejoin="round" />
  <g fill="none" stroke={ART.cut} stroke-width="8" stroke-linecap="round">
    <circle r="50" />
    <circle r="37" />
    <path d={SPOKES} />
  </g>
  <g fill="none" stroke={ART.glow} stroke-width="4.5" stroke-linecap="round">
    <circle r="50" />
    <circle r="37" />
    <path d={SPOKES} />
  </g>
  <path d={STAR} fill={ART.glow} stroke={ART.cut} stroke-width="1.5" />
  <circle r="50" fill="none" stroke={ART.core} stroke-width="1.3" opacity=".85" />
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    overflow: visible;
    filter: drop-shadow(0 0 6px var(--logo-glow));
  }
</style>
