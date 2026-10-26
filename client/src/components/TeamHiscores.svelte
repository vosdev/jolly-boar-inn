<script lang="ts">
  /**
   * A team game's hiscores on the Wise Old Man's scroll: the teams ranked by logo, name and
   * points, with the round's gain and the places moved as `Hiscores` draws them, and each
   * team's members under it with their own totals, best first, so the weak link shows.
   * With `columns`, as `Hiscores` has them, each team's line puts its move and gain in
   * columns of their own.
   *
   * `teams` is the order to draw, and a new order moves the teams rather than jumping them.
   * Until `settled` a team shows its rank and total before the round, as do its members.
   */
  import { cubicOut } from 'svelte/easing'
  import { flip } from 'svelte/animate'

  import {
    arrivalDelay,
    membersOf,
    movement,
    pointsBefore,
    SHUFFLE,
    type Movement,
  } from '../lib/hiscores'
  import { petOf } from '../lib/pets'
  import type { Standing, TeamStanding } from '../lib/protocol'
  import { players } from '../lib/stores'
  import { team, type TeamId } from '../lib/teams'
  import CountUp from './CountUp.svelte'
  import Pet from './Pet.svelte'
  import TeamLogo from './TeamLogo.svelte'

  let {
    teams,
    standings,
    teamOf,
    youId = null,
    settled = true,
    arriving = false,
    instant = false,
    changes = true,
    columns = false,
  }: {
    teams: TeamStanding[]
    standings: Standing[]
    /** Each player's team by id. */
    teamOf: Record<string, TeamId>
    youId?: string | null
    /** The new ranks, totals, gains and moves; otherwise the ones before the round. */
    settled?: boolean
    /** The teams arrive top to bottom, as the final's table unrolls. */
    arriving?: boolean
    /** No counting and no moving: reduced motion. */
    instant?: boolean
    /** The round's gains and moves; a past game has the totals alone. */
    changes?: boolean
    /** One line a team, the move and the gain in columns of their own. */
    columns?: boolean
  } = $props()

  const numbers = new Intl.NumberFormat()

  function nameOf(standing: Standing): string {
    return $players.find((p) => p.id === standing.player_id)?.display_name ?? standing.display_name
  }

  function petFor(standing: Standing): string {
    const player = $players.find((p) => p.id === standing.player_id)
    return petOf(player ?? { id: standing.player_id, avatar: standing.avatar })
  }
</script>

