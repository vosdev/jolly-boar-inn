<script lang="ts">
  /**
   * `/r/:code` for a browser that has a session: open the socket, let `stores.ts` hold
   * what comes back, and pick a screen from `room.status`.
   *
   * T13 replaces the "game in progress" panel with the play screen (`phase` state
   * machine, timer, question components, scoreboard). Everything it needs is already in
   * the stores.
   */
  import { onMount } from 'svelte'

  import Lobby from '../components/Lobby.svelte'
  import { clearSession, getSession } from '../lib/session'
  import { applyServerMessage, connection, players, resetRoom, room, standings } from '../lib/stores'
  import { RoomSocket, type ClosureReason } from '../lib/ws'

  let { code, navigate }: { code: string; navigate: (to: string) => void } = $props()

  let socket = $state<RoomSocket | null>(null)
  let departure = $state<{ reason: ClosureReason; detail: string } | null>(null)

  onMount(() => {
    resetRoom()
    const session = getSession(code)
    if (session === null) {
      navigate(`/r/${code}`) // No session: the router sends us to Join instead.
      return
    }
    const live = new RoomSocket(code, session, {
      onMessage: applyServerMessage,
      onState: (state) => connection.set(state),
      onClosed: (reason, detail) => {
        // A session the room will not accept is worth nothing; drop it so the next
        // visit offers a fresh join rather than failing the same way forever.
        if (reason === 'bad_session' || reason === 'kicked') clearSession(code)
        departure = { reason, detail }
      },
    })
    socket = live
    live.open()
    return () => {
      live.close()
      socket = null
    }
  })

  const FAREWELL: Record<ClosureReason, string> = {
    replaced: 'You opened this room on another device. Only the newest one stays connected.',
    bad_session: 'This device is no longer a player in the room. Join again to come back.',
    kicked: 'An admin removed you from the room.',
    no_room: 'That room is gone — it either never existed or it has expired.',
    protocol: 'The connection ended on a protocol error. Reloading usually fixes it.',
    stopped: 'Disconnected.',
  }

  // `bad_session` and `kicked` dropped the session above, so a reload lands on Join,
  // not back in the room. Say so rather than promising a reconnect that cannot happen.
  const RETRY = $derived(
    departure === null || departure.reason === 'no_room'
      ? null
      : departure.reason === 'bad_session' || departure.reason === 'kicked'
        ? 'Join again'
        : 'Reconnect',
  )

  function leave(): void {
    navigate('/')
  }
</script>

{#if departure !== null}
  <h1>Room {code}</h1>
  <section class="panel">
    <p>{FAREWELL[departure.reason]}</p>
    <div class="row">
      {#if RETRY !== null}
        <button type="button" class="primary" onclick={() => location.reload()}>{RETRY}</button>
      {/if}
      <button type="button" onclick={leave}>Home</button>
    </div>
  </section>
{:else}
  {#if $connection === 'reconnecting'}
    <div class="banner">Connection lost — reconnecting…</div>
  {/if}

  {#if $room === null}
    <h1>Room {code}</h1>
    <p class="note">Connecting…</p>
  {:else if $room.status === 'lobby'}
    <h1>Lobby</h1>
    {#if socket !== null}
      <Lobby {socket} />
    {/if}
  {:else}
    <!-- T13: the play screen. Until then the room is still live, just not drawn. -->
    <h1>{$room.status === 'finished' ? 'Game finished' : 'Game in progress'}</h1>
    <section class="panel">
      <p class="note">
        {#if $room.status === 'playing'}
          Question {($room.current_index ?? 0) + 1} of {$room.total}, with {$players.length}
          {$players.length === 1 ? 'player' : 'players'} in the room. The play screen lands in T13.
        {:else}
          {$standings.length}
          {$standings.length === 1 ? 'player' : 'players'} finished. The final scoreboard lands in T13.
        {/if}
      </p>
      <button type="button" onclick={leave}>Home</button>
    </section>
  {/if}
{/if}
