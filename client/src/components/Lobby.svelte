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
  import { paceLabel } from '../lib/pace'
  import { petOf } from '../lib/pets'
  import type { JoinRequestView, PlayerView } from '../lib/protocol'
  import { readyThreshold } from '../lib/ready'
  import { players, room, you } from '../lib/stores'
  import { watchTheme } from '../lib/theme'
  import { Typist, lettersOf } from '../lib/typing.svelte'
  import type { RoomSocket } from '../lib/ws'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import FullScreenSwitch from './FullScreenSwitch.svelte'
  import Icon from './Icon.svelte'
  import Pet from './Pet.svelte'
  import Stage from './stage/Stage.svelte'
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
  const canStart = $derived(isAdmin && $room?.status === 'lobby' && $players.length > 0)
  const settings = $derived($room?.settings ?? null)
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
   * game starts, so it is what the lobby reads too.
   */
  const questions = $derived($room?.total ?? 0)
  // Built here rather than in the markup, where Svelte would trim the spaces around the dots.
  const length = $derived(
    settings === null
      ? ''
      : `${rounds}${secret ? ' secret' : ''} ${rounds === 1 ? 'round' : 'rounds'} · ` +
          `${questions} ${questions === 1 ? 'question' : 'questions'} · ${paceLabel(settings.pace)} pace`,
  )
  /**
   * The rounds A–Z by name, which is deliberately not the order they play in: what is
   * coming is the game's to reveal, one splash at a time, and the host arranged that
   * order (or handed it to `random`) on the way in.
   */
  const listed = $derived(
    [...(settings?.modes ?? [])].sort((a, b) =>
      modeLabel(a.mode).localeCompare(modeLabel(b.mode)),
    ),
  )
  let showRounds = $state(false)

  const youReady = $derived($players.some((p) => p.id === $you?.id && p.ready === true))
  const readyCount = $derived($players.filter((p) => p.ready === true).length)
  /**
   * Who counts: the players connected right now, which is who the splash will count too.
   * A player whose phone has locked is not someone the host can start without asking.
   */
  const present = $derived($players.filter((p) => p.connected))
  const presentReady = $derived(present.filter((p) => p.ready === true).length)
  const enoughReady = $derived(presentReady >= readyThreshold(present.length))
  /** Who is not ready yet, by name, in join order — the host included, as "you". */
  const waitingOn = $derived(
    $players
      .filter((p) => p.ready !== true)
      .map((p) => (p.id === $you?.id ? 'you' : p.display_name)),
  )
  const listFormat = new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' })

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
    also?: { label: string; act: () => void }
  } | null>(null)

  function toggleReady(): void {
    socket.send({ t: 'ready', ready: !youReady })
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

  function manage(player: PlayerView): void {
    asking = {
      message: `Kick ${player.display_name}, or make them a host?`,
      label: 'Kick',
      act: () => socket.send({ t: 'kick', player_id: player.id }),
      also: { label: 'Make host…', act: () => promote(player) },
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
        <span class="copied" role="status">{copied ? 'Link copied' : ''}</span>
      </div>
      {#if copyFailed}
        <p class="copy-failed" role="alert">Couldn't copy the link. Copy it from here:</p>
        <input class="link-field" type="text" readonly aria-label="Link for players" value={link} use:selectAll />
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
                <button type="button" class="primary" onclick={() => decide(request, true)}>Let in</button>
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
          onclick={toggleReady}
        >
          {youReady ? '✓ Ready — tap to take it back' : "✓ I'm ready"}
        </button>
        <FullScreenSwitch />
      </div>

      <ul class="pets" aria-label="Players, {readyCount} of {$players.length} ready">
        {#each $players as player (player.id)}
          {@const status = statusOf(player)}
          <li class:lit={player.ready === true} class:editing={player.editing === true}>
            {#snippet tile()}
              <Pet pet={petOf(player)} size={48} label="" />
              <span class="pet-name">{player.display_name}</span>
              {#if status !== ''}<span class="status">{status}</span>{/if}
              <span class="sr">{player.ready === true ? 'ready' : 'not ready'}</span>
            {/snippet}
            {#if isAdmin && player.role !== 'admin'}
              <button
                type="button"
                class="tile"
                aria-label="{player.display_name}, {player.ready === true
                  ? 'ready'
                  : 'not ready'}: kick or make host"
                onclick={() => manage(player)}
              >
                {@render tile()}
                <span class="more"><Icon name="more" /></span>
              </button>
            {:else}
              <div class="tile">{@render tile()}</div>
            {/if}
          </li>
        {/each}
      </ul>

      {#if isAdmin}
        <p class="waiting" aria-live="polite">
          {#if waitingOn.length === 0}
            Everyone is ready.
          {:else}
            Waiting on {listFormat.format(waitingOn)}.
          {/if}
        </p>
        <button class="start" class:primary={enoughReady} type="button" disabled={!canStart} onclick={start}>
          {enoughReady ? 'Start the game' : 'Start anyway'}
        </button>
      {/if}
    </div>
  </Stage>
</section>

{#if asking !== null}
  <ConfirmDialog
    message={asking.message}
    confirmLabel={asking.label}
    onConfirm={() => {
      asking?.act()
      asking = null
    }}
    onCancel={() => (asking = null)}
    also={asking.also ?? null}
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
     aloud across the room first and to tap second. */
  .code-row button {
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
    color: var(--muted);
  }

  button.tile {
    border-color: transparent;
    background: transparent;
  }

  /* The pet dims until the tap, as on the splash: opacity and not colour, so it reads the
     same in every theme, and the name dims by ink so it keeps its contrast. */
  .tile > :global(.pet) {
    opacity: 0.3;
    filter: grayscale(1);
    transition:
      opacity 200ms ease-out,
      filter 200ms ease-out;
  }

  .lit .tile {
    color: var(--ink);
  }

  .lit .tile > :global(.pet) {
    opacity: 1;
    filter: none;
  }

  /* Up to 24 characters, so two lines before it is cut off. */
  .pet-name {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    overflow-wrap: anywhere;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-size: 0.75rem;
    line-height: 1.2;
    text-align: center;
  }

  .status {
    font-size: 0.7rem;
    line-height: 1.2;
    color: var(--muted);
    text-align: center;
  }

  .editing .status {
    font-style: italic;
  }

  .more {
    position: absolute;
    top: 0.1rem;
    right: 0.4rem;
    color: var(--muted);
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

  @media (prefers-reduced-motion: reduce) {
    .tile > :global(.pet) {
      transition: none;
    }
  }
</style>
