<script lang="ts">
  /**
   * The waiting room: who is here, and — for an admin — the controls that change that.
   *
   * Admin controls are shown from `you.role`, which comes from the server's snapshot.
   * That is a convenience, not a check: the server decides per message (section 7
   * step 7), so a player who forges the flag gets `not_admin` back and nothing else.
   *
   * The ready check here is the named one (section 7.1 of ideas/design.md): the host
   * needs to know *who* is missing before pressing Start, because the answer is usually
   * somebody at the bar, and a name is something you can shout. The host is a player like
   * any other and taps too. Start is the plain button once the room reaches the same
   * threshold a splash uses; short of it, it is "Start anyway", which asks first. The
   * splash asks again with pets and their names.
   *
   * Promote asks first as well as Kick: there is no demote, and an admin cannot be kicked,
   * so one slip of the thumb would make a permanent co-host.
   *
   * An invite-only room's link carries its key, which only admins are sent, and shows it
   * as asterisks because lobbies get streamed. New link replaces the key. That is also the
   * room lock: a key nobody else has yet lets nobody in, so there is no separate one.
   * Somebody without the link can still ask; they wait on Join until a host lets them in or
   * turns them away here, with no confirm, since either can be put right by Kick or by
   * asking again.
   */
  import { modeLabel } from '../lib/modes'
  import { paceLabel } from '../lib/pace'
  import { petOf } from '../lib/pets'
  import { readyThreshold } from '../lib/ready'
  import type { JoinRequestView, PlayerView } from '../lib/protocol'
  import { players, room, you } from '../lib/stores'
  import type { RoomSocket } from '../lib/ws'
  import FullScreenSwitch from './FullScreenSwitch.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import { inviteLink, maskedLink } from '../lib/invite'
  import CopyLink from './CopyLink.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import Pet from './Pet.svelte'

  let { socket }: { socket: RoomSocket } = $props()

  const isAdmin = $derived($you?.role === 'admin')
  const canStart = $derived(isAdmin && $room?.status === 'lobby' && $players.length > 0)
  const settings = $derived($room?.settings ?? null)
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

  /** The question the host is being asked, and what a yes does. */
  let asking = $state<{ message: string; label: string; act: () => void } | null>(null)

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

  function kick(player: PlayerView): void {
    asking = {
      message: `Remove ${player.display_name} from the room?`,
      label: 'Kick',
      act: () => socket.send({ t: 'kick', player_id: player.id }),
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

  function promote(player: PlayerView): void {
    asking = {
      message: `Make ${player.display_name} a host? This can't be undone.`,
      label: 'Make host',
      act: () => socket.send({ t: 'promote', player_id: player.id }),
    }
  }
</script>

<ErrorBanner />

<section class="panel">
  <div class="spread">
    <div>
      <h1>Lobby</h1>
      <p class="code">{$room?.code ?? ''}</p>
    </div>
    {#if settings !== null}
      <p class="note">
        {rounds}{secret ? ' secret' : ''}
        {rounds === 1 ? 'round' : 'rounds'} · {questions}
        {questions === 1 ? 'question' : 'questions'} · {paceLabel(settings.pace)} pace
      </p>
    {/if}
  </div>
  <CopyLink
    id="join-link"
    label="Link for players"
    value={inviteLink(location.origin, $room?.code ?? '', $room?.key)}
    shown={maskedLink(location.origin, $room?.code ?? '', $room?.key)}
  />
  {#if isAdmin && $room?.key !== undefined}
    <button type="button" class="small" onclick={rotateKey}>New link</button>
  {/if}
</section>

{#if settings !== null}
  <section class="panel">
    <h2>Tonight's rounds</h2>
    {#if secret}
      <p class="note">Tonight's rounds are a surprise. Each one is revealed when it starts.</p>
    {:else}
      <ul class="modes">
        {#each listed as round (round.mode)}
          <li>
            <span class="name">{modeLabel(round.mode)}</span>
            <span class="note">
              {round.questions}
              {round.questions === 1 ? 'question' : 'questions'}
            </span>
          </li>
        {/each}
      </ul>
      {#if rounds > 1}
        <p class="note">One round each, listed A–Z rather than in the order they play.</p>
      {/if}
    {/if}
  </section>
{/if}

{#if requests.length > 0}
  <section class="panel" aria-labelledby="asking">
    <h2 id="asking">Asking to join ({requests.length})</h2>
    <ul class="players">
      {#each requests as request (request.id)}
        <li>
          <span class="face"><Pet pet={petOf(request)} size={40} label="" /></span>
          <span class="name">{request.display_name}</span>
          <span class="admin">
            <button type="button" class="primary" onclick={() => decide(request, true)}>Let in</button>
            <button type="button" onclick={() => decide(request, false)}>Turn away</button>
          </span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="panel">
  <div class="spread ready-head">
    <h2>
      Players ({$players.length}{#if settings?.max_players}/{settings.max_players}{/if})
    </h2>
    <span class="note">{readyCount} of {$players.length} ready</span>
  </div>
  <div class="ready-actions">
    <button
      type="button"
      class="ready-toggle"
      class:primary={!youReady}
      aria-pressed={youReady}
      onclick={toggleReady}
    >
      {youReady ? '✓ Ready — tap to take it back' : "✓ I'm ready"}
    </button>
    <FullScreenSwitch />
  </div>
  <ul class="players">
    {#each $players as player (player.id)}
      <li class:editing={player.editing === true}>
        <span
          class="dot"
          class:off={!player.connected}
          title={player.connected ? 'connected' : 'not connected'}
        ></span>
        <span class="face"><Pet pet={petOf(player)} size={40} label="" /></span>
        <span class="name">
          {player.display_name}{#if player.id === $you?.id}<span class="note"> (you)</span>{/if}
          {#if player.editing === true}<span class="picking">picking a name…</span>{/if}
        </span>
        {#if player.role === 'admin'}<span class="tag">host</span>{/if}
        {#if player.ready === true}<span class="tag ready">✓ ready</span>{/if}
        {#if isAdmin && player.role !== 'admin'}
          <span class="admin">
            <button type="button" onclick={() => promote(player)}>Promote</button>
            <button type="button" onclick={() => kick(player)}>Kick</button>
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</section>

{#if isAdmin}
  <section class="panel">
    <h2>Host</h2>
    <p class="note">Everybody in the list is in. Starting opens the first question for all of them.</p>
    <p class="waiting" aria-live="polite">
      {#if waitingOn.length === 0}
        Everyone is ready.
      {:else}
        Waiting on {listFormat.format(waitingOn)}.
      {/if}
    </p>
    <button class:primary={enoughReady} type="button" disabled={!canStart} onclick={start}>
      {enoughReady ? 'Start the game' : 'Start anyway'}
    </button>
  </section>
{:else}
  <section class="panel"><p class="note">Waiting for the host to start…</p></section>
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
  />
{/if}

<style>
  .ready-head h2 {
    margin: 0;
  }

  .ready-head {
    margin-bottom: 0.75rem;
  }

  .ready-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .ready-toggle {
    min-height: 44px;
  }

  /* Ready is the room's word, not a verdict, so it borrows the accent for its edge and
     keeps the panel's ink: --ok is what "you got it right" looks like, and nothing else. */
  .tag.ready {
    border-color: var(--accent);
    color: var(--ink);
  }

  /* Dimmed by ink rather than opacity, so the name and its note keep their contrast. */
  .face {
    display: inline-flex;
  }

  .editing .face {
    opacity: 0.5;
  }

  .editing .name {
    color: var(--muted);
  }

  .picking {
    display: block;
    font-size: 0.85rem;
    font-style: italic;
  }

  /* Apart and full height: Promote cannot be undone, so it must not be a near miss for Kick. */
  .admin {
    display: flex;
    gap: 0.75rem;
  }

  .admin button {
    min-height: 44px;
  }

  .waiting {
    margin: 0 0 0.9rem;
    overflow-wrap: anywhere;
  }
</style>
