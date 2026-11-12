<script lang="ts">
  /**
   * The waiting room: who is here, and — for an admin — the controls that change that.
   *
   * It is a stage like the splash's: Home's hero, the selfhoster's picture for the theme
   * (Broav, the inn's boar, here), or else the Wise Old Man, says the lobby line in the
   * bubble above a scroll that holds the code and the invite link. Under it a card per
   * round (`RoundCards`), and How to play; the players sit in the table panel, Ready over
   * Not ready yet, as on the splash, with join requests, the teams, I'm ready and Start.
   *
   * Admin controls are shown from `you.role`, which comes from the server's snapshot.
   * That is a convenience, not a check: the server decides per message (section 7
   * step 7), so a player who forges the flag gets `not_admin` back and nothing else. An
   * admin taps a pet for the menu `lib/playerMenu.ts` builds. The TV watches: its pet wears
   * a screen and sits apart under "TV", and its own lobby has no ready.
   *
   * The ready check is the splash's panel, with names (section 9 of ideas/design.md): the
   * host needs to know *who* is missing before pressing Start, because the answer is
   * usually somebody at the bar, and a name is something you can shout. Start is the plain
   * button once the room reaches the same threshold a splash uses; short of it, it is
   * "Start anyway", which asks first. In a team game (`LobbyTeams`) each half lists its
   * players by god, the teamless under "No team"; Ready waits for a team, and Start for
   * everyone to have one, in two teams or more (section 7 of ideas/architecture.md); each
   * says why. Below scale 1 the full-screen switch is offered with a line saying why.
   *
   * The sheet's code row is the code alone in the large face, with "Copy invite link" in the
   * row's top-right corner, or under the code where a phone leaves no room. The link itself
   * is never drawn. It says "Link copied" or "Couldn't copy" for a moment. An invite-only
   * room's link carries its key, which only admins are sent, and the key is never drawn,
   * because lobbies get streamed. The refresh button makes a new key, which is also the room
   * lock: a key nobody else has yet lets nobody in. Somebody without the link can still
   * ask; they wait on Join until a host lets them in or turns them away here, with no
   * confirm, since either can be put right by Kick or by asking again.
   */
  import { onMount } from 'svelte'

  import { SETTLED, SPLASH_TYPE_FROM_MS, interludeFor, reducedMotion } from '../lib/interlude'
  import { heroFor, speakerFor } from '../lib/hero'
  import { inviteLink } from '../lib/invite'
  import { roomShown } from '../lib/roomFit'
  import { namesOf, roomLength, statusOf, tableStatus, teamsBlockStart } from '../lib/lobbyLines'
  import { petOf } from '../lib/pets'
  import { playerMenu, type Dialog } from '../lib/playerMenu'
  import type { JoinRequestView, PlayerView } from '../lib/protocol'
  import { playing, readyThreshold } from '../lib/ready'
  import { players, room, you } from '../lib/stores'
  import { watchTheme } from '../lib/theme'
  import { Seating } from '../lib/tableGroups'
  import { TEAMS, type TeamId } from '../lib/teams'
  import { Cooldown } from '../lib/cooldown.svelte'
  import { Typist, lettersOf } from '../lib/typing.svelte'
  import type { HostQuestion } from '../lib/customQuestions'
  import { createdRooms, getSession } from '../lib/session'
  import { tonightOf } from '../lib/gameSetup'
  import { TonightEdits } from '../lib/tonightEdits.svelte'
  import type { RoomSocket } from '../lib/ws'
  import AtTable from './AtTable.svelte'
  import JoinCode from './JoinCode.svelte'
  import Segmented from './Segmented.svelte'
  import TonightPanel from './TonightPanel.svelte'
  import ConfirmDialog, { type Question } from './ConfirmDialog.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import FullScreenSwitch from './FullScreenSwitch.svelte'
  import Switch from './Switch.svelte'
  import HowToPlay from './HowToPlay.svelte'
  import Icon from './Icon.svelte'
  import LobbyTeams from './LobbyTeams.svelte'
  import Pet from './Pet.svelte'
  import RosterPet from './RosterPet.svelte'
  import RoundCards from './RoundCards.svelte'
  import Said from './stage/Said.svelte'
  import Stage from './stage/Stage.svelte'
  import TablePanel from './TablePanel.svelte'
  import TeamLogo from './TeamLogo.svelte'
  import Typed from './stage/Typed.svelte'

  let { socket }: { socket: RoomSocket } = $props()

  let theme = $state('')
  const heroArt = $derived(heroFor(theme))
  onMount(() => watchTheme((current) => (theme = current)))

  const GREETING = 'Pull up a stool and share the code. We start once the table is ready.'

  const typist = new Typist(
    () => [lettersOf(GREETING)],
    reducedMotion()
      ? SETTLED
      : interludeFor(Infinity, [lettersOf(GREETING)], SPLASH_TYPE_FROM_MS, SPLASH_TYPE_FROM_MS),
    Date.now(),
  )

  const PLAY_AS = [
    { value: false, label: 'Free for all' },
    { value: true, label: 'Teams' },
  ]
  const FIRST_TEAMS: TeamId[] = ['saradomin', 'zamorak']

  const tonight = new TonightEdits((next) =>
    socket.send({ t: 'set_settings', settings: { ...next, hide_rounds: secret } }),
  )

  const isAdmin = $derived($you?.role === 'admin')
  const isTV = $derived($you?.role === 'tv')
  const admins = $derived($players.filter((p) => p.role === 'admin').length)
  const settings = $derived($room?.settings ?? null)
  const teamIds = $derived(settings?.teams ?? [])
  const teamGame = $derived(teamIds.length > 0)
  const roomTeams = $derived(TEAMS.filter((t) => teamIds.includes(t.id)))
  const yourTeam = $derived($players.find((p) => p.id === $you?.id)?.team ?? null)
  const teamless = $derived(teamGame ? playing($players).filter((p) => p.team === null) : [])
  const code = $derived($room?.code ?? '')
  /** Only the browser that made the room holds the question bank it was made with. */
  const creator = $derived(createdRooms().includes(code))
  const link = $derived(inviteLink(location.origin, code, $room?.key))
  /** Only a host is sent the key, so only a host's lobby knows the room is invite-only. */
  const inviteOnly = $derived($room?.key !== undefined)
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
  /** Why the host cannot start tonight's game yet, in words, or null when they can. */
  const startBlock = $derived(
    rounds === 0
      ? 'Pick at least one round to start.'
      : (tonight.block ?? (teamGame ? teamsBlockStart($players, $you?.id ?? null) : null)),
  )
  const canStart = $derived(
    isAdmin && $room?.status === 'lobby' && $players.length > 0 && startBlock === null,
  )
  // Built here rather than in the markup, where Svelte would trim the spaces around the dots.
  const length = $derived($room === null || settings === null ? '' : roomLength($room, rounds))
  /** The room is drawn smaller than it is laid out: a short window. */
  const squeezed = $derived($roomShown !== null && $roomShown.fit.scale < 1)
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
  /** Taps still wanted before a start needs no "anyway": a count, never a name. */
  const short = $derived(Math.max(0, readyThreshold(present.length) - presentReady))
  const needTeam = $derived(teamGame && !isTV && yourTeam === null && !youReady)
  /** Who is not ready yet, in join order — the host included, as "you". */
  const waitingOn = $derived(counted.filter((p) => p.ready !== true))

  const seating = new Seating()
  const seated = $derived(
    seating.seat($players, $you?.id ?? null, (p) => p.ready === true, 'lobby', teamIds),
  )

  let copyResult = $state<'copied' | 'failed' | null>(null)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  /** Put the invite link on the clipboard, and say so, or say it was refused. */
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link)
      copyResult = 'copied'
    } catch {
      copyResult = 'failed'
    }
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copyResult = null), 2000)
  }

  /** The question the host is being asked, and what a yes does. */
  let asking = $state<Question | null>(null)

  const readyHold = new Cooldown()

  function toggleReady(): void {
    if (socket.send({ t: 'ready', ready: !youReady })) readyHold.start()
  }

  function questionsTicked(questions: HostQuestion[]): void {
    const session = getSession(code)
    if (creator && session !== null) tonight.upload(code, session, questions)
  }

  function swapTeams(on: boolean): void {
    socket.send({ t: 'set_teams', teams: on ? FIRST_TEAMS : [] })
  }

  /** Start, asking first when the room is short of its threshold: the host's override. */
  function start(): void {
    tonight.flush()
    if (enoughReady) {
      socket.send({ t: 'start_game' })
      return
    }
    asking = {
      message: `Start anyway? Still waiting on ${namesOf(waitingOn, $you?.id ?? null)}.`,
      label: 'Start anyway',
      act: () => socket.send({ t: 'start_game' }),
    }
  }

  const menuOf = (player: PlayerView) => playerMenu(player, $you, roomTeams, admins)
  const taps = {
    can: (player: PlayerView) => menuOf(player) !== null,
    label: (player: PlayerView) => menuOf(player)?.hint ?? '',
    open: (player: PlayerView) => ask(menuOf(player)),
  }

  /** Put up a dialog from a player's menu, or make its one choice when it asks nothing. */
  function ask(dialog: Dialog | null): void {
    const [first, ...rest] = (dialog?.choices ?? []).map((choice) => ({
      label: choice.label,
      act: () => {
        if (choice.send !== undefined) socket.send(choice.send)
        if (choice.then !== undefined) ask(choice.then)
        else asking = null
      },
    }))
    if (dialog === null || first === undefined) return
    if (dialog.message === null) first.act()
    else asking = { message: dialog.message, label: first.label, act: first.act, also: rest }
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
      {@const status = statusOf(player, $you?.id ?? null)}
      {@const menu = menuOf(player)}
      <li class:editing={player.editing === true}>
        {#if menu !== null}
          <button
            type="button"
            class="tile"
            aria-label="{player.display_name}, {player.connected ? '' : 'away, '}{player.role ===
            'tv'
              ? 'TV'
              : player.ready === true
                ? 'ready'
                : 'not ready'}: {menu.hint}"
            onclick={() => ask(menu)}
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

{#if isTV}
  <section class="lobby">
    <Stage host="wise_old_man" hero={heroArt} tv wide>
      {#snippet paper()}
        <div class="tv-lobby">
          <div class="tv-join">
            <h1>Join on your phone</h1>
            <p class="tv-code">{code}</p>
            <p class="tv-link">{link.replace(/^https?:\/\//, '')}</p>
            {#if settings !== null}<p class="count">{length}</p>{/if}
            <p class="foot">
              {short === 0
                ? 'Waiting for the host to start…'
                : `Waiting for ${short} more to be ready.`}
            </p>
          </div>
          <div class="tv-table">
            <h2>At the table · {counted.length}</h2>
            {#if teamGame}
              {#each roomTeams as god (god.id)}
                {@const members = $players.filter((p) => p.team === god.id)}
                <section class="team" data-team={god.id}>
                  <h3 class="team-head">
                    <span class="logo"><TeamLogo team={god.id} /></span>
                    <span class="team-name">{god.name}</span>
                  </h3>
                  {@render roster(members, god.name)}
                </section>
              {/each}
              {#if teamless.length > 0}
                <section class="team">
                  <h3 class="no-team">No team</h3>
                  {@render roster(teamless, 'No team')}
                </section>
              {/if}
            {:else}
              {@render roster(counted, `Players, ${readyCount} of ${counted.length} ready`)}
            {/if}
          </div>
        </div>
      {/snippet}
    </Stage>
  </section>
{:else}
  <section class="lobby">
    <Stage host="wise_old_man" hero={heroArt} bubble="on">
      {#snippet said()}
        <Said name={speakerFor(heroArt)} line={greeting} />
      {/snippet}
      {#snippet paper()}
        <JoinCode {code} lead="Your friends join with this code">
          <button type="button" onclick={copy}>
            <Icon name="copy" />
            {copyResult === 'copied'
              ? 'Link copied'
              : copyResult === 'failed'
                ? "Couldn't copy"
                : 'Copy invite link'}
          </button>
          {#if isAdmin && inviteOnly}
            <button type="button" class="glyph" aria-label="New link" onclick={rotateKey}>
              <Icon name="refresh" />
            </button>
          {/if}
        </JoinCode>
      {/snippet}
      {#if settings !== null && !isAdmin}
        <section class="panel board" aria-labelledby="tonight">
          <div class="board-line">
            <h2 id="tonight">Tonight's rounds</h2>
            <p class="aside">{length}</p>
          </div>
          {#if rounds === 0}
            <p class="empty">The rounds show up here as the host picks them.</p>
          {/if}
          <RoundCards modes={settings.modes} {secret} {rounds} />
          {#if secret}
            <p class="aside">
              Tonight's rounds are a surprise. Each one is revealed when it starts.
            </p>
          {:else if rounds > 1}
            <p class="aside">Listed A–Z, not in the order they play.</p>
          {/if}
          <div class="board-line">
            <button
              type="button"
              class="toggle"
              aria-haspopup="dialog"
              onclick={() => (showHowTo = true)}
            >
              How to play
            </button>
            <p class="aside">Quicker and correct answers score more.</p>
          </div>
        </section>
      {/if}
      <AtTable>
        <TablePanel
          groups={seated}
          youId={$you?.id ?? null}
          labels={['Ready', 'Not ready yet']}
          statusOf={tableStatus}
          manage={isAdmin ? taps : null}
        >
          {#snippet head()}
            {#if isAdmin}
              <Segmented
                legend="How to play"
                hideLegend
                options={PLAY_AS}
                bind:value={() => teamGame, swapTeams}
              />
            {/if}
            {#if requests.length > 0}
              <section class="asking" aria-labelledby="asking">
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
                        <button type="button" onclick={() => decide(request, false)}
                          >Turn away</button
                        >
                      </span>
                    </li>
                  {/each}
                </ul>
              </section>
            {/if}
            {#if teamGame}
              <LobbyTeams {socket} {teamIds} {youReady} ask={(question) => (asking = question)} />
            {/if}
          {/snippet}
          <div class="ready">
            {#if !isTV}
              <Switch
                label="Ready"
                large
                tone="ok"
                checked={youReady}
                describedby={needTeam ? 'pick-first' : undefined}
                disabled={needTeam || readyHold.held}
                onclick={toggleReady}
              />
            {/if}
            <FullScreenSwitch short={squeezed} />
          </div>
          {#if needTeam}
            <p class="hint" id="pick-first">Pick a team first.</p>
          {/if}
          {#if isAdmin}
            {#if startBlock !== null}
              <p class="hint" id="start-blocked">{startBlock}</p>
            {/if}
            <button
              class="start"
              class:primary={enoughReady}
              type="button"
              disabled={!canStart}
              aria-describedby={startBlock !== null ? 'start-blocked' : undefined}
              onclick={start}
            >
              {enoughReady ? 'Start the game' : 'Start anyway'}
            </button>
          {:else}
            <p class="foot">Waiting for the host to start…</p>
          {/if}
        </TablePanel>
      </AtTable>
      {#if settings !== null && isAdmin}
        <TonightPanel
          settings={tonightOf(settings)}
          hidden={secret}
          own={creator}
          onchange={tonight.edited}
          onquestions={questionsTicked}
          onproblems={(_, start) => (tonight.block = start)}
        />
      {/if}
    </Stage>
  </section>
{/if}

{#snippet greeting()}
  <p><Typed line={GREETING} shown={typist.shown[0]} /></p>
{/snippet}

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
  /* The TV's: how to join on the left, large, and who is at the table on the right. */
  .tv-lobby {
    display: flex;
    gap: 2rem;
  }

  .tv-join {
    flex: 0 0 19rem;
    display: flex;
    flex-direction: column;
  }

  .tv-join h1 {
    font-family: inherit;
    font-size: 1.2rem;
    color: var(--muted);
  }

  .tv-join .foot {
    margin-top: auto;
    font-size: 1.1rem;
  }

  .tv-code {
    margin: 0.25rem 0 0;
    font-family: var(--font-display);
    font-size: 4.5rem;
    line-height: 1;
    letter-spacing: 0.06em;
  }

  .tv-link {
    margin: 0.5rem 0 1rem;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--accent);
    overflow-wrap: anywhere;
  }

  .tv-table {
    flex: 1;
    min-width: 0;
    padding-left: 2rem;
    border-left: var(--border-width) solid var(--line);
  }

  /* Pets the room can tell apart from the sofa. */
  .tv-table :global(.pets) {
    zoom: 1.6;
  }

  .tv-table h2 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }

  @media (orientation: portrait) {
    .tv-lobby {
      flex-direction: column;
    }

    .tv-join {
      flex: none;
    }

    .tv-table {
      padding: 1rem 0 0;
      border-left: 0;
      border-top: var(--border-width) solid var(--line);
    }
  }

  h1 {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: max(1.15rem, 1.5rem * var(--scroll-text, 1));
    line-height: 1.15;
  }

  .glyph {
    min-width: 44px;
    justify-content: center;
  }

  .count {
    margin: 0.4rem 0 0.2rem;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
  }

  .board {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0;
  }

  .board-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 1rem;
  }

  .board h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .board .toggle {
    --ink: var(--surface-ink);
    padding: 0;
    font-weight: 650;
  }

  .asking h2 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
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

  .foot {
    margin: 0.5rem 0 0;
    color: var(--muted);
    font-size: 0.9rem;
    font-style: italic;
  }

  .ready {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

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

  .team {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .team-head {
    display: flex;
    gap: 0.5rem;
  }

  .team-name {
    flex: 1;
  }

  .no-team {
    margin: 0;
    font-size: 1rem;
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
