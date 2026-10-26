<script lang="ts">
  /**
   * Who is at the table (section 9 of ideas/design.md): two halves with their counts, a
   * question's Answered over Still thinking, or the lobby's and splash's Ready over Not
   * ready yet, each by team in a team game, and the TV apart at the foot. Pets four
   * abreast, the name under each.
   *
   * `single` lists everyone under one heading, for a question nobody can answer.
   * `manage` turns the pets it accepts into buttons: the lobby host's kick and promote.
   */
  import type { Snippet } from 'svelte'

  import type { PlayerView } from '../lib/protocol'
  import type { TableGroups, TeamRow } from '../lib/tableGroups'
  import { TEAMS } from '../lib/teams'
  import Icon from './Icon.svelte'
  import TablePet from './TablePet.svelte'
  import TeamLogo from './TeamLogo.svelte'

  let {
    groups,
    youId,
    labels,
    single = null,
    statusOf = (player) => (player.connected ? '' : 'away'),
    manage = null,
    head,
    children,
  }: {
    groups: TableGroups
    youId: string | null
    /** The upper half's heading and the lower's. */
    labels: readonly [string, string]
    single?: string | null
    statusOf?: (player: PlayerView) => string
    manage?: {
      can: (player: PlayerView) => boolean
      label: (player: PlayerView) => string
      open: (player: PlayerView) => void
    } | null
    /** What sits above the halves: the lobby's team picker. */
    head?: Snippet
    /** What sits at the panel's foot, under the TV: the lobby's buttons. */
    children?: Snippet
  } = $props()

  const teamGame = $derived(groups.upperTeams.length + groups.lowerTeams.length > 0)
  const everyone = $derived([...groups.upper, ...groups.lower])

  function teamName(row: TeamRow): string {
    return row.team === null ? 'No team' : (TEAMS.find((t) => t.id === row.team)?.name ?? row.team)
  }
</script>

{#snippet pets(list: PlayerView[], label: string, state: string)}
  <ul class="pets" aria-label={label}>
    {#each list as player (player.id)}
      {@const status = statusOf(player)}
      <li>
        {#if manage !== null && manage.can(player)}
          <button
            type="button"
            class="tile"
            aria-label="{player.display_name}, {player.connected ? '' : 'away, '}{player.role ===
            'tv'
              ? 'TV'
              : state}: {manage.label(player)}"
            onclick={() => manage?.open(player)}
          >
            <TablePet {player} you={player.id === youId} {status} />
            <span class="more"><Icon name="more" /></span>
          </button>
        {:else}
          <TablePet {player} you={player.id === youId} {status} />
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet half(label: string, list: PlayerView[], rows: TeamRow[], later: boolean)}
  <section class="group" class:later>
    <h3>
      <span>{label}</span>
      <span class="count">{list.length}</span>
    </h3>
    {#if list.length === 0}
      <p class="empty">Nobody</p>
    {:else if teamGame}
      {#each rows as row (row.team)}
        <div class="team">
          <h4 data-team={row.team}>
            {#if row.team !== null}<span class="logo"><TeamLogo team={row.team} /></span>{/if}
            <span class="team-name">{teamName(row)}</span>
            <span class="count">{row.players.length}</span>
          </h4>
          {@render pets(row.players, `${label}, ${teamName(row)}`, label.toLowerCase())}
        </div>
      {/each}
    {:else}
      {@render pets(list, label, label.toLowerCase())}
    {/if}
  </section>
{/snippet}

<div class="panel table-panel" role="group" aria-label="At the table">
  {@render head?.()}
  {#if single !== null}
    {@render half(single, everyone, [...groups.upperTeams, ...groups.lowerTeams], false)}
  {:else}
    {@render half(labels[0], groups.upper, groups.upperTeams, false)}
    {@render half(labels[1], groups.lower, groups.lowerTeams, true)}
  {/if}
  {#if groups.tv !== null}
    <section class="group later">
      <h3><span>TV</span></h3>
      {@render pets([groups.tv], 'TV', 'TV')}
    </section>
  {/if}
  {@render children?.()}
</div>

<style>
  /* Narrower than a panel's own padding, so three names fit abreast in the 300px column. */
  .table-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0;
    padding: calc(1rem - var(--border-give));
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .later {
    padding-top: 0.75rem;
    border-top: 1px dashed var(--line);
  }

  h3,
  h4 {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.875rem;
    font-weight: 650;
    color: var(--muted);
  }

  h3 > :first-child,
  .team-name {
    flex: 1;
  }

  h4 {
    font-size: 0.8rem;
  }

  .logo {
    display: inline-flex;
    width: 1.1rem;
    height: 1.1rem;
  }

  .count {
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
  }

  .team {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .pets {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pets li {
    min-width: 0;
  }

  .tile {
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0.15rem 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    color: inherit;
    font: inherit;
  }

  .more {
    position: absolute;
    top: 0;
    right: 0.1rem;
    display: inline-flex;
    width: 1rem;
    height: 1rem;
    color: var(--muted);
  }

  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted);
  }
</style>
