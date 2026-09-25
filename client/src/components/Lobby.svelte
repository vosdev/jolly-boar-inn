<script lang="ts">
  /**
   * The waiting room: who is here, and — for an admin — the controls that change that.
   *
   * Admin controls are shown from `you.role`, which comes from the server's snapshot.
   * That is a convenience, not a check: the server decides per message (section 7
   * step 7), so a player who forges the flag gets `not_admin` back and nothing else.
   *
   * The ready check here is the named one (D7, section 7.1 of ideas/design.md): the host
   * needs to know *who* is missing before pressing Start, because the answer is usually
   * somebody at the bar, and a name is something you can shout. The host is a player like
   * any other and taps too. Start is the plain button once the room reaches the same
   * threshold a splash uses; short of it, it is "Start anyway", which asks first. The
   * splash asks again with heads only.
   *
   * Promote asks first as well as Kick: there is no demote, and an admin cannot be kicked,
   * so one slip of the thumb would make a permanent co-host.
   */
  import { errorText } from '../lib/errors'
  import { headOf } from '../lib/heads'
  import { modeLabel } from '../lib/modes'
  import { readyThreshold } from '../lib/ready'
  import type { PlayerView } from '../lib/protocol'
  import { lastError, players, room, you } from '../lib/stores'
  import type { RoomSocket } from '../lib/ws'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import CopyLink from './CopyLink.svelte'
  import Head from './Head.svelte'

  let { socket }: { socket: RoomSocket } = $props()

  const isAdmin = $derived($you?.role === 'admin')
  const canStart = $derived(isAdmin && $room?.status === 'lobby' && $players.length > 0)
  const settings = $derived($room?.settings ?? null)
  /** A mode is a round, so the modes picked are the rounds the room will play. */
  const rounds = $derived(settings?.modes.length ?? 0)
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

  function promote(player: PlayerView): void {
    asking = {
      message: `Make ${player.display_name} a host? This can't be undone.`,
      label: 'Make host',
      act: () => socket.send({ t: 'promote', player_id: player.id }),
    }
  }
</script>

{#if $lastError !== null}
  <div class="banner bad">
    {errorText($lastError)}
    <button type="button" class="link" onclick={() => lastError.set(null)}>dismiss</button>
  </div>
{/if}

<section class="panel">
  <div class="spread">
    <div>
      <p class="code-label">Room code</p>
      <p class="code">{$room?.code ?? ''}</p>
    </div>
    {#if settings !== null}
      <p class="note">
        {rounds}
        {rounds === 1 ? 'round' : 'rounds'} · {questions}
        {questions === 1 ? 'question' : 'questions'} · {settings.reveal_seconds}s reveal
      </p>
    {/if}
  </div>
  <CopyLink id="join-link" label="Link for players" value={`${location.origin}/r/${$room?.code ?? ''}`} />
</section>

{#if settings !== null}
  <section class="panel">
    <h2>Tonight's rounds</h2>
    <ul class="modes">
      {#each listed as round (round.mode)}
        <li>
          <span class="name">{modeLabel(round.mode)}</span>
          <span class="note">
            {round.questions}
            {round.questions === 1 ? 'question' : 'questions'} · {round.seconds}s each
          </span>
        </li>
      {/each}
    </ul>
    {#if rounds > 1}
      <p class="note">One round each, listed A–Z rather than in the order they play.</p>
    {/if}
  </section>
{/if}

<section class="panel">
  <div class="spread ready-head">
    <h2>
      Players ({$players.length}{#if settings?.max_players}/{settings.max_players}{/if})
    </h2>
    <span class="note">{readyCount} of {$players.length} ready</span>
  </div>
  <button
    type="button"
    class="ready-toggle"
    class:primary={!youReady}
    aria-pressed={youReady}
    onclick={toggleReady}
  >
    {youReady ? '✓ Ready — tap to take it back' : "✓ I'm ready"}
  </button>
  <ul class="players">
    {#each $players as player (player.id)}
      <li>
        <span
          class="dot"
          class:off={!player.connected}
          title={player.connected ? 'connected' : 'not connected'}
        ></span>
        <Head head={headOf(player)} size={32} label="" />
        <span class="name">
          {player.display_name}{#if player.id === $you?.id}<span class="note"> (you)</span>{/if}
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
  <p class="note">Waiting for the host to start…</p>
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
  /* Drawn as the global label is, but it names text, not a field. */
  .code-label {
    margin: 0 0 0.3rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .ready-head h2 {
    margin: 0;
  }

  .ready-head {
    margin-bottom: 0.75rem;
  }

  .ready-toggle {
    min-height: 44px;
    margin-bottom: 0.75rem;
  }

  /* Ready is the room's word, not a verdict, so it borrows the accent for its edge and
     keeps the panel's ink: --ok is what "you got it right" looks like, and nothing else. */
  .tag.ready {
    border-color: var(--accent);
    color: var(--ink);
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
