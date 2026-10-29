<script lang="ts">
  /**
   * The stage's sheet (section 8 of ideas/design.md), drawn as the theme's `sheet` says.
   *
   * The clue scroll is a sheet torn top and bottom between two upright rolls, after the
   * game's quest reward scroll. The others have no rolls, so the stage makes no room for
   * them: the Wilderness's bounty poster, nailed up under the game's skull; the Party Room's
   * card under a string of bunting, in a checked tablecloth border; the TzHaar's obsidian
   * slab, chipped and glowing at the edge; the jungle's bark cloth in a frame of bamboo
   * lashed at the corners; the Gauntlet's board, dark inside a glowing crystal rim;
   * and Morytania's gravestone, moss at its foot.
   *
   * It is inline SVG and CSS on layer 8's tokens rather than an image, because an `<img>`
   * cannot read the theme's custom properties (section 13). The knobs are fixed-size
   * pieces and only a roll's body stretches, along its length, where its bands run, so no
   * height of sheet distorts them. `--scroll-scale` on any ancestor sizes the rolls,
   * margins and pin, and `--scroll-text` the words.
   *
   * Whatever is drawn on the sheet reads `--ink` and `--muted`, which the sheet points at
   * the scroll's own inks, so a stem needs no idea what it is written on to be legible.
   */
  import type { Snippet } from 'svelte'

  import skullUrl from '../../assets/sprites/skull.svg'
  import mushroomsUrl from '../../assets/textures/zanaris-mushrooms.svg'
  import { NO_AWARD, pinFor, type Award } from '../../lib/award'
  import { ART, buntingSwags, SWAG_WIDTH, type Sheet } from '../../lib/sheet'
  import Confetti from './Confetti.svelte'

  let {
    award = NO_AWARD,
    sheet = 'scroll',
    theme = '',
    children,
  }: {
    award?: Award
    sheet?: Sheet
    /** The page's theme, which picks the pin. */
    theme?: string
    children: Snippet
  } = $props()

  const pin = $derived(pinFor(theme, award.points))

  let buntingWidth = $state(0)
  const swags = $derived(buntingSwags(buntingWidth))
  const FLAG_COLOURS = [ART.flagRed, ART.flagYellow, ART.flagGreen, undefined]
  // The string's dip in px at k = 1, which is its viewBox's y scaled to the drawn height.
  const STRING_PX = 0.7
  const FLAGS = [0.2, 0.4, 0.6, 0.8].map((t) => {
    const y = 1 + 36 * t * (1 - t)
    const slope = (STRING_PX * 36 * (1 - 2 * t)) / SWAG_WIDTH
    return { t, drop: STRING_PX * y - 1, tilt: (Math.atan(slope) * 180) / Math.PI }
  })
</script>

