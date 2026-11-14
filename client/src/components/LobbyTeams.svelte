<script lang="ts">
  /**
   * A team game's bar above the lobby's table: a button per god the room has, every god
   * even with nobody on it yet, since an empty team is one to join. Tapping a god joins
   * it; the server refuses that while ready, so the gods are not tappable then.
   *
   * The host also adds a god the room lacks and removes one, never below two; removing a
   * team with players asks first, through the lobby's dialog, since they go back to no team
   * and lose their ready.
   */
  import { Cooldown } from '../lib/cooldown.svelte'
  import { players, you } from '../lib/stores'
  import { MIN_TEAMS, TEAMS, teamsWith, type TeamId } from '../lib/teams'
  import type { RoomSocket } from '../lib/ws'
  import type { Question } from './ConfirmDialog.svelte'
  import Icon from './Icon.svelte'
  import TeamLogo from './TeamLogo.svelte'

  let {
    socket,
    teamIds,
    youReady,
    ask,
  }: {
    socket: RoomSocket
    teamIds: TeamId[]
    youReady: boolean
    ask: (question: Question | null) => void
  } = $props()

  const isAdmin = $derived($you?.role === 'admin')
  const isTV = $derived($you?.role === 'tv')
  const roomTeams = $derived(TEAMS.filter((t) => teamIds.includes(t.id)))
  const yourTeam = $derived($players.find((p) => p.id === $you?.id)?.team ?? null)
  const canRemoveTeam = $derived(isAdmin && roomTeams.length > MIN_TEAMS)
  const missingTeams = $derived(isAdmin ? TEAMS.filter((t) => !teamIds.includes(t.id)) : [])

  const teamHold = new Cooldown()

  function joinTeam(team: TeamId): void {
    if (!youReady && team !== yourTeam && socket.send({ t: 'set_team', team })) teamHold.start()
  }

  function setTeams(id: TeamId, on: boolean): void {
    socket.send({ t: 'set_teams', teams: teamsWith(teamIds, id, on) })
  }

  function addTeam(): void {
    const [first, ...rest] = missingTeams.map((t) => ({
      label: t.name,
      // The dialog's other choices run without closing it, so each closes it itself.
      act: () => {
        ask(null)
        setTeams(t.id, true)
      },
    }))
    if (first === undefined) return
    ask({ message: 'Add which team?', label: first.label, act: first.act, also: rest })
  }

  function removeTeam(id: TeamId, name: string, members: number): void {
    if (members === 0) {
      setTeams(id, false)
      return
    }
    const who = members === 1 ? 'Its player goes' : `Its ${members} players go`
    ask({
      message: `Remove ${name}? ${who} back to no team and must ready up again.`,
      label: 'Remove',
      act: () => setTeams(id, false),
    })
  }
</script>

<div class="teams" role="group" aria-label="Teams">
  {#each roomTeams as god (god.id)}
    {@const members = $players.filter((p) => p.team === god.id)}
    <div class="team-head" data-team={god.id}>
      <button
        type="button"
        class="join"
        aria-label="{god.name}, {members.length} {members.length === 1 ? 'player' : 'players'}"
        aria-pressed={yourTeam === god.id}
        disabled={youReady || isTV || teamHold.held}
        onclick={() => joinTeam(god.id)}
      >
        <span class="logo"><TeamLogo team={god.id} /></span>
        <span class="team-name">{god.name}</span>
        <span class="aside">{members.length}</span>
      </button>
      {#if canRemoveTeam}
        <button
          type="button"
          class="glyph remove"
          aria-label="Remove {god.name}"
          onclick={() => removeTeam(god.id, god.name, members.length)}
        >
          <Icon name="trash" />
        </button>
      {/if}
    </div>
  {/each}
  {#if missingTeams.length > 0}
    <button type="button" class="add-team" onclick={addTeam}>Add a team…</button>
  {/if}
  {#if youReady}
    <p class="hint">Unready first to switch teams.</p>
  {/if}
</div>

<style>
  .glyph {
    min-width: 44px;
    justify-content: center;
  }

  .aside {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .teams {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .team-head {
    display: flex;
    gap: 0.5rem;
  }

  .team-head .join {
    flex: 1;
    min-width: 0;
  }

  .add-team {
    align-self: flex-start;
    min-height: 44px;
  }

  /* The god's colour sits on its edge, never behind the words, so the name reads in the
     panel's own ink whatever the theme. */
  .join {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 0.6rem;
    border-color: var(--team-trim);
    border-left-width: 0.35rem;
    background: var(--panel-raised);
    color: var(--ink);
    font-weight: 600;
    text-align: left;
  }

  .join[aria-pressed='true'] {
    box-shadow: inset 0 0 0 1px var(--team-trim);
  }

  .join .logo {
    flex: none;
    display: block;
    width: 1.6rem;
    height: 1.6rem;
  }

  .team-name {
    flex: 1;
  }

  .join[aria-pressed='true'] .team-name::after {
    content: ' · you';
    font-weight: 400;
    color: var(--muted);
  }
</style>
