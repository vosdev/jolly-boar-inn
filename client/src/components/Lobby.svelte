<script lang="ts">
  /**
   * The waiting room: who is here, and — for an admin — the controls that change that.
   *
   * Admin controls are shown from `you.role`, which comes from the server's snapshot.
   * That is a convenience, not a check: the server decides per message (section 7
   * step 7), so a player who forges the flag gets `not_admin` back and nothing else.
   */
  import { modeLabel } from '../lib/modes'
  import type { PlayerView } from '../lib/protocol'
  import { lastError, players, room, you } from '../lib/stores'
  import type { RoomSocket } from '../lib/ws'
  import CopyLink from './CopyLink.svelte'

  let { socket }: { socket: RoomSocket } = $props()

  const isAdmin = $derived($you?.role === 'admin')
  const canStart = $derived(isAdmin && $room?.status === 'lobby' && $players.length > 0)
  const settings = $derived($room?.settings ?? null)
  /** A mode is a round, so the modes picked are the rounds the room will play. */
  const rounds = $derived(settings?.modes.length ?? 0)
  /**
   * The rounds A–Z by name, which is deliberately not the order they play in: what is
   * coming is the game's to reveal, one splash at a time, and the host arranged that
   * order (or handed it to `random`) on the way in.
   */
  /** Every question in the room, which is every round's own count added up. */
  const questions = $derived(
    (settings?.modes ?? []).reduce((total, round) => total + round.questions, 0),
  )
  const listed = $derived(
    [...(settings?.modes ?? [])].sort((a, b) =>
      modeLabel(a.mode).localeCompare(modeLabel(b.mode)),
    ),
  )

  function kick(player: PlayerView): void {
    if (confirm(`Remove ${player.display_name} from the room?`)) {
      socket.send({ t: 'kick', player_id: player.id })
    }
  }
</script>

{#if $lastError !== null}
  <div class="banner bad">
    {$lastError.message}
    <button type="button" class="link" onclick={() => lastError.set(null)}>dismiss</button>
  </div>
{/if}

<section class="panel">
  <div class="spread">
    <div>
      <label for="join-link">Room code</label>
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
  <CopyLink label="Link for players" value={`${location.origin}/r/${$room?.code ?? ''}`} />
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
  <h2>
    Players ({$players.length}{#if settings?.max_players}/{settings.max_players}{/if})
  </h2>
  <ul class="players">
    {#each $players as player (player.id)}
      <li>
        <span
          class="dot"
          class:off={!player.connected}
          title={player.connected ? 'connected' : 'not connected'}
        ></span>
        <span class="name">
          {player.display_name}{#if player.id === $you?.id}<span class="note"> (you)</span>{/if}
        </span>
        {#if player.role === 'admin'}<span class="tag">host</span>{/if}
        {#if isAdmin && player.role !== 'admin'}
          <button
            type="button"
            class="small"
            onclick={() => socket.send({ t: 'promote', player_id: player.id })}
          >
            Promote
          </button>
          <button type="button" class="small" onclick={() => kick(player)}>Kick</button>
        {/if}
      </li>
    {/each}
  </ul>
</section>

{#if isAdmin}
  <section class="panel">
    <h2>Host</h2>
    <p class="note">Everybody in the list is in. Starting opens the first question for all of them.</p>
    <button class="primary" type="button" disabled={!canStart} onclick={() => socket.send({ t: 'start_game' })}>
      Start the game
    </button>
  </section>
{:else}
  <p class="note">Waiting for the host to start…</p>
{/if}
