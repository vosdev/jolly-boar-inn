<script lang="ts">
  /**
   * The waiting room: who is here, and — for an admin — the controls that change that.
   *
   * It is a stage like the splash's, kept short enough for a phone: Home's hero, the
   * selfhoster's picture for the theme (Broav, the inn's boar, here) or else the Wise Old
   * Man, stands beside a scroll that holds the room code and what the night
   * holds; the players sit under it as a grid of pets, as the splash will show them.
   *
   * Admin controls are shown from `you.role`, which comes from the server's snapshot.
   * That is a convenience, not a check: the server decides per message (section 7
   * step 7), so a player who forges the flag gets `not_admin` back and nothing else.
   *
   * The ready check is the splash's grid, with names (section 9 of ideas/design.md): the
   * host needs to know *who* is missing before pressing Start, because the answer is
   * usually somebody at the bar, and a name is something you can shout. Start is the plain
   * button once the room reaches the same threshold a splash uses; short of it, it is
   * "Start anyway", which asks first.
   *
   * An admin taps a pet to kick its player or make them a host. Choosing Kick there is its
   * confirmation, since a kicked player can join again; Make host asks once more, because
   * there is no demote and an admin cannot be kicked.
   *
   * A team game groups the pets under the room's gods, every god even with nobody on it yet,
   * since an empty team is one to join, and the teamless under "No team". Tapping a god
   * joins it; the server refuses that while ready, so the gods are not tappable then. Ready
   * waits for a team, and Start for everyone to have one, in two teams or more (section 7 of
   * ideas/architecture.md); each says why. The host moves a player from the same menu as
   * kick, an admin too, since admins cannot be kicked but can play for the wrong god.
   * The host also adds a god the room lacks and removes one, never below two; removing a
   * team with players asks first, since they go back to no team and lose their ready.
   *
   * The code copies the invite link. An invite-only room's link carries its key, which
   * only admins are sent, and the key is never drawn, because lobbies get streamed; only a
   * refused clipboard shows the link, so it can be copied by hand. The refresh button makes
   * a new key, which is also the room lock: a key nobody else has yet lets nobody in.
   * Somebody without the link can still ask; they wait on Join until a host lets them in or
   * turns them away here, with no confirm, since either can be put right by Kick or by
   * asking again.
   */
  import { onMount } from 'svelte'
  import { hero, heroes } from 'virtual:branding'

  import { SETTLED, SPLASH_TYPE_FROM_MS, interludeFor, reducedMotion } from '../lib/interlude'
  import { inviteLink } from '../lib/invite'
  import { modeLabel } from '../lib/modes'
  import { minutes } from '../lib/duration'
  import { difficultyLabel } from '../lib/difficulty'
  import { paceLabel } from '../lib/pace'
  import { petOf } from '../lib/pets'
  import type { JoinRequestView, PlayerView } from '../lib/protocol'
  import { playing, readyThreshold } from '../lib/ready'
  import { players, room, you } from '../lib/stores'
  import { watchTheme } from '../lib/theme'
  import { MIN_TEAMS, TEAMS, teamsWith, type TeamId } from '../lib/teams'
  import { Cooldown } from '../lib/cooldown.svelte'
  import { Typist, lettersOf } from '../lib/typing.svelte'
  import type { RoomSocket } from '../lib/ws'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import FullScreenSwitch from './FullScreenSwitch.svelte'
  import HowToPlay from './HowToPlay.svelte'
  import Icon from './Icon.svelte'
  import Pet from './Pet.svelte'
  import RosterPet from './RosterPet.svelte'
  import Stage from './stage/Stage.svelte'
  import TeamLogo from './TeamLogo.svelte'
  import Typed from './stage/Typed.svelte'

  let { socket }: { socket: RoomSocket } = $props()

  let theme = $state('')
  const heroArt = $derived(heroes[theme] ?? hero)
  onMount(() => watchTheme((current) => (theme = current)))

  const GREETING = '“Pull up a stool and share the code. We start once the table is ready.”'

  const typist = new Typist(
    () => [lettersOf(GREETING)],
    reducedMotion()
      ? SETTLED
      : interludeFor(Infinity, [lettersOf(GREETING)], SPLASH_TYPE_FROM_MS, SPLASH_TYPE_FROM_MS),
    Date.now(),
  )

  const isAdmin = $derived($you?.role === 'admin')
  const listFormat = new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' })
  const settings = $derived($room?.settings ?? null)
  const teamIds = $derived(settings?.teams ?? [])
  const teamGame = $derived(teamIds.length > 0)
  const roomTeams = $derived(TEAMS.filter((t) => teamIds.includes(t.id)))
  const yourTeam = $derived($players.find((p) => p.id === $you?.id)?.team ?? null)
  const teamless = $derived(teamGame ? $players.filter((p) => p.team === null) : [])
  const teamsWithPlayers = $derived(new Set($players.map((p) => p.team).filter((t) => t !== null)))
  /** Why the server would refuse Start in a team game, or null when it would not. */
  const teamsBlockStart = $derived(
    !teamGame
      ? null
      : teamless.length > 0
        ? `Waiting on ${listFormat.format(teamless.map((p) => (p.id === $you?.id ? 'you' : p.display_name)))} to pick a team.`
        : teamsWithPlayers.size < MIN_TEAMS
          ? 'Players are needed in two teams or more.'
          : null,
  )
  const canStart = $derived(
    isAdmin && $room?.status === 'lobby' && $players.length > 0 && teamsBlockStart === null,
  )
  const code = $derived($room?.code ?? '')
  const link = $derived(inviteLink(location.origin, code, $room?.key))
  /**
   * Surprise rounds, hidden from the host as well: a lobby on a shared screen or a stream
   * would give them away.
   */
  const secret = $derived(settings?.hide_rounds === true)
  /**
   * A mode is a round, so the modes picked are the rounds the room will play. A secret
   * room's `modes` holds only rounds that have started, so the server counts them.
   */
  const rounds = $derived(secret ? ($room?.rounds ?? 0) : (settings?.modes.length ?? 0))
  /**
   * Every question the room actually holds, which the server counted off the questions it
   * stored rather than off the settings. The two disagree whenever the plan and the
   * stored set do: a mode whose pack pool ran short gives a round briefer than it asked
   * for, and a room created before per-mode rounds carries settings that cannot describe
   * the questions it already has. `total` is what the progress counter reads once the
   * game starts. The lobby tells the random events apart, which a host would otherwise
   * read as the rounds coming out longer than they set.
   */
  const events = $derived($room?.events ?? 0)
  const questions = $derived(($room?.total ?? 0) - events)
  // Built here rather than in the markup, where Svelte would trim the spaces around the dots.
  const length = $derived(
    settings === null
      ? ''
      : `${rounds}${secret ? ' secret' : ''} ${rounds === 1 ? 'round' : 'rounds'} · ` +
          `${questions} ${questions === 1 ? 'question' : 'questions'} · ` +
          (events === 0 ? '' : `${events} random ${events === 1 ? 'event' : 'events'} · `) +
          `${paceLabel(settings.pace)} pace` +
          // Mixed is every question, the default, so only a narrowed room says so.
          (settings.difficulty === 'mixed'
            ? ''
            : ` · ${difficultyLabel(settings.difficulty)} questions`) +
          ` · ${minutes($room?.estimated_seconds ?? 0)}`,
  )
  /**
   * The rounds A–Z by name, which is deliberately not the order they play in: what is
   * coming is the game's to reveal, one splash at a time, and the host arranged that
   * order (or handed it to `random`) on the way in.
   */
  const listed = $derived(
    [...(settings?.modes ?? [])].sort((a, b) => modeLabel(a.mode).localeCompare(modeLabel(b.mode))),
  )
  let showRounds = $state(false)
  let showHowTo = $state(false)

  const youReady = $derived($players.some((p) => p.id === $you?.id && p.ready === true))
  const counted = $derived(playing($players))
  const readyCount = $derived(counted.filter((p) => p.ready === true).length)
  /**
   * Who counts: the players connected right now, which is who the splash will count too.
   * A player whose phone has locked is not someone the host can start without asking.
   */
  const present = $derived(counted.filter((p) => p.connected))
  const presentReady = $derived(present.filter((p) => p.ready === true).length)
  const enoughReady = $derived(presentReady >= readyThreshold(present.length))
  const needTeam = $derived(teamGame && yourTeam === null && !youReady)
  /** Who is not ready yet, by name, in join order — the host included, as "you". */
  const waitingOn = $derived(
    counted
      .filter((p) => p.ready !== true)
      .map((p) => (p.id === $you?.id ? 'you' : p.display_name)),
  )

  /** What the line under a pet's name says, if anything. */
  function statusOf(player: PlayerView): string {
    if (player.editing === true) return 'picking a name…'
    return [
      player.connected ? null : 'away',
      player.role === 'admin' ? 'host' : null,
      player.id === $you?.id ? 'you' : null,
    ]
      .filter((word) => word !== null)
      .join(' · ')
  }

  let copied = $state(false)
  let copyFailed = $state(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  /** Put the invite link on the clipboard, or show it to copy by hand where that is refused. */
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link)
      copyFailed = false
      copied = true
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => (copied = false), 2000)
    } catch {
      copied = false
      copyFailed = true
    }
  }

  function selectAll(field: HTMLInputElement): void {
    field.select()
  }

  /** The question the host is being asked, and what a yes does. */
  let asking = $state<{
    message: string
    label: string
    act: () => void
    also?: { label: string; act: () => void }[]
  } | null>(null)

  const readyHold = new Cooldown()
  const teamHold = new Cooldown()

  function toggleReady(): void {
    if (socket.send({ t: 'ready', ready: !youReady })) readyHold.start()
  }

  /** Start, asking first when the room is short of its threshold: the host's override. */
  function start(): void {
    if (enoughReady) {
      socket.send({ t: 'start_game' })
      return
    }
    asking = {
      message: `Start anyway? Still waiting on ${listFormat.format(waitingOn)}.`,
      label: 'Start anyway',
      act: () => socket.send({ t: 'start_game' }),
    }
  }

  function joinTeam(team: TeamId): void {
    if (!youReady && team !== yourTeam && socket.send({ t: 'set_team', team })) teamHold.start()
  }

  /** Whether an admin's tap on this player opens a menu: kick and promote, or a move. */
  function manageable(player: PlayerView): boolean {
    return isAdmin && player.id !== $you?.id && (player.role !== 'admin' || teamGame)
  }

  function menuOf(player: PlayerView): string {
    if (player.role === 'admin') return 'move team'
    return teamGame ? 'kick, make host or move team' : 'kick or make host'
  }

  function manage(player: PlayerView): void {
    if (player.role === 'admin') {
      move(player)
      return
    }
    asking = {
      message: teamGame
        ? `Kick ${player.display_name}, make them a host, or move them to another team?`
        : `Kick ${player.display_name}, or make them a host?`,
      label: 'Kick',
      act: () => socket.send({ t: 'kick', player_id: player.id }),
      also: [
        { label: 'Make host…', act: () => promote(player) },
        ...(teamGame ? [{ label: 'Move team…', act: () => move(player) }] : []),
      ],
    }
  }

  function move(player: PlayerView): void {
    const [first, ...rest] = roomTeams
      .filter((t) => t.id !== player.team)
      .map((t) => ({
        label: t.name,
        act: () => {
          asking = null
          socket.send({ t: 'move_team', player_id: player.id, team: t.id })
        },
      }))
    if (first === undefined) return
    asking = {
      message: `Move ${player.display_name} to which team?`,
      label: first.label,
      act: first.act,
      also: rest,
    }
  }

  const canRemoveTeam = $derived(isAdmin && roomTeams.length > MIN_TEAMS)
  const missingTeams = $derived(isAdmin ? TEAMS.filter((t) => !teamIds.includes(t.id)) : [])

  function setTeams(id: TeamId, on: boolean): void {
    socket.send({ t: 'set_teams', teams: teamsWith(teamIds, id, on) })
  }

  function addTeam(): void {
    const [first, ...rest] = missingTeams.map((t) => ({
      label: t.name,
      // The dialog's other choices run without closing it, so each closes it itself.
      act: () => {
        asking = null
        setTeams(t.id, true)
      },
    }))
    if (first === undefined) return
    asking = { message: 'Add which team?', label: first.label, act: first.act, also: rest }
  }

  function removeTeam(id: TeamId, name: string, members: number): void {
    if (members === 0) {
      setTeams(id, false)
      return
    }
    const who = members === 1 ? 'Its player goes' : `Its ${members} players go`
    asking = {
      message: `Remove ${name}? ${who} back to no team and must ready up again.`,
      label: 'Remove',
      act: () => setTeams(id, false),
    }
  }

  function promote(player: PlayerView): void {
    asking = {
      message: `Make ${player.display_name} a host? This can't be undone.`,
      label: 'Make host',
      act: () => socket.send({ t: 'promote', player_id: player.id }),
    }
  }

  function rotateKey(): void {
    asking = {
      message: 'Make a new link? The current one stops working. Players already here stay.',
      label: 'New link',
      act: () => socket.send({ t: 'rotate_key' }),
    }
  }

  const requests = $derived(isAdmin ? ($room?.requests ?? []) : [])

  function decide(request: JoinRequestView, accept: boolean): void {
    socket.send({ t: 'decide_request', request_id: request.id, accept })
  }
