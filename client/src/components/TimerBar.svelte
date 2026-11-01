<script lang="ts">
  /**
   * The question's clock as a thin bar under the top bar (section 7.2).
   *
   * Full width and draining from the left, so it is something to glance at rather than a
   * number to stare at, and it costs a phone six pixels where `Timer`'s plaque cost a
   * row. The seconds still exist, small, in a tab hanging off the bar's right end, and
   * in full for a screen reader.
   *
   * In a team game the bar and its tabs take the player's god's colours, the frame's
   * (`app.css`), and the team's badge hangs between the tabs. The fill keeps the god's
   * colour to the end there, since `--bad` would vanish on Zamorak's track: the seconds
   * tab goes back to the theme's, in `--bad`.
   *
   * In a room laid out for a desktop (`roomShown`) the tabs hang at the stage's edges,
   * beside the table, at the room's scale.
   *
   * On the room's TV the stage is scaled to the window (`tvFit`), and the tabs with it: at
   * the scaled stage's edges, at its scale, readable across the room.
   *
   * The clock is `Timer`'s, `lib/clock.ts`, so a phone that was locked for twenty seconds
   * wakes onto the right width, not twenty seconds behind.
   */
  import { msUntil, serverNow } from '../lib/clock'
  import type { TeamId } from '../lib/teams'
  import { roomShown, stageEdges } from '../lib/roomFit'
  import { tvFit } from '../lib/tv'
  import TeamBadge from './TeamBadge.svelte'

  let {
    endsAt,
    totalSeconds,
    label,
    progress,
    stage = false,
    next,
    quiet = false,
    team = null,
    flush = false,
  }: {
    endsAt: string
    totalSeconds: number
    label: string
    progress?: string
    /** Hang the tabs at the stage's edges with no number to say so. */
    stage?: boolean
    /** What follows a reveal, counted down to: the tab says "Next in 6s", the fill is quiet. */
    next?: string
    /** The quiet fill with a plain tab: the standings, whose panel says what comes next. */
    quiet?: boolean
    /** The player's team in a team game, whose colours the bar takes. */
    team?: TeamId | null
    /** At the window's top, with no top bar above it: the room's TV. */
    flush?: boolean
  } = $props()

  /** Where the bar turns urgent, in seconds. */
  const URGENT_S = 5

  const remainingMs = $derived(msUntil(endsAt, $serverNow))
  // Ceil, so the last whole second on screen is "1" and not a flash of "0". Never more
  // than the whole: a random event's clock starts after its NPC's hold, and until
  // then the bar sits full on the question's own length rather than counting the hold.
  const seconds = $derived(Math.ceil(Math.min(remainingMs, totalSeconds * 1000) / 1000))
  const fraction = $derived(totalSeconds > 0 ? Math.min(1, remainingMs / (totalSeconds * 1000)) : 0)
  const urgent = $derived(next === undefined && !quiet && remainingMs > 0 && seconds <= URGENT_S)
  const edges = $derived(
    $roomShown === null ? null : stageEdges($roomShown.fit, $roomShown.centred),
  )
  const scale = $derived($tvFit?.scale ?? $roomShown?.fit.scale ?? null)
</script>

<div
  class="timerbar"
  class:urgent
  class:next={next !== undefined || quiet}
  class:framed={team !== null}
  class:flush
  aria-label="{seconds} seconds {label}"
>
  <div class="track" aria-hidden="true">
    <div class="fill" style:width="{fraction * 100}%"></div>
  </div>
  <!-- A question's screen is the stage's 30rem column, so its tabs hang at the stage's
       edges. The question's number is the heading's to say to a screen reader. -->
  <div
    class="column"
    class:stage={stage || progress !== undefined}
    class:tv={$tvFit !== null}
    class:room={$tvFit === null && edges !== null}
    style:--tv-width={$tvFit === null ? null : `${$tvFit.width}px`}
    style:--stage-left={edges === null ? null : `${edges.left}px`}
    style:--stage-width={edges === null ? null : `${edges.width}px`}
    style:--tab-scale={scale}
    aria-hidden="true"
  >
    {#if progress !== undefined}
      <span class="tab progress">{progress}</span>
    {/if}
    {#if team !== null}
      <span class="team"><TeamBadge {team} /></span>
    {/if}
    <span class="tab seconds">{next === undefined ? `${seconds}s` : `${next} in ${seconds}s`}</span>
  </div>
</div>

<style>
  /* Sticky under the top bar, and taking no height from the page: the track lies over
     main's top padding and the tab hangs into it, so the stage does not drop six pixels
     from the splash, which has no bar, into the round's first question. */
  .timerbar {
    position: sticky;
    top: var(--topbar-height);
    z-index: 19;
    height: 6px;
    margin-bottom: -6px;
  }

  .flush {
    top: 0;
  }

  .track {
    height: 6px;
    background: var(--panel);
    box-shadow: 0 var(--border-width) 0 var(--line);
    display: flex;
    justify-content: flex-end;
  }

  /* Anchored right, so the time that is gone empties out from the left. */
  .fill {
    height: 100%;
    background: var(--accent);
    /* Only as long as a tick, so a jump back from a sleeping tab lands at once. */
    transition: width 100ms linear;
  }

  .urgent .fill {
    background: var(--bad);
  }

  .next .fill {
    background: var(--muted);
  }

  /* The screens' column, so the tab lines up with the panels rather than the window. */
  /* Three columns, so the team's badge stays centred however wide the two tabs are. */
  .column {
    width: min(42rem, 100% - 2rem);
    margin-inline: auto;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: start;
  }

  .column.stage {
    width: min(30rem, 100% - 2rem);
  }

  .column.tv {
    width: min(var(--tv-width), 100% - 2rem);
  }

  .column.room {
    width: var(--stage-width);
    margin-inline: var(--stage-left) 0;
  }

  .tv .tab,
  .room .tab {
    font-size: calc(0.8rem * var(--tab-scale));
  }

  .progress {
    grid-column: 1;
    justify-self: start;
  }

  .team {
    grid-column: 2;
    display: flex;
  }

  .seconds {
    grid-column: 3;
    justify-self: end;
  }

  .tab {
    padding: 0 0.45rem;
    background: var(--panel);
    color: var(--surface-ink);
    border: var(--border-width) solid var(--line);
    border-top: none;
    border-radius: 0 0 min(var(--radius), 6px) min(var(--radius), 6px);
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.5;
  }

  .urgent .seconds {
    color: var(--bad);
  }

  .framed .track {
    background: var(--frame-dark);
    box-shadow: 0 var(--border-width) 0 var(--frame-dark);
  }

  .framed .fill,
  .framed.urgent .fill {
    background: var(--frame-light);
  }

  .framed .tab {
    background: var(--frame);
    color: var(--frame-ink);
    border-color: var(--frame-dark);
  }

  /* Back on the theme's own tab, where `--bad` is held to 4.5:1: on Zamorak's red a red
     tab would not change at all. */
  .framed.urgent .seconds {
    background: var(--panel);
    color: var(--bad);
    border-color: var(--bad);
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
