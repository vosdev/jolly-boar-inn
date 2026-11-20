<script lang="ts">
  /**
   * The stage's sheet (section 8 of ideas/design.md), drawn as the theme's `sheet` says.
   *
   * The clue scroll is a sheet torn top and bottom between two upright rolls, after the
   * game's quest reward scroll. The others have no rolls, so the stage makes no room for
   * them: the Wilderness's bounty poster, the game's skull faint behind its words; the Party
   * Room's card in a checked tablecloth border, bunting strung along its top; the TzHaar's
   * obsidian slab, chipped and glowing at the edge; the jungle's bark cloth in a frame of
   * bamboo lashed at the corners; the Gauntlet's board, dark inside a glowing crystal rim;
   * Morytania's gravestone, moss at its foot; and Zanaris's teal stone, crystal in its
   * corners and mushrooms at its foot.
   *
   * Every sheet sets its words in by the scroll's margins, `--frame-*`, and draws its
   * decorations inside them, so the same words make the same size of sheet in every theme.
   *
   * It is inline SVG and CSS on layer 8's tokens rather than an image, because an `<img>`
   * cannot read the theme's custom properties (section 13). The knobs are fixed-size
   * pieces and only a roll's body stretches, along its length, where its bands run, so no
   * height of sheet distorts them. `--scroll-scale` on any ancestor sizes the rolls,
   * margins and pin, and `--scroll-text` the words.
   *
   * Whatever is drawn on the sheet reads `--ink` and `--muted`, which the sheet points at
   * the scroll's own inks, so a stem needs no idea what it is written on to be legible.
   *
   * Outside this file only the root is styled: `.scroll`, or `[data-sheet]` for what is
   * written on a sheet. The stage asks for anything deeper through the props below, so a
   * wrapper renamed here breaks nothing elsewhere.
   */
  import type { Snippet } from 'svelte'

  import skullUrl from '../../assets/sprites/skull.svg'
  import mushroomsUrl from '../../assets/textures/zanaris-mushrooms.svg'
  import { NO_AWARD, pinFor, type Award } from '../../lib/award'
  import { ART, BUNTING_HEIGHT, buntingLayout, type Sheet } from '../../lib/sheet'
  import Confetti from './Confetti.svelte'
  import Rosette from './Rosette.svelte'

  let {
    award = NO_AWARD,
    sheet = 'scroll',
    theme = '',
    hideWords = false,
    fill = false,
    edge = false,
    content = $bindable(null),
    children,
  }: {
    award?: Award
    sheet?: Sheet
    /** The page's theme, which picks the rosette's mark. */
    theme?: string
    /** Fade the words off the sheet and keep them off, the sheet itself staying put. */
    hideWords?: boolean
    /** Stretch the sheet to the height its parent gives it, as the TV's does. */
    fill?: boolean
    /**
     * Under 448px of screen, run the words to 1rem inside the cut rolls, for a sheet laid
     * edge to edge across the screen.
     */
    edge?: boolean
    /** The element the words are written in. */
    content?: HTMLElement | null
    children: Snippet
  } = $props()

  const pin = $derived(pinFor(theme))

  let buntingWidth = $state(0)
  let buntingHeight = $state(0)
  const FLAG_COLOURS = [ART.flagRed, ART.flagYellow, ART.flagGreen, undefined]
  // The box is BUNTING_HEIGHT * --k tall, so its two sides give the width at scale 1.
  const bunting = $derived(
    buntingLayout(buntingHeight ? (buntingWidth * BUNTING_HEIGHT) / buntingHeight : 0),
  )
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

