<script lang="ts">
  /**
   * The stage's drawing (section 8 of ideas/design.md): the round's host standing at the
   * clue scroll's bottom-left, the scroll, and the line everything else sits below. `Stage`
   * draws one for a screen; the room's shared stage draws one for every screen in turn,
   * with empty `slots` its screens' parts are moved into.
   *
   * The splash and every question screen draw on it. What is read goes on the sheet;
   * what is pressed or scored — the ready check, gems, the combobox, the points slot —
   * goes under the line, so no gem is ever measured against parchment.
   *
   * It is one size at every width: at most 30rem, and a stage under 26rem, a phone, sets
   * the smaller numbers the prototype settled on. Under 448px of screen the row runs out
   * to the screen's edges, which cut the rolls in half, and the host steps onto the sheet,
   * the words wrapping around it.
   *
   * The host is its chathead, at 78px and at 68px on a phone.
   *
   * Home's stage may have a `hero` instead, a selfhoster's picture (§14 of design.md). It is
   * no chathead: a whole figure, shorter for its width, so it stands bigger. With 600px of
   * stage it is 240px beside the scroll, which widens to keep its own 30rem; narrower it
   * takes the host's place at 120px, and on a phone stands partly off the screen's edge.
   *
   * A random event's NPC, the `guest`, stands on the right instead, and the host leaves
   * the stage (section 12). `entering` plays that change: the host fades out, the scroll
   * slides left into the space it leaves, and the guest fades in. Without it the guest is
   * simply there, which is what a reveal or a reconnect late in the hold wants. On a phone
   * the scroll stays put and the guest takes the host's place, on the sheet's other side.
   * `returning` mirrors it at the reveal's end, the words leaving with the guest, so the
   * host is in place for what follows and nothing moves with words on it.
   *
   * A `tall` sheet, the hiscores, runs longer than a screen, so the host stands at its
   * top-left beside the line it speaks, and the sheet keeps its full width below. What is
   * written beside the host clears it by `--host-clear`. `beside` stands on the right,
   * over the right roll at the sheet's foot: the final's trophy.
   *
   * The sheet is the theme's (`lib/sheet.ts`), and `board` asks for Home's notice board. A
   * sheet without rolls takes their room away, so the host laps over the sheet's own edge.
   *
   * A `tv` stage is the room's TV's (section 16): what goes under the line stands beside
   * the scroll instead, a panel of one width whatever is in it, and under it again on a
   * screen taller than it is wide. Its widths are set, not found, because the stage is a
   * size container; its height is at least the room's TV's `--tv-min-height`, so the
   * stage keeps one shape, and one scale, from question to reveal and back. A `wide` TV
   * stage has no panel: its sheet takes the stage's whole width, and narrows to make room
   * for the panel when the next screen brings one.
   */
  import { onMount, type Snippet } from 'svelte'

  import { NO_AWARD, type Award } from '../../lib/award'
  import { FALLBACK_NPC, npcArt } from '../../lib/npcs'
  import { STRANGER } from '../../lib/randomEvents'
  import type { Presence } from '../../lib/sharedStage.svelte'
  import { keepSeated } from '../../lib/seat'
  import { hasRolls, sheetFor } from '../../lib/sheet'
  import { watchTheme } from '../../lib/theme'
  import ClueScroll from './ClueScroll.svelte'

  let {
    host = FALLBACK_NPC,
    paper,
    award = NO_AWARD,
    board = false,
    guest = null,
    entering = false,
    returning = false,
    hero = null,
    tall = false,
    beside,
    children,
    slots = false,
    presence = 'here',
    tv = false,
    wide = false,
    root = $bindable(null),
  }: {
    /** A picture to stand in the host's place instead, larger: Home's, from the branding. */
    hero?: string | null
    /** The NPC id of the round's host, from `hostOf` in `lib/modes.ts`. */
    host?: string
    /** What is written on the sheet. */
    paper?: Snippet
    award?: Award
    /** Home's notice board in place of the scroll, where the theme has one. */
    board?: boolean
    /** The NPC id of a random event's NPC, who takes the stage from the host. */
    guest?: string | null
    /** Play the guest's entrance rather than start with it in place. */
    entering?: boolean
    /** Hand the stage back: the guest leaves and the host returns. */
    returning?: boolean
    /** The host at the sheet's top, for a sheet longer than the host is tall. */
    tall?: boolean
    /** What stands on the right, opposite the host. */
    beside?: Snippet
    /** What sits under the line. */
    children?: Snippet
    /** Keep the sheet, the line and the right side empty for parts moved in. */
    slots?: boolean
    /** A hand-over: whoever stands beside the scroll leaving, gone or walking on. */
    presence?: Presence
    /** The room's TV's stage, with its panel beside the scroll. */
    tv?: boolean
    /** On the TV, the sheet across the whole stage, with no panel beside it. */
    wide?: boolean
    root?: HTMLElement | null
  } = $props()

  const art = $derived(npcArt(host))
  // An event NPC with no art is not drawn as the fallback boar, who would read as a host.
  const guestArt = $derived(guest === null ? null : npcArt(guest, undefined, STRANGER))

  let theme = $state(document.documentElement.dataset.theme ?? '')
  const sheet = $derived(sheetFor(theme, board))

  onMount(() => watchTheme((now) => (theme = now)))

  const event = $derived(guestArt !== null && !returning)

  let hostNpc = $state<HTMLElement | null>(null)
  let guestNpc = $state<HTMLElement | null>(null)

  // A tall sheet needs no wrapping: the host stands only beside its top line.
  $effect(() => {
    const content = root?.querySelector<HTMLElement>('.content') ?? null
    const npc = event ? guestNpc : hostNpc
    if (tall || content === null || npc === null) return
    return keepSeated(content, npc, event ? 'right' : 'left', () => tv)
  })