{#snippet moved(move: Movement | null)}
  {#if move !== null}
    <span class="move" class:up={move.up} class:down={!move.up}
      ><span class="sr">{move.up ? 'up ' : 'down '}</span>{move.by}</span
    >
  {/if}
{/snippet}

{#snippet gained(row: TeamStanding)}
  <span class="gain" class:shown={settled}
    >+{numbers.format(row.points_gained)}<span class="sr">{' this round'}</span></span
  >
{/snippet}

<ol
  class="team-hiscores"
  class:arriving
  class:columns
  class:totals={!changes}
  aria-label="Team hiscores"
>
  {#each teams as row, i (row.team)}
    {@const god = team(row.team)}
    {@const members = membersOf(row.team, standings, teamOf)}
    {@const move = settled && changes ? movement(row) : null}
    <li
      class="team"
      data-team={row.team}
      style:animation-delay={arriving ? `${arrivalDelay(i + 1, teams.length + 1)}ms` : null}
      animate:flip={{ duration: instant ? 0 : SHUFFLE.move, easing: cubicOut }}
    >
      <div class="head">
        <span class="rank">
          <span class="sr">Rank </span><span class="number"
            >{settled ? row.rank : (row.previous_rank ?? '–')}</span
          >
          {#if !columns}{@render moved(move)}{/if}
        </span>
        {#if columns && changes}<span class="moved">{@render moved(move)}</span>{/if}
        <span class="logo"><TeamLogo team={row.team} /></span>
        <span class="name">{god.name}</span>
        {#if columns && changes}<span class="round">{@render gained(row)}</span>{/if}
        <span class="points">
          <span class="total"
            ><CountUp
              value={settled ? row.points : pointsBefore(row)}
              duration={instant ? 0 : SHUFFLE.count}
            /><span class="sr">{' points'}</span></span
          >
          {#if changes && !columns}{@render gained(row)}{/if}
        </span>
      </div>
      {#if members.length > 0}
        <ul class="members" aria-label="{god.name}’s players">
          {#each members as standing (standing.player_id)}
            {@const you = standing.player_id === youId}
            <li class:you>
              <span class="who">
                <Pet pet={petFor(standing)} size={24} label="" />
                <span
                  >{nameOf(standing)}{#if you}{' '}<span class="note">(you)</span>{/if}</span
                >
              </span>
              <span class="member-points"
                ><CountUp
                  value={settled ? standing.points : pointsBefore(standing)}
                  duration={instant ? 0 : SHUFFLE.count}
                /></span
              >
            </li>
          {/each}
        </ul>
      {/if}
    </li>
  {/each}
</ol>

<style>
  .team-hiscores {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: max(0.95rem, 1.05rem * var(--scroll-text, 1));
    font-variant-numeric: tabular-nums;
  }

  /* The god's colour sits on the team's edge, never behind the words, so the names read in
     the scroll's own ink whatever the theme. */
  .team {
    position: relative;
    border-left: 4px solid var(--team-trim);
    padding: 0.2rem 0 0.25rem 0.4rem;
    border-bottom: 1px solid color-mix(in srgb, var(--scroll-edge) 35%, transparent);
  }

  .team:last-child {
    border-bottom: none;
  }

  .head {
    display: grid;
    grid-template-columns: 2.2rem 1.9rem 1fr 4.6rem;
    align-items: center;
    gap: 0.4rem;
  }

  .rank {
    align-self: start;
  }

  .columns .head {
    grid-template-columns: 3.5rem 3rem 1.9rem 1fr 7.5rem 7.5rem;
  }

  /* Totals alone, a past game's: no move or gain to give a column. */
  .columns.totals .head {
    grid-template-columns: 3.5rem 1.9rem 1fr 7.5rem;
  }

  .columns .rank {
    align-self: center;
  }

  .round {
    text-align: right;
  }

  .columns .members {
    padding-left: 7.4rem;
  }

  .columns.totals .members {
    padding-left: 4rem;
  }

  .logo {
    display: block;
    width: 1.9rem;
    height: 1.9rem;
  }

  .name {
    text-align: left;
    font-weight: 700;
    font-size: 1.1em;
    overflow-wrap: anywhere;
  }

  .points {
    text-align: right;
  }

  .number,
  .total {
    display: block;
  }

  .total {
    font-weight: 700;
  }

  .move,
  .gain {
    display: block;
    min-height: 1.1em;
    font-size: 0.8em;
    color: var(--muted);
  }

  .move::before {
    font-size: 0.8em;
    margin-right: 1px;
  }

  .up::before {
    content: '▲';
  }

  .down::before {
    content: '▼';
  }

  /* Laid out from the start, so the row does not grow when the gain appears. */
  .gain {
    visibility: hidden;
  }

  .gain.shown {
    visibility: visible;
    animation: appear 250ms ease-out;
  }

  .members {
    list-style: none;
    margin: 0.15rem 0 0;
    padding: 0 0 0 2.6rem;
    font-size: 0.9em;
  }

  .members li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.1rem 0.25rem;
  }

  .members li.you {
    background: color-mix(in srgb, var(--scroll-paper), white 30%);
  }

  .who {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .who > :global(:first-child) {
    flex: none;
  }

  /* "(you)" goes whole: the name may wrap, the note never splits. */
  .note {
    white-space: nowrap;
    color: var(--muted);
  }

  .member-points {
    flex: none;
    color: var(--muted);
  }

  .arriving > li {
    animation: arrive 350ms ease-out both;
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .arriving > li,
    .gain.shown {
      animation: none;
    }
  }
</style>