{#snippet roll(side: 'left' | 'right')}
  <div class="roll {side}" aria-hidden="true">
    {@render finial('top')}
    <svg class="body" viewBox="0 0 40 10" preserveAspectRatio="none">
      <rect class="p" x="1.5" y="0" width="37" height="10" />
      <rect class="sh2" x="1.5" y="0" width="7.5" height="10" />
      <rect class="sh1" x="9" y="0" width="7" height="10" />
      <rect class="hi" x="22" y="0" width="6" height="10" />
      <rect class="sh1" x="32" y="0" width="6.5" height="10" />
      <rect class="ln" x="0" y="0" width="1.5" height="10" />
      <rect class="ln" x="38.5" y="0" width="1.5" height="10" />
    </svg>
    {@render finial('bottom')}
  </div>
{/snippet}

<!-- A roll's end at its natural size: knob, neck, rim, and the start of the roll. -->
<!-- A length of bamboo; its bands run along it, so it stretches without distorting. -->
{#snippet pole(side: 'top' | 'bottom' | 'left' | 'right')}
  {@const upright = side === 'left' || side === 'right'}
  <svg
    class="pole {side}"
    viewBox={upright ? '0 0 10 100' : '0 0 100 10'}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <g transform={upright ? 'matrix(0 1 1 0 0 0)' : undefined}>
      <rect width="100" height="10" fill={ART.bambooEdge} />
      <rect y="1" width="100" height="8" fill={ART.bamboo} />
      <rect y="2.5" width="100" height="2.5" fill={ART.bambooLight} />
      <rect y="7" width="100" height="2" fill={ART.bambooDark} />
    </g>
  </svg>
{/snippet}

{#snippet finial(end: 'top' | 'bottom')}
  <svg class="finial {end}" viewBox="0 0 40 34">
    <rect class="p" x="1.5" y="25" width="37" height="9" />
    <rect class="sh2" x="1.5" y="25" width="7.5" height="9" />
    <rect class="sh1" x="9" y="25" width="7" height="9" />
    <rect class="hi" x="22" y="25" width="6" height="9" />
    <rect class="sh1" x="32" y="25" width="6.5" height="9" />
    <rect class="ln" x="0" y="25" width="1.5" height="9" />
    <rect class="ln" x="38.5" y="25" width="1.5" height="9" />
    <path class="rim" d="M0 19h40v6.5H0z" />
    <path class="wood2 half" d="M20 19h20v6.5H20z" />
    <path class="stroke" d="M0 19h40v6.5H0z" />
    <rect class="wood" x="13" y="14" width="14" height="5" />
    <rect class="wood2" x="20" y="14" width="7" height="5" />
    <path class="wood" d="M8 14.5C8 8 13 3.5 20 3.5S32 8 32 14.5z" />
    <path class="wood2" d="M20 3.5c7 0 12 4.5 12 11H20z" />
    <rect class="wood2" x="17" y="0.8" width="6" height="3" />
    <path
      class="stroke"
      d="M8 14.5C8 8 13 3.5 20 3.5S32 8 32 14.5zM13 14h14v5H13zM17 0.8h6v2.7h-6z"
    />
  </svg>
{/snippet}

<div class="scroll" data-sheet={sheet}>
  {#if sheet === 'scroll'}{@render roll('left')}{/if}
  <div class="reveal">
    {#if sheet === 'gravestone'}
      <svg class="mound" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="50" cy="5" rx="50" ry="5" fill={ART.earth} />
      </svg>
    {/if}
    <div class="paper">
      {#if sheet === 'scroll' || sheet === 'slab' || sheet === 'gravestone'}
        <svg class="facets" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          <path class="fl" d="M0 0L18 0L26 22L8 60L0 60Z" />
          <path class="fd" d="M18 0L40 0L34 30L26 22Z" />
          <path class="fl" d="M40 0L63 0L55 26L34 30Z" />
          <path class="fd" d="M26 22L34 30L30 60L8 60Z" />
          <path class="fl" d="M34 30L55 26L60 60L30 60Z" />
          <path class="fd" d="M63 0L84 0L78 34L55 26Z" />
          <path class="fd" d="M55 26L78 34L86 60L60 60Z" />
          <path class="fl" d="M84 0L100 0L100 44L78 34Z" />
          <path class="fd" d="M78 34L100 44L100 60L86 60Z" />
        </svg>
      {:else if sheet === 'poster'}
        <img class="skull" src={skullUrl} alt="" width="50" height="50" draggable="false" />
      {:else if sheet === 'sign'}
        <svg class="altar" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="altar-stone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color={ART.signLight} />
              <stop offset="0.55" stop-color={ART.sign} />
              <stop offset="1" stop-color={ART.signDark} />
            </linearGradient>
          </defs>
          <path
            fill={ART.signEdge}
            d="M22 38L64 12L150 22L252 8L360 18L452 10L490 44L480 118L494 190L482 262L432 292L300 282L200 294L92 286L30 272L8 204L20 132L6 80Z"
          />
          <path
            fill="url(#altar-stone)"
            d="M28 42L66 18L150 28L252 14L360 24L450 16L484 46L474 118L488 190L476 258L430 286L300 276L200 288L94 280L34 266L14 202L26 132L12 82Z"
          />
          <path
            fill={ART.signShard}
            d="M30 46L64 22L110 26L74 34L46 62L40 104L28 92ZM480 48L448 20L392 24L430 32L456 60L462 102L476 90ZM18 200L32 262L92 276L60 262L40 236L36 196ZM484 192L472 254L428 282L452 256L462 228L466 188ZM14 120L26 132L22 160L12 150ZM486 140L476 118L480 104L490 128Z"
          />
          <path
            fill={ART.signShardDark}
            d="M46 62L74 34L120 30L86 46L58 74ZM456 60L430 32L384 30L414 46L444 74ZM40 236L60 262L110 272L74 254L52 226ZM462 228L452 256L398 272L432 252L450 222Z"
          />
        </svg>
        <img class="mushrooms" src={mushroomsUrl} alt="" draggable="false" />
      {:else if sheet === 'gauntlet'}
        <!-- The rim along each cut corner, which the inset rings cannot follow. -->
        {#each ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as corner (corner)}
          <svg class="cut {corner}" viewBox="0 0 24 24" aria-hidden="true">
            <path class="rim-outer" d="M0 13L13 0" />
            <path class="rim-inner" d="M0 20L20 0" />
          </svg>
        {/each}
      {/if}
      {#if sheet === 'gravestone'}
        <svg class="crack" viewBox="0 0 60 70" aria-hidden="true">
          <path d="M40 0L34 18L42 28L30 46L34 56L26 70" />
        </svg>
        <!-- A clump of moss in each corner of its foot, the same size on any width of stone. -->
        <svg class="moss left" viewBox="0 0 48 16" aria-hidden="true">
          <ellipse cx="18" cy="11" rx="17" ry="5" fill={ART.mossDark} />
          <ellipse cx="17" cy="10" rx="13" ry="3.5" fill={ART.moss} />
          <ellipse cx="38" cy="13" rx="10" ry="3" fill={ART.mossDark} />
        </svg>
        <svg class="moss right" viewBox="0 0 48 16" aria-hidden="true">
          <ellipse cx="34" cy="12" rx="12" ry="4" fill={ART.mossDark} />
          <ellipse cx="33" cy="11" rx="8" ry="2.5" fill={ART.moss} />
        </svg>
      {/if}
      <div class="content">
        {@render children()}
      </div>
    </div>
    {#if sheet === 'bunting'}
      <div class="bunting" bind:clientWidth={buntingWidth} aria-hidden="true">
        {#each { length: swags }, s (s)}
          <div class="swag">
            <svg class="string" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d="M0 1Q50 19 100 1"
                fill="none"
                stroke={ART.string}
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            {#each FLAGS as flag, f (f)}
              {@const colour = FLAG_COLOURS[(s + f) % FLAG_COLOURS.length]}
              <svg
                class="flag"
                viewBox="0 0 22 22"
                style:left="{flag.t * 100}%"
                style:--drop={flag.drop}
                style:--tilt="{flag.tilt}deg"
              >
                <path class:blue={!colour} d="M0 0h22l-11 22z" fill={colour} />
              </svg>
            {/each}
          </div>
        {/each}
        {#each { length: swags + 1 }, i (i)}
          <svg class="knot" viewBox="0 0 12 20" style:left="{(i / swags) * 100}%">
            <path
              d="M6 6q-2.5 4 0 7t0.5 6"
              fill="none"
              stroke={ART.string}
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <circle cx="6" cy="4" r="3.2" fill={ART.string} />
          </svg>
        {/each}
      </div>
    {:else if sheet === 'bamboo'}
      {@render pole('top')}
      {@render pole('bottom')}
      {@render pole('left')}
      {@render pole('right')}
      {#each ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as corner (corner)}
        <svg class="lashing {corner}" viewBox="0 0 18 18" aria-hidden="true">
          <rect width="18" height="18" rx="3" fill={ART.lashing} />
          <path
            d="M0 4L4 0H8L0 8ZM0 12L12 0H16L0 16ZM4 18L18 4V8L8 18ZM12 18L18 12V16L16 18Z"
            fill={ART.lashingLight}
          />
        </svg>
      {/each}
    {:else if sheet === 'poster'}
      {#each ['left', 'right'] as side (side)}
        <svg class="fixing {side}" viewBox="0 0 10 10" aria-hidden="true">
          <circle cx="5" cy="5" r="5" fill={ART.nail} />
          <circle cx="3.6" cy="3.6" r="1.8" fill={ART.nailLight} />
        </svg>
      {/each}
    {/if}
    {#if award.kind !== 'none'}
      <!-- Hidden from a screen reader: the points slot has already said the verdict. -->
      <div class="award" class:sprite={pin.sprite} aria-hidden="true" data-award={award.kind}>
        <img class="pin" src={pin.url} alt="" draggable="false" />
        {#if award.kind === 'confetti'}
          <Confetti />
        {/if}
      </div>
    {/if}
  </div>
  {#if sheet === 'scroll'}{@render roll('right')}{/if}
</div>

<style>
  .scroll {
    --k: var(--scroll-scale, 1);
    --roll-w: calc(26px * var(--k));
    --finial: calc(22px * var(--k));
    --tuck: calc(5px * var(--k));
    position: relative;
    padding: calc(var(--finial) * 0.75) calc(var(--roll-w) - var(--tuck));
    filter: drop-shadow(0 3px 0 rgb(0 0 0 / 0.22));
  }

  /* Only the scroll has rolls to make room for. */
  .scroll:not([data-sheet='scroll']) {
    --roll-w: 0px;
    --finial: 0px;
    --tuck: 0px;
  }

  .roll {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    width: var(--roll-w);
    display: flex;
    flex-direction: column;
  }

  .roll.left {
    left: 0;
  }

  .roll.right {
    right: 0;
    transform: scaleX(-1);
  }

  .roll svg {
    display: block;
    width: 100%;
    flex: none;
  }

  .finial {
    height: var(--finial);
  }

  .finial.bottom {
    transform: scaleY(-1);
  }

  .roll .body {
    flex: 1;
    height: 0;
    min-height: 0;
  }

  .reveal {
    position: relative;
    box-sizing: border-box;
  }

  .paper {
    --ink: var(--scroll-ink);
    --muted: var(--scroll-muted);
    position: relative;
    display: flex;
    flex-direction: column;
    padding: calc(1.1rem * var(--k)) calc(0.9rem * var(--k) + var(--tuck)) calc(1rem * var(--k));
    /* Four lines of prompt at the least, so a one-liner still makes a sheet. */
    min-height: calc(4 * 1.3 * max(1rem, 1.2rem * var(--scroll-text, 1)) + 2.1rem * var(--k));
    background: var(--scroll-paper);
    color: var(--ink);
    --font-display: 'RuneScape', var(--font-body);
    --font-numeric: var(--font-display);
    font-family: var(--font-display);
    font-synthesis: none;
    /* Every sheet centres its words; only the host's bubble reads from the left. */
    text-align: center;
  }

  /* Each sheet's own rules sit in :where(), so the stage's phone padding still wins. */
  :where(.scroll:not([data-sheet='scroll'])) .paper {
    padding-inline: calc(1.3rem * var(--k));
  }

  :where(.scroll[data-sheet='scroll']) .paper {
    box-shadow:
      inset 14px 0 12px -10px color-mix(in srgb, var(--scroll-edge) 55%, transparent),
      inset -14px 0 12px -10px color-mix(in srgb, var(--scroll-edge) 55%, transparent);
    /* Torn top and bottom: the notches keep their depth in px and spread across in %. */
    clip-path: polygon(
      0 7px,
      7% 3px,
      15% 6px,
      24% 1px,
      29% 3px,
      31% 13px,
      33.5% 3px,
      45% 5px,
      57% 0,
      66% 4px,
      72% 1px,
      74% 10px,
      76.5% 2px,
      88% 6px,
      100% 3px,
      100% calc(100% - 6px),
      92% calc(100% - 2px),
      81% calc(100% - 5px),
      69% calc(100% - 1px),
      61% calc(100% - 4px),
      49% calc(100% - 3px),
      47% calc(100% - 12px),
      45% calc(100% - 2px),
      33% calc(100% - 6px),
      22% calc(100% - 1px),
      12% calc(100% - 5px),
      0 calc(100% - 2px)
    );
  }

  /* The bounty poster: sooty paper inside a faded rule, a corner torn off, the game's skull
     at its head and a nail through each top corner. */
  :where(.scroll[data-sheet='poster']) .paper {
    padding-top: calc(1.6rem * var(--k) + 50px * var(--k));
    background:
      radial-gradient(ellipse 30% 20% at 80% 30%, rgb(0 0 0 / 0.18), transparent),
      radial-gradient(ellipse 35% 25% at 20% 85%, rgb(0 0 0 / 0.2), transparent),
      var(--scroll-paper);
    box-shadow:
      inset 0 0 0 6px var(--scroll-paper),
      inset 0 0 0 7.5px color-mix(in srgb, var(--scroll-ink) 35%, transparent),
      inset 0 0 22px 4px rgb(0 0 0 / 0.45);
    clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 20px, 100% 100%, 0 100%);
  }

  .skull {
    position: absolute;
    left: 50%;
    top: calc(0.9rem * var(--k));
    width: calc(50px * var(--k));
    height: auto;
    transform: translateX(-50%);
  }

  /* The Party Room's card, in a border of the tablecloth's checks under a string of
     bunting. */
  :where(.scroll[data-sheet='bunting']) .reveal {
    padding: calc(10px * var(--k));
    border-radius: 4px;
    background: repeating-conic-gradient(
        var(--accent) 0 25%,
        color-mix(in srgb, var(--accent), white 35%) 0 50%
      )
      0 0 / calc(12px * var(--k)) calc(12px * var(--k));
  }

  :where(.scroll[data-sheet='bunting']) .paper {
    padding-top: calc(1.1rem * var(--k) + 26px * var(--k));
    border-radius: 2px;
  }

  /* Fixed-size flags on swags whose count follows the width, knotted at every end. */
  .bunting {
    position: absolute;
    z-index: 1;
    left: calc(5px * var(--k));
    right: calc(5px * var(--k));
    top: calc(4px * var(--k));
    display: flex;
  }

  .swag {
    position: relative;
    flex: 1;
  }

  .bunting svg {
    position: absolute;
    display: block;
  }

  .string {
    left: 0;
    top: 0;
    width: 100%;
    height: calc(14px * var(--k));
  }

  .flag {
    top: calc(var(--drop) * 1px * var(--k));
    width: calc(18px * var(--k));
    height: calc(18px * var(--k));
    transform: translateX(-50%) rotate(var(--tilt));
    transform-origin: 50% 0;
  }

  .knot {
    top: calc(-2.5px * var(--k));
    width: calc(10px * var(--k));
    height: calc(16px * var(--k));
    transform: translateX(-50%);
  }

  .blue {
    fill: var(--accent);
  }

  /* The TzHaar's obsidian slab, chipped at the edges and lit from within by the lava. */
  .scroll[data-sheet='slab'] {
    filter: drop-shadow(0 0 1.5px var(--scroll-edge))
      drop-shadow(0 0 9px color-mix(in srgb, var(--scroll-edge) 35%, transparent))
      drop-shadow(0 3px 0 rgb(0 0 0 / 0.4));
  }

  :where(.scroll[data-sheet='slab']) .paper {
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--scroll-paper), white 8%),
      var(--scroll-paper) 40%,
      color-mix(in srgb, var(--scroll-paper), black 25%)
    );
    clip-path: polygon(
      0 10px,
      4% 2px,
      18% 0,
      30% 5px,
      44% 1px,
      61% 3px,
      70% 0,
      86% 4px,
      97% 0,
      100% 12px,
      99% 40%,
      100% 72%,
      98% calc(100% - 8px),
      88% 100%,
      71% calc(100% - 4px),
      58% 100%,
      40% calc(100% - 5px),
      24% 100%,
      9% calc(100% - 3px),
      0 calc(100% - 12px),
      1% 60%,
      0 30%
    );
  }

  [data-sheet='slab'] .fd {
    fill: black;
    fill-opacity: 0.16;
  }

  /* The jungle's bark cloth, woven fine, inside four lengths of bamboo lashed at the
     corners. The poles overrun the frame a little, as cut cane does. */
  :where(.scroll[data-sheet='bamboo']) .reveal {
    padding: calc(11px * var(--k));
  }

  :where(.scroll[data-sheet='bamboo']) .paper {
    background:
      repeating-linear-gradient(
        0deg,
        color-mix(in srgb, var(--scroll-edge) 10%, transparent) 0 1px,
        transparent 1px 6px
      ),
      var(--scroll-paper);
  }

  .pole {
    position: absolute;
    z-index: 1;
    --pole: calc(11px * var(--k));
    --overrun: calc(6px * var(--k));
  }

  .pole.top,
  .pole.bottom {
    left: calc(-1 * var(--overrun));
    width: calc(100% + 2 * var(--overrun));
    height: var(--pole);
  }

  .pole.top {
    top: calc(4px * var(--k));
  }

  .pole.bottom {
    bottom: calc(4px * var(--k));
  }

  /* An upright pole is the same length of bamboo turned on its side. */
  .pole.left,
  .pole.right {
    top: calc(-1 * var(--overrun));
    height: calc(100% + 2 * var(--overrun));
    width: var(--pole);
  }

  .pole.left {
    left: calc(4px * var(--k));
  }

  .pole.right {
    right: calc(4px * var(--k));
  }

  .lashing {
    position: absolute;
    z-index: 2;
    width: calc(18px * var(--k));
    height: calc(18px * var(--k));
  }

  .lashing.top-left {
    left: 0;
    top: 0;
  }

  .lashing.top-right {
    right: 0;
    top: 0;
  }

  .lashing.bottom-left {
    left: 0;
    bottom: 0;
  }

  .lashing.bottom-right {
    right: 0;
    bottom: 0;
  }

  /* The Gauntlet's board: near-black inside a crystal rim that glows, its
     corners cut. Centred, like the game's. */
  .scroll[data-sheet='gauntlet'] {
    filter: drop-shadow(0 0 5px color-mix(in srgb, var(--scroll-edge) 55%, transparent))
      drop-shadow(0 3px 0 rgb(0 0 0 / 0.35));
  }

  :where(.scroll[data-sheet='gauntlet']) .paper {
    background:
      radial-gradient(
        ellipse 60% 50% at 50% 0%,
        color-mix(in srgb, var(--scroll-edge) 8%, transparent),
        transparent
      ),
      var(--scroll-paper);
    box-shadow:
      inset 0 0 0 2px var(--scroll-edge),
      inset 0 0 0 5px var(--scroll-paper),
      inset 0 0 0 6.5px color-mix(in srgb, var(--scroll-edge) 50%, var(--scroll-paper));
    clip-path: polygon(
      12px 0,
      calc(100% - 12px) 0,
      100% 12px,
      100% calc(100% - 12px),
      calc(100% - 12px) 100%,
      12px 100%,
      0 calc(100% - 12px),
      0 12px
    );
    padding-inline: calc(1.9rem * var(--k));
  }

  .cut {
    position: absolute;
    width: 24px;
    height: 24px;
    fill: none;
  }

  .cut.top-left {
    left: 0;
    top: 0;
  }

  .cut.top-right {
    right: 0;
    top: 0;
    transform: scaleX(-1);
  }

  .cut.bottom-left {
    left: 0;
    bottom: 0;
    transform: scaleY(-1);
  }

  .cut.bottom-right {
    right: 0;
    bottom: 0;
    transform: scale(-1);
  }

  .rim-outer {
    stroke: var(--scroll-edge);
    stroke-width: 3;
  }

  .rim-inner {
    stroke: color-mix(in srgb, var(--scroll-edge) 50%, var(--scroll-paper));
    stroke-width: 1.5;
  }

  /* Zanaris's sign at the Cosmic altar: teal stone with pale crystal shards at its corners,
     stretched to any sheet, and a clump of the city's mushrooms at its foot. */
  :where(.scroll[data-sheet='sign']) .paper {
    padding: calc(1.8rem * var(--k)) calc(3rem * var(--k)) calc(1.8rem * var(--k));
    background: none;
    box-shadow: none;
  }

  /* The stone's body spans x 12 to 488 of its 500, so it overhangs the sheet by that margin
     and its edge lines up with the panels beside it. */
  .altar {
    position: absolute;
    top: 0;
    left: -2.52%;
    width: 105.04%;
    height: 100%;
  }

  .mushrooms {
    position: absolute;
    right: calc(-10px * var(--k));
    bottom: calc(-16px * var(--k));
    width: calc(64px * var(--k));
  }

  /* Morytania's gravestone: an arched slab of grey stone with an engraved rule inside its
     edge, a crack down one side, moss at its foot and the grave's earth under it. A long
     sheet, the hiscores, stands up as a pillar. */
  :where(.scroll[data-sheet='gravestone']) .reveal {
    margin-bottom: calc(6px * var(--k));
  }

  :where(.scroll[data-sheet='gravestone']) .paper {
    padding-top: calc(2.6rem * var(--k));
    border-radius: 50% 50% 4px 4px / calc(56px * var(--k)) calc(56px * var(--k)) 4px 4px;
    background:
      radial-gradient(ellipse 25% 20% at 75% 30%, rgb(0 0 0 / 0.06), transparent),
      radial-gradient(ellipse 30% 25% at 25% 55%, rgb(255 255 255 / 0.1), transparent),
      var(--scroll-paper);
    box-shadow:
      inset 0 0 0 2px var(--scroll-edge),
      inset 0 0 0 9px var(--scroll-paper),
      inset 0 0 0 10.5px color-mix(in srgb, var(--scroll-edge) 45%, transparent);
    overflow: hidden;
  }

  .crack {
    position: absolute;
    right: calc(24px * var(--k));
    top: calc(20px * var(--k));
    width: calc(60px * var(--k));
    height: calc(70px * var(--k));
    fill: none;
    stroke: var(--scroll-edge);
    stroke-width: 1.5;
  }

  .moss {
    position: absolute;
    bottom: 0;
    width: calc(48px * var(--k));
    height: calc(16px * var(--k));
  }

  .moss.left {
    left: calc(4px * var(--k));
  }

  .moss.right {
    right: calc(4px * var(--k));
  }

  .mound {
    position: absolute;
    left: calc(-16px * var(--k));
    bottom: calc(-10px * var(--k));
    width: calc(100% + 32px * var(--k));
    height: calc(14px * var(--k));
  }

  .fixing {
    position: absolute;
    z-index: 1;
    top: calc(8px * var(--k));
    width: calc(8px * var(--k));
    height: calc(8px * var(--k));
  }

  .fixing.left {
    left: calc(10px * var(--k));
  }

  .fixing.right {
    right: calc(34px * var(--k));
  }

  .facets {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* A column, so a line on the sheet can centre itself in whatever height is left. */
  .content {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* The rolls' wood and paper: flat bands, like the game's own shading. */
  .fl {
    fill: white;
    fill-opacity: var(--scroll-facet-light);
  }

  .fd {
    fill: var(--scroll-edge);
    fill-opacity: 0.08;
  }

  .p {
    fill: color-mix(in srgb, var(--scroll-paper), var(--scroll-edge) 12%);
  }

  .hi {
    fill: white;
    fill-opacity: 0.3;
  }

  .sh1 {
    fill: var(--scroll-edge);
    fill-opacity: 0.25;
  }

  .sh2 {
    fill: var(--scroll-edge);
    fill-opacity: 0.5;
  }

  .ln {
    fill: var(--scroll-edge);
  }

  .wood {
    fill: color-mix(in srgb, var(--scroll-paper), var(--scroll-edge) 45%);
  }

  .wood2 {
    fill: color-mix(in srgb, var(--scroll-paper), var(--scroll-edge) 70%);
  }

  .wood2.half {
    opacity: 0.5;
  }

  .rim {
    fill: color-mix(in srgb, var(--scroll-paper), var(--scroll-edge) 25%);
  }

  .stroke {
    fill: none;
    stroke: var(--scroll-edge);
    stroke-width: 1.3;
  }

  /* A hand-over holds the scroll at a size while what is on it changes: the sheet fills
     it, whatever its words would make it. */
  .scroll:global(.morphing) {
    box-sizing: border-box;
  }

  .scroll:global(.morphing) .reveal {
    height: 100%;
  }

  .scroll:global(.morphing) .paper {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* The pin hangs from the sheet's bottom edge, 65% of the way across. */
  .award {
    position: absolute;
    z-index: 2;
    left: 65%;
    bottom: calc(-42px * var(--k));
    width: calc(42px * var(--k));
    height: calc(66px * var(--k));
    transform: translateX(-50%);
  }

  .pin {
    display: block;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 2px 0 rgb(0 0 0 / 0.3));
    transform-origin: 50% 30%;
    animation: pin 200ms ease-out;
  }

  /* A game sprite at twice its pixels, centred on the edge rather than hanging below it. */
  .award.sprite {
    bottom: 0;
    width: auto;
    height: auto;
    transform: translate(-50%, 55%);
  }

  .sprite .pin {
    width: auto;
    height: auto;
    scale: calc(2 * var(--k));
    transform-origin: 50% 50%;
  }

  @keyframes pin {
    from {
      transform: scale(0.4) rotate(-20deg);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pin {
      animation: none !important;
    }
  }

  /* Under 448px of screen the sheet runs edge to edge and the screen cuts the rolls in half,
     so the roll's centre sits on the edge. */
  @media (max-width: 447.98px) {
    .scroll {
      padding-inline: 0;
    }

    .roll.left {
      left: calc(-0.5 * var(--roll-w));
    }

    .roll.right {
      right: calc(-0.5 * var(--roll-w));
    }
  }
</style>