</script>

<div
  class="stage"
  class:with-hero={hero !== null}
  class:tv
  class:wide={tv && wide}
  bind:this={root}
>
  <div
    class="stage-row presence-{presence}"
    class:flat={!hasRolls(sheet)}
    class:tall
    class:event
    class:entering={guestArt !== null && entering && !returning}
    class:returning={guestArt !== null && returning}
  >
    <div class="npc host" aria-hidden="true" bind:this={hostNpc}>
      <img
        class={hero === null ? art.cut : 'hero'}
        src={hero ?? art.url}
        alt=""
        draggable="false"
      />
    </div>
    <ClueScroll {award} {sheet} {theme}>
      {@render paper?.()}
    </ClueScroll>
    {#if guestArt !== null}
      <div class="npc guest" aria-hidden="true" bind:this={guestNpc}>
        <img class={guestArt.cut} src={guestArt.url} alt="" draggable="false" />
      </div>
    {/if}
    {#if beside || slots}
      <div class="beside" aria-hidden="true">
        {@render beside?.()}
      </div>
    {/if}
  </div>
  {#if children || slots}
    <div class="under">
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
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

  /* How far the host laps over the sheet's edge: over a roll, or as far into a sheet
     without rolls as it would reach past a roll into the scroll's paper. */
  .stage-row {
    --lap: var(--npc-lap);
  }

  .stage-row.flat {
    --roll-w: 0px;
    --finial: 0px;
    --lap: calc(var(--npc-lap) - 21px * var(--k));
  }

  .stage-row > :global(.scroll) {
    flex: 1;
    min-width: 0;
  }

  /* A hand-over sets the scroll's width itself while it moves. */
  .stage-row > :global(.scroll.morphing) {
    flex: none;
  }

  .npc {
    flex: none;
    position: relative;
    z-index: 3;
    width: var(--npc-w);
    margin-right: calc(-1 * var(--lap));
  }

  /* The text beside the host starts this far in from the sheet's left edge. */
  .tall {
    --beside-w: 92px;
    --host-clear: calc(var(--npc-w) - var(--roll-w) - 0.9rem * var(--k) + 0.5rem);
  }

  .tall .npc {
    position: absolute;
    left: 0;
    top: calc(var(--finial) * 0.75 + 4px);
    margin: 0;
  }

  .beside {
    position: absolute;
    z-index: 4;
    right: 0;
    bottom: calc(var(--finial) * 0.75 + 4px);
    width: var(--beside-w, 92px);
    pointer-events: none;
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

  /* A random event: the guest stands right, facing in, and the host has left the stage. */
  .event .guest {
    order: 2;
    margin-right: 0;
    margin-left: calc(-1 * var(--lap));
  }

  .event .host {
    position: absolute;
    left: 0;
    bottom: 0;
    margin: 0;
    opacity: 0;
  }

  .guest :is(.chathead, .drawing) {
    transform: scaleX(-1);
  }

  .guest .render {
    transform: none;
  }

  .entering .host {
    animation: fade-out 300ms ease-in both;
  }

  .entering > :global(.scroll) {
    animation: slide-left 375ms ease-out both;
  }

  .entering .guest {
    animation: guest-in 375ms ease-out 225ms both;
  }

  /* The way back, a step at a time in `RETURN_*_MS` of `lib/interlude.ts`: the guest and
     the words leave, then the scroll slides home, then the host walks back on. */
  .returning > :global(.scroll .content) {
    opacity: 0;
    animation: fade-out 225ms ease-in both;
  }

  .returning .guest {
    position: absolute;
    right: 0;
    bottom: 0;
    margin: 0;
    opacity: 0;
    animation: fade-out 225ms ease-in both;
  }

  .returning .host {
    animation: fade-in 300ms ease-out 600ms both;
  }

  .returning > :global(.scroll) {
    animation: slide-right 375ms ease-out 225ms both;
  }

  /* A hand-over to somebody else: whoever stands leaves, and the next walks on once the
     scroll is in place, in `HOST_OUT_MS` and `HOST_IN_MS` of `lib/stageMoves.ts`. */
  .presence-leaving :is(.host, .guest) {
    animation: leave 200ms ease-in both;
  }

  .presence-away :is(.host, .guest) {
    opacity: 0;
  }

  .presence-arriving :is(.host, .guest) {
    animation: fade-in 200ms ease-out both;
  }

  @keyframes leave {
    to {
      opacity: 0;
    }
  }

  @keyframes fade-out {
    from {
      opacity: 1;
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes slide-right {
    from {
      transform: translateX(calc(var(--lap) - var(--npc-w)));
    }
  }

  @keyframes slide-left {
    from {
      transform: translateX(calc(var(--npc-w) - var(--lap)));
    }
  }

  @keyframes guest-in {
    from {
      opacity: 0;
      transform: translateX(16px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :is(.entering, .returning) :is(.host, .guest),
    :is(.entering, .returning) > :global(.scroll),
    .returning > :global(.scroll .content) {
      animation: none;
    }
  }

  /* The hero's 240px less what it laps over the scroll, so the scroll keeps its 30rem. */
  .stage.with-hero {
    max-width: calc(30rem + 200px);
  }

  .with-hero .stage-row {
    --npc-w: 120px;
    --npc-lap: 32px;
  }

  @container (min-width: 600px) {
    .with-hero .stage-row {
      --npc-w: 240px;
      --npc-lap: 40px;
    }
  }

  @container (max-width: 26rem) {
    .stage-row {
      --npc-w: 68px;
      --npc-lap: 32px;
      --scroll-scale: 0.8;
      --scroll-text: 0.9;
    }

    .tall {
      --beside-w: 72px;
    }
  }

  /* Out to the screen's edges, past main's 1rem gutter, with the rolls' outer halves cut
     off there rather than scrolling the page sideways. The host stands on the sheet, and
     the words wrap around it (`lib/seat.ts`). */
  @media (max-width: 447.98px) {
    .stage-row {
      margin-inline: -1rem;
      overflow-x: clip;
    }

    .stage-row :global(.paper) {
      padding-inline: calc(var(--roll-w) / 2 + 1rem);
    }

    .npc {
      position: absolute;
      left: calc(var(--roll-w) / 2 + 6px);
      bottom: calc(var(--finial) * 0.75);
      margin: 0;
    }

    /* The NPCs swap sides and the scroll stays put: the words wrap around the guest. */
    .event .host {
      left: calc(var(--roll-w) / 2 + 6px);
      bottom: calc(var(--finial) * 0.75);
    }

    :is(.event, .returning) .guest {
      left: auto;
      right: calc(var(--roll-w) / 2 + 6px);
      bottom: calc(var(--finial) * 0.75);
    }

    :is(.entering, .returning) > :global(.scroll) {
      animation: none;
    }

    .tall {
      --host-clear: calc(6px + var(--npc-w) - 1rem + 0.4rem);
    }

    .tall .npc {
      top: calc(var(--finial) * 0.75 + 4px);
      bottom: auto;
    }

    .beside {
      right: calc(var(--roll-w) / 2 + 4px);
    }
  }

  .under {
    margin-top: 1rem;
  }

  .under:empty {
    display: none;
  }

  /* The TV's panel beside the scroll, stretched to its height, the reveal's width while it
     waits as well, so nothing on the stage changes size between the two. */
  .stage.tv {
    --tv-gap: 1.5rem;
    display: flex;
    align-items: stretch;
    gap: var(--tv-gap);
    width: calc(30rem + var(--tv-gap) + 22rem);
    max-width: none;
    min-height: var(--tv-min-height, 0);
  }

  /* The sheet and the panel are always one height, the taller one's. */
  /* Read from the sofa: the sheet's words at about 56px on a 1080p screen, less where they
     would not fit (`--tv-text`, `SharedStageView`), and whoever stands on it near twice a
     phone's size, to go with them. */
  .tv .stage-row {
    --scroll-text: var(--tv-text, 1.6);
    --npc-w: 140px;
    flex: none;
    width: 30rem;
    align-items: stretch;
    transition: width 400ms ease-in-out;
  }

  .wide .stage-row {
    width: 100%;
  }

  .stage.wide .under {
    display: none;
  }

  /* The TV's sheet has height to spare, so whoever stands there stands on it, over its
     foot as on a phone, and gives the sheet the stage's whole width; the words wrap round
     them (`lib/seat.ts`). The host keeps the left, an event's NPC the right. */
  .tv .npc {
    position: absolute;
    left: calc(var(--roll-w) / 2 + 6px);
    bottom: calc(var(--finial) * 0.75);
    margin: 0;
  }

  .tv :is(.event, .returning) .guest {
    left: auto;
    right: calc(var(--roll-w) / 2 + 6px);
  }

  .tv :is(.entering, .returning) > :global(.scroll) {
    animation: none;
  }

  .tv .stage-row > :global(.scroll),
  .tv .stage-row > :global(.scroll > .reveal) {
    display: flex;
    flex-direction: column;
  }

  .tv .stage-row > :global(.scroll > .reveal),
  .tv .stage-row > :global(.scroll > .reveal > .paper) {
    flex: 1;
  }

  .tv .under {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    margin-top: 0;
  }

  .tv .under :global(.tv-panel) {
    flex: 1;
  }

  @media (orientation: portrait) {
    .stage.tv {
      flex-direction: column;
      width: 30rem;
    }

    /* Its words are shrunk to fit it, so it would give all its height to a long question. */
    .tv .under {
      margin-top: 0;
      min-height: 16rem;
    }

    .wide .stage-row {
      flex: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stage.tv,
    .tv .stage-row {
      transition: none;
    }
  }

  /* On a phone the hero stands bigger than a host would, so part of it goes past the
     screen's left edge rather than taking the sheet's words from them. */
  @media (max-width: 447.98px) {
    .with-hero .stage-row {
      --hero-off: 24px;
    }

    .with-hero .npc {
      left: calc(-1 * var(--hero-off));
      bottom: 0;
    }
  }

  /* What `lib/seat.ts` marks beside the NPC on a phone: a line wraps around a float that is
     solid only from the NPC's head down; a row or a control steps aside whole. */
  .stage :global([data-seat^='wrap']::before) {
    content: '';
    float: left;
    width: var(--seat-w);
    height: var(--seat-h);
    shape-outside: inset(var(--seat-from) 0 0 0);
  }

  .stage :global([data-seat='wrap-right']::before) {
    float: right;
  }

  .stage :global([data-seat='shift-left']) {
    margin-left: var(--seat-w);
  }

  .stage :global([data-seat='shift-right']) {
    margin-right: var(--seat-w);
  }
</style>