<div class="scroll" class:fill class:edge data-sheet={sheet}>
  {#if sheet === 'scroll'}{@render roll('left')}{/if}
  <div class="reveal">
    <div class="paper">
      {#if sheet === 'scroll' || sheet === 'slab' || sheet === 'gravestone' || sheet === 'sign'}
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
      {:else if sheet === 'gauntlet'}
        <!-- The rim along each cut corner, which the inset rings cannot follow. -->
        {#each ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as corner (corner)}
          <svg class="cut {corner}" viewBox="0 0 24 24" aria-hidden="true">
            <path class="rim-outer" d="M0 13L13 0" />
            <path class="rim-inner" d="M0 20L20 0" />
          </svg>
        {/each}
      {/if}
      {#if sheet === 'sign'}
        {#each ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as corner (corner)}
          <svg class="shard {corner}" viewBox="0 0 60 40" aria-hidden="true">
            <path fill={ART.signShard} d="M2 6L20 1L42 3L24 8L10 19L7 34L1 27Z" />
            <path fill={ART.signShardDark} d="M10 19L24 8L46 6L28 13L14 25Z" />
          </svg>
        {/each}
        {#each ['left', 'right'] as side (side)}
          <svg class="shard side {side}" viewBox="0 0 14 30" aria-hidden="true">
            <path fill={ART.signShard} d="M1 0L12 9L9 23L1 30Z" />
          </svg>
        {/each}
        {#each ['left', 'right'] as side (side)}
          <img class="mushrooms {side}" src={mushroomsUrl} alt="" draggable="false" />
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
      <div class="content" class:hidden={hideWords} bind:this={content}>
        {@render children()}
      </div>
    </div>
    {#if sheet === 'bunting'}
      <div
        class="bunting"
        bind:clientWidth={buntingWidth}
        bind:clientHeight={buntingHeight}
        aria-hidden="true"
      >
        <svg viewBox="0 0 {bunting.width} {BUNTING_HEIGHT}">
          {#each bunting.swags as d (d)}
            <path class="swag" {d} fill="none" stroke={ART.string} stroke-width="1.5" />
          {/each}
          {#each bunting.flags as flag (flag.d)}
            {@const colour = FLAG_COLOURS[flag.colour % FLAG_COLOURS.length]}
            <path
              class="flag"
              class:blue={!colour}
              d={flag.d}
              transform={flag.transform}
              fill={colour}
            />
          {/each}
          {#each bunting.knots as x (x)}
            <g class="knot" transform="translate({x} 0)">
              <path
                d="M0 5q-2 3 0 5.5t0.4 5"
                fill="none"
                stroke={ART.string}
                stroke-width="1.2"
                stroke-linecap="round"
              />
              <circle cy="3" r="2.6" fill={ART.string} />
            </g>
          {/each}
        </svg>
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
      <div class="award" aria-hidden="true" data-award={award.kind}>
        <span class="pin"><Rosette mark={pin} /></span>
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
    /* How far every sheet sets its words in: the scroll's rolls and margins. */
    --frame-top: calc(16.5px * var(--k) + 1.1rem * var(--k));
    --frame-side: calc(26px * var(--k) + 0.9rem * var(--k));
    --frame-bottom: calc(16.5px * var(--k) + 1rem * var(--k));
    /* The border a sheet draws round its paper, which its paper's padding gives back. */
    --rim: 0px;
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
    padding: var(--rim);
  }

  .paper {
    --ink: var(--scroll-ink);
    --muted: var(--scroll-muted);
    position: relative;
    display: flex;
    flex-direction: column;
    padding: calc(1.1rem * var(--k)) calc(0.9rem * var(--k) + var(--tuck)) calc(1rem * var(--k));
    /* Four lines of prompt at the least, so a one-liner still makes a sheet. */
    min-height: calc(
      var(--scroll-lines, 4) * 1.3 * max(1rem, 1.2rem * var(--scroll-text, 1)) + 2.1rem * var(--k)
    );
    background: var(--scroll-paper);
    color: var(--ink);
    --font-display: 'RuneScape', var(--font-body);
    --font-numeric: var(--font-display);
    font-family: var(--font-display);
    font-synthesis: none;
    /* Every sheet centres its words; only the host's bubble reads from the left. */
    text-align: center;
  }

  /* Each sheet's own rules sit in :where(), so an `edge` sheet's phone padding still wins. */
  :where(.scroll:not([data-sheet='scroll'])) .paper {
    padding: calc(var(--frame-top) - var(--rim)) calc(var(--frame-side) - var(--rim))
      calc(var(--frame-bottom) - var(--rim));
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
     faint behind the words and a nail through each top corner. */
  :where(.scroll[data-sheet='poster']) .paper {
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

  /* Darker than the paper, never lighter, so the ink keeps its contrast across it. */
  .skull {
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(104px * var(--k));
    height: auto;
    transform: translate(-50%, -50%);
    filter: brightness(0);
    opacity: 0.25;
  }

  /* The Party Room's card, in a border of the tablecloth's checks, bunting strung along its
     top. */
  .scroll[data-sheet='bunting'] {
    --rim: calc(10px * var(--k));
  }

  :where(.scroll[data-sheet='bunting']) .reveal {
    border-radius: 4px;
    background: repeating-conic-gradient(
        var(--accent) 0 25%,
        color-mix(in srgb, var(--accent), white 35%) 0 50%
      )
      0 0 / calc(12px * var(--k)) calc(12px * var(--k));
  }

  :where(.scroll[data-sheet='bunting']) .paper {
    border-radius: 2px;
  }

  /* Fixed-size flags on swags whose count follows the width, knotted at every end on the
     checks, the flags hanging into the paper's margin above the words. */
  .bunting {
    position: absolute;
    z-index: 1;
    left: calc(5px * var(--k));
    right: calc(5px * var(--k));
    top: calc(2px * var(--k));
    height: calc(30px * var(--k));
  }

  .bunting svg {
    display: block;
    width: 100%;
    height: 100%;
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
     corners. */
  .scroll[data-sheet='bamboo'] {
    --rim: calc(11px * var(--k));
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
  }

  .pole.top,
  .pole.bottom {
    left: 0;
    width: 100%;
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
    top: 0;
    height: 100%;
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

  /* Zanaris's stone: teal, faceted, its corners rounded like the city's panels, pale crystal
     at its corners and halfway down each side as on the Cosmic altar's sign, and a clump of
     the city's mushrooms in each corner of its foot. */
  :where(.scroll[data-sheet='sign']) .paper {
    border-radius: calc(10px * var(--k));
    background:
      radial-gradient(
        ellipse 70% 60% at 50% 35%,
        color-mix(in srgb, var(--scroll-paper), white 14%),
        transparent
      ),
      var(--scroll-paper);
    box-shadow:
      inset 0 0 0 2px var(--scroll-edge),
      inset 0 0 0 6px var(--scroll-paper),
      inset 0 0 0 7.5px color-mix(in srgb, var(--scroll-paper), white 45%);
  }

  .shard {
    position: absolute;
    width: calc(60px * var(--k));
    height: calc(40px * var(--k));
  }

  .shard.top-left {
    left: calc(6px * var(--k));
    top: calc(6px * var(--k));
  }

  .shard.top-right {
    right: calc(6px * var(--k));
    top: calc(6px * var(--k));
    transform: scaleX(-1);
  }

  .shard.bottom-left {
    left: calc(6px * var(--k));
    bottom: calc(6px * var(--k));
    transform: scaleY(-1);
  }

  .shard.bottom-right {
    right: calc(6px * var(--k));
    bottom: calc(6px * var(--k));
    transform: scale(-1);
  }

  .shard.side {
    top: calc(50% - 15px * var(--k));
    width: calc(14px * var(--k));
    height: calc(30px * var(--k));
  }

  .shard.side.left {
    left: calc(6px * var(--k));
  }

  .shard.side.right {
    right: calc(6px * var(--k));
    transform: scaleX(-1);
  }

  .mushrooms {
    position: absolute;
    bottom: calc(4px * var(--k));
    right: calc(4px * var(--k));
    width: calc(51px * var(--k));
  }

  .mushrooms.left {
    right: auto;
    left: calc(4px * var(--k));
    width: calc(39px * var(--k));
    transform: scaleX(-1);
  }

  /* Morytania's gravestone: a slab of grey stone under a low arch, an engraved rule inside
     its edge, a crack down one side and moss at its foot. A long sheet, the hiscores, stands
     up as a pillar. */
  :where(.scroll[data-sheet='gravestone']) .paper {
    border-radius: 50% 50% 4px 4px / calc(26px * var(--k)) calc(26px * var(--k)) 4px 4px;
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

  /* The crack runs down the margin, clear of the words. */
  .crack {
    position: absolute;
    right: calc(4px * var(--k));
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

  /* As long as a random event's NPC takes to leave, `RETURN_GUEST_OUT_MS` of `lib/interlude.ts`. */
  .content.hidden {
    opacity: 0;
    animation: words-out 225ms ease-in both;
  }

  @keyframes words-out {
    from {
      opacity: 1;
    }
  }

  .fill,
  .fill > .reveal {
    display: flex;
    flex-direction: column;
  }

  .fill > .reveal,
  .fill > .reveal > .paper {
    flex: 1;
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

    .content.hidden {
      animation: none !important;
    }
  }

  /* Under 448px of screen the sheet runs edge to edge and the screen cuts the rolls in half,
     so the roll's centre sits on the edge. */
  @media (max-width: 447.98px) {
    .scroll {
      padding-inline: 0;
    }

    .edge .paper {
      padding-inline: calc(var(--roll-w) / 2 + 1rem);
    }

    .roll.left {
      left: calc(-0.5 * var(--roll-w));
    }

    .roll.right {
      right: calc(-0.5 * var(--roll-w));
    }
  }
</style>