</script>

{#snippet roster(list: PlayerView[], label: string)}
  <ul class="pets" aria-label={label}>
    {#each list as player (player.id)}
      {@const status = statusOf(player)}
      <li class:editing={player.editing === true}>
        {#if manageable(player)}
          <button
            type="button"
            class="tile"
            aria-label="{player.display_name}, {player.connected ? '' : 'away, '}{player.ready ===
            true
              ? 'ready'
              : 'not ready'}: {menuOf(player)}"
            onclick={() => manage(player)}
          >
            <RosterPet {player} {status} />
            <span class="more"><Icon name="more" /></span>
          </button>
        {:else}
          <div class="tile"><RosterPet {player} {status} /></div>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<ErrorBanner />

<section class="lobby">
  <Stage host="wise_old_man" hero={heroArt}>
    {#snippet paper()}
      <h1>Lobby</h1>
      <p class="greeting"><Typed line={GREETING} shown={typist.shown[0]} /></p>
      <div class="code-row">
        <button
          type="button"
          class="code"
          style:--chars={code.length}
          aria-label="{code}, copy the invite link"
          onclick={copy}
        >
          <span>{code}</span>
          <Icon name="copy" />
        </button>
        {#if isAdmin && $room?.key !== undefined}
          <button type="button" class="glyph" aria-label="New link" onclick={rotateKey}>
            <Icon name="refresh" />
          </button>
        {/if}
        <span class="copied">{copied ? 'Link copied' : ''}</span>
      </div>
      {#if copyFailed}
        <p class="copy-failed">Couldn't copy the link. Copy it from here:</p>
        <input
          class="link-field"
          type="text"
          readonly
          aria-label="Link for players"
          value={link}
          use:selectAll
        />
      {/if}
      {#if settings !== null}
        <p class="count">{length}</p>
        {#if secret}
          <p class="aside">Tonight's rounds are a surprise. Each one is revealed when it starts.</p>
        {:else}
          <button
            type="button"
            class="toggle"
            aria-expanded={showRounds}
            aria-controls="rounds"
            onclick={() => (showRounds = !showRounds)}
          >
            {showRounds ? 'Hide the rounds' : 'Show the rounds'}
          </button>
          {#if showRounds}
            <ul class="modes" id="rounds">
              {#each listed as round (round.mode)}
                <li>
                  <span>{modeLabel(round.mode)}</span>
                  <span class="aside">
                    {round.questions}
                    {round.questions === 1 ? 'question' : 'questions'}
                  </span>
                </li>
              {/each}
            </ul>
            {#if rounds > 1}
              <p class="aside">Listed A–Z, not in the order they play.</p>
            {/if}
          {/if}
        {/if}
        <button
          type="button"
          class="toggle"
          aria-haspopup="dialog"
          onclick={() => (showHowTo = true)}
        >
          How to play
        </button>
      {/if}
      {#if !isAdmin}
        <p class="foot">Waiting for the host to start…</p>
      {/if}
    {/snippet}

    {#if requests.length > 0}
      <section class="panel" aria-labelledby="asking">
        <h2 id="asking">Asking to join ({requests.length})</h2>
        <ul class="requests">
          {#each requests as request (request.id)}
            <li>
              <span class="face"><Pet pet={petOf(request)} size={40} label="" /></span>
              <span class="name">{request.display_name}</span>
              <span class="decide">
                <button type="button" class="primary" onclick={() => decide(request, true)}
                  >Let in</button
                >
                <button type="button" onclick={() => decide(request, false)}>Turn away</button>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="panel board">
      <div class="ready">
        <button
          type="button"
          class:primary={!youReady}
          aria-pressed={youReady}
          aria-describedby={needTeam ? 'pick-first' : undefined}
          disabled={needTeam || readyHold.held}
          onclick={toggleReady}
        >
          {youReady ? '✓ Ready — tap to take it back' : "✓ I'm ready"}
        </button>
        <FullScreenSwitch />
      </div>
      {#if needTeam}
        <p class="hint" id="pick-first">Pick a team first.</p>
      {/if}

      {#if teamGame}
        <div class="teams" role="group" aria-label="Teams, {readyCount} of {counted.length} ready">
          {#if youReady}
            <p class="hint">Take your ready back to change team.</p>
          {/if}
          {#each roomTeams as god (god.id)}
            {@const members = $players.filter((p) => p.team === god.id)}
            <section class="team" data-team={god.id}>
              <div class="team-head">
                <button
                  type="button"
                  class="join"
                  aria-label="{god.name}, {members.length} {members.length === 1
                    ? 'player'
                    : 'players'}"
                  aria-pressed={yourTeam === god.id}
                  disabled={youReady || teamHold.held}
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
              {#if members.length === 0}
                <p class="aside empty">Nobody yet</p>
              {:else}
                {@render roster(members, god.name)}
              {/if}
            </section>
          {/each}
          {#if missingTeams.length > 0}
            <button type="button" class="add-team" onclick={addTeam}>Add a team…</button>
          {/if}
          {#if teamless.length > 0}
            <section class="team">
              <h3 class="no-team">No team</h3>
              {@render roster(teamless, 'No team')}
            </section>
          {/if}
        </div>
      {:else}
        {@render roster($players, `Players, ${readyCount} of ${counted.length} ready`)}
      {/if}

      {#if isAdmin}
        <p class="waiting">
          {#if waitingOn.length === 0}
            Everyone is ready.
          {:else}
            Waiting on {listFormat.format(waitingOn)}.
          {/if}
        </p>
        {#if teamsBlockStart !== null}
          <p class="hint" id="start-blocked">{teamsBlockStart}</p>
        {/if}
        <button
          class="start"
          class:primary={enoughReady}
          type="button"
          disabled={!canStart}
          aria-describedby={teamsBlockStart !== null ? 'start-blocked' : undefined}
          onclick={start}
        >
          {enoughReady ? 'Start the game' : 'Start anyway'}
        </button>
      {/if}
    </div>
  </Stage>
</section>

{#if showHowTo && settings !== null}
  <HowToPlay room={{ settings, total: $room?.total ?? 0 }} onclose={() => (showHowTo = false)} />
{/if}

{#if asking !== null}
  <ConfirmDialog
    message={asking.message}
    confirmLabel={asking.label}
    onConfirm={() => {
      asking?.act()
      asking = null
    }}
    onCancel={() => (asking = null)}
    also={asking.also ?? []}
  />
{/if}

<style>
  h1 {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: max(1.15rem, 1.5rem * var(--scroll-text, 1));
    line-height: 1.15;
  }

  .greeting {
    margin: 0 0 0.5rem;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
    font-style: italic;
  }

  .code-row {
    container-type: inline-size;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 0.25rem;
  }

  /* The code is the sheet's ink, not a gem or a panel's button: it is something to read
     aloud across the room first and to tap second. A button takes the surface's ink back
     (app.css), which on a dark theme is light, so the sheet's is named here. */
  .code-row button {
    --ink: var(--scroll-ink);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0 0.35rem;
    border-color: transparent;
    background: transparent;
    color: var(--ink);
  }

  /* A code is words run together, up to 34 letters. The display face is
     about 1em a letter, so the size shrinks to keep the code on one line beside its icon,
     and only a code too long even at the floor breaks. */
  .code {
    margin-left: -0.35rem;
    font-family: var(--font-display);
    font-size: clamp(
      0.95rem,
      (100cqi - 2.5rem) / var(--chars, 12),
      max(1.4rem, 1.8rem * var(--scroll-text, 1))
    );
    letter-spacing: 0.06em;
  }

  .code :global(.icon) {
    font-size: 1rem;
  }

  .glyph {
    min-width: 44px;
    justify-content: center;
  }

  .copied {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .copy-failed {
    margin: 0.25rem 0;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .link-field {
    width: 100%;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.85rem;
  }

  .count {
    margin: 0.4rem 0 0.2rem;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
  }

  .aside {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .toggle {
    --ink: var(--scroll-ink);
    padding: 0.35rem 0;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .modes {
    margin: 0 0 0.3rem;
    padding: 0;
    list-style: none;
  }

  .modes li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.15rem 0;
  }

  .modes .aside {
    flex: none;
  }

  .foot {
    margin: 0.5rem 0 0;
    color: var(--muted);
    font-size: 0.9rem;
    font-style: italic;
  }

  .board {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0;
  }

  .ready {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .ready button,
  .start {
    min-height: 44px;
  }

  .start {
    align-self: flex-start;
  }

  .pets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    width: 4.75rem;
    height: 100%;
    padding: 0.25rem 0.1rem;
  }

  button.tile {
    border-color: transparent;
    background: transparent;
  }

  .more {
    position: absolute;
    top: 0.1rem;
    right: 0.4rem;
    color: var(--muted);
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

  .team {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
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

  .no-team {
    margin: 0;
    font-size: 1rem;
  }

  .empty {
    padding-left: 0.6rem;
  }

  .waiting {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .requests {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .requests li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.4rem 0;
  }

  .face {
    display: inline-flex;
  }

  .requests .name {
    flex: 1;
    min-width: 6rem;
    overflow-wrap: anywhere;
  }

  .decide {
    display: flex;
    gap: 0.75rem;
  }

  .decide button {
    min-height: 44px;
  }
</style>
