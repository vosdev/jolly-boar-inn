<script lang="ts">
  /**
   * The stage (section 8 of ideas/design.md): the round's host standing at the clue
   * scroll's bottom-left, the scroll, and the line everything else sits below.
   *
   * The splash and every question screen draw on it. What is read goes on the sheet;
   * what is pressed or scored — the ready check, gems, the combobox, the points slot —
   * goes under the line, so no gem is ever measured against parchment.
   *
   * It is one size at every width: at most 30rem, and a stage under 26rem, a phone, sets
   * the smaller numbers the prototype settled on. Under 448px of screen the row runs out
   * to the screen's edges, which cut the rolls in half, and the host steps onto the sheet.
   *
   * The host is its chathead, at 78px and at 68px on a phone.
   */
  import type { Snippet } from 'svelte'

  import type { Award } from '../../lib/award'
  import { FALLBACK_NPC, npcArt } from '../../lib/npcs'
  import ClueScroll from './ClueScroll.svelte'

  let {
    host = FALLBACK_NPC,
    paper,
    opening = false,
    award = 'none',
    children,
  }: {
    /** The NPC id of the round's host, from `hostOf` in `lib/modes.ts`. */
    host?: string
    /** What is written on the sheet. */
    paper: Snippet
    opening?: boolean
    award?: Award
    /** What sits under the line. */
    children?: Snippet
  } = $props()

  const art = $derived(npcArt(host))
</script>

<div class="stage">
  <div class="stage-row">
    <div class="npc host" aria-hidden="true">
      <img class={art.cut} src={art.url} alt="" draggable="false" />
    </div>
    <ClueScroll {opening} {award}>
      {@render paper()}
    </ClueScroll>
  </div>
  {#if children}
    <div class="under">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .stage {
    container-type: inline-size;
    width: 100%;
    max-width: 30rem;
    margin-inline: auto;
  }

  /* The host needs the rolls' sizes too, so the row carries the scroll's numbers as well. */
  .stage-row {
    --npc-w: 78px;
    --npc-lap: 30px;
    --k: var(--scroll-scale, 1);
    --roll-w: calc(26px * var(--k));
    --finial: calc(22px * var(--k));
    position: relative;
    display: flex;
    align-items: flex-end;
  }

  .stage-row > :global(.scroll) {
    flex: 1;
    min-width: 0;
  }

  .npc {
    flex: none;
    position: relative;
    z-index: 3;
    width: var(--npc-w);
    margin-right: calc(-1 * var(--npc-lap));
  }

  .npc img {
    display: block;
    width: 100%;
    height: auto;
    filter: drop-shadow(0 3px 0 rgb(0 0 0 / 0.25));
  }

  /* A wiki render is the whole NPC, facing left: only its head, cut square so the cast
     stands level, and turned to the sheet. Chatheads already face it. */
  .npc .render {
    aspect-ratio: 1;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  @container (max-width: 26rem) {
    .stage-row {
      --npc-w: 68px;
      --npc-lap: 32px;
      --scroll-scale: 0.8;
      --scroll-text: 0.9;
    }
  }

  /* Out to the screen's edges, past main's 1rem gutter, with the rolls' outer halves cut
     off there rather than scrolling the page sideways. The host stands on the sheet, and
     the sheet keeps a column clear for it. */
  @media (max-width: 447.98px) {
    .stage-row {
      margin-inline: -1rem;
      overflow-x: clip;
    }

    .stage-row :global(.paper) {
      padding-left: calc(var(--roll-w) / 2 + var(--npc-w) + 1.1rem);
      padding-right: calc(var(--roll-w) / 2 + 1rem);
    }

    .npc {
      position: absolute;
      left: calc(var(--roll-w) / 2 + 6px);
      bottom: calc(var(--finial) * 0.75);
      margin: 0;
    }
  }

  .under {
    margin-top: 1rem;
  }
</style>
