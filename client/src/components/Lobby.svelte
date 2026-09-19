<script lang="ts">
  /**
   * The waiting room: who is here, and — for an admin — the controls that change that.
   *
   * Admin controls are shown from `you.role`, which comes from the server's snapshot.
   * That is a convenience, not a check: the server decides per message (section 7
   * step 7), so a player who forges the flag gets `not_admin` back and nothing else.
   */
  import type { PlayerView } from '../lib/protocol'
  import { lastError, players, room, you } from '../lib/stores'
  import type { RoomSocket } from '../lib/ws'
  import CopyLink from './CopyLink.svelte'

  let { socket }: { socket: RoomSocket } = $props()

  const isAdmin = $derived($you?.role === 'admin')
  const canStart = $derived(isAdmin && $room?.status === 'lobby' && $players.length > 0)
  const settings = $derived($room?.settings ?? null)
  /** Rounds are not stored: the total and the round length are, and this is their ratio. */
  const rounds = $derived(
    settings === null ? 0 : Math.ceil(settings.question_count / settings.questions_per_round),
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
        {rounds === 1 ? 'round' : 'rounds'} of {settings.questions_per_round} ·
        up to {settings.question_seconds}s a question · {settings.reveal_seconds}s reveal
      </p>
    {/if}
  </div>
  <CopyLink label="Link for players" value={`${location.origin}/r/${$room?.code ?? ''}`} />
</section>

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
