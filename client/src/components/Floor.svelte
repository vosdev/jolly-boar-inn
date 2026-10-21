<script lang="ts">
  /**
   * What lies strewn across a theme's floor, behind everything: the Party Room's balloons
   * and red partyhats, the jungle's fruit and the desert's finds.
   *
   * Drawn only while such a theme is the page's. A theme is nothing but `data-theme` on
   * <html>, so that attribute is what this watches. Positions and colours are SVG
   * attributes rather than styles, which `style-src 'self'` would refuse.
   */
  import { onMount } from 'svelte'

  import {
    ART,
    darker,
    FLOORS,
    type FloorTheme,
    hasFloor,
    lighter,
    scatter,
    SPRITES,
  } from '../lib/floor'

  let theme = $state<FloorTheme | null>(null)
  let width = $state(0)
  let height = $state(0)
  const seed = Math.floor(Math.random() * 2 ** 32)

  const drops = $derived(theme === null ? [] : scatter(FLOORS[theme], width, height, seed))

  onMount(() => {
    const root = document.documentElement
    const look = (): void => {
      const name = root.dataset.theme
      theme = hasFloor(name) ? name : null
    }
    look()
    const watcher = new MutationObserver(look)
    watcher.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => watcher.disconnect()
  })
</script>

{#if theme !== null}
  <div class="floor" aria-hidden="true" bind:clientWidth={width} bind:clientHeight={height}>
    <svg {width} {height} focusable="false">
      {#each drops as drop, index (index)}
        {#if drop.kind === 'sprite'}
          {@const art = SPRITES[drop.sprite]}
          <!-- Whole pixels either way round, so the sprite stays as sharp as in game. -->
          <image
            href={art.url}
            x={-Math.floor(art.width / 2)}
            y={-Math.floor(art.height / 2)}
            width={art.width}
            height={art.height}
            transform="translate({drop.x} {drop.y}){drop.mirrored ? ' scale(-1 1)' : ''}"
            data-drop={drop.sprite}
          />
        {:else if drop.kind === 'hat'}
          <g
            transform="translate({drop.x} {drop.y}) rotate({drop.angle})"
            stroke-linejoin="round"
            data-drop="hat"
          >
            <path
              d="M-9-2-5.2-9.2-1.2 0 4.8-10 8.8 0 13.2-7.2 13.6 2z"
              fill={ART.hatBack}
              stroke={ART.hatOutline}
              stroke-width="1"
            />
            <path
              d="M-15.2 10.4V-1.6l4.8 5.6 4.4-12.8 5 11.2 5.2-13.2 4.6 12.4 6.4-7.2v16z"
              fill={ART.hatFront}
              stroke={ART.hatOutline}
              stroke-width="1"
            />
            <path d="M-14.4 9.6V.4l4 4.4 3.8-10.8 2 4.8-3.2 10.8z" fill={ART.hatLight} />
            <path d="M-1 3.2 4.2-10 5.4-6.8 1.2 9.6z" fill={ART.hatFold} />
            <path d="M10.4 9.6h4.2V-3.8L10 1.4z" fill={ART.hatShadow} />
            <path d="M-14.4 9.6h29V8h-29z" fill={ART.hatBack} />
          </g>
        {:else}
          <g transform="translate({drop.x} {drop.y}) rotate({drop.angle})" data-drop="balloon">
            <path d="M-9.4 0H-12.4" stroke={ART.tie} stroke-width="2" />
            <path d="M-12 0-15-2.4-14.2 0-15 2.4z" fill={drop.colour} />
            <path d="M-12 0-14.2 0-15 2.4z" fill={darker(drop.colour, 0.25)} />
            <path
              d="M-10 0-6-5-1-8.6 4.5-9.4 9.6-7 12.6-2.2 12.2 3.6 8.6 8 3 9.6-2.4 8.2-6.4 4.8z"
              fill={drop.colour}
            />
            <!-- The light falls from the same side whichever way a balloon lies. -->
            <g transform="translate(3 0) rotate({-drop.angle})">
              <path d="M1 1.6 7-.4 6.6 3.8 3.4 6.6-1 7z" fill={darker(drop.colour, 0.18)} />
              <path d="M7-.4 7.6 2.2 6.6 3.8z" fill={darker(drop.colour, 0.3)} />
              <path d="M-7-1-4.8-5.4-.6-7 .6-3-3 .2z" fill={lighter(drop.colour, 0.3)} />
              <path d="M-5-3.4-3.6-5.2-2-5.6-2.6-3.6z" fill={lighter(drop.colour, 0.6)} />
            </g>
          </g>
        {/if}
      {/each}
    </svg>
  </div>
{/if}

<style>
  /* Under #app's content, which is its own stacking context so that -1 stops above the
     floor texture on <body> rather than beneath it. */
  .floor {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
  }

  svg {
    display: block;
  }
</style>
