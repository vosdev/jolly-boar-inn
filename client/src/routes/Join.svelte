<script lang="ts">
  /**
   * `/r/:code` for a browser with no session for that room.
   *
   * The room is looked up first so a wrong code fails here rather than on a name the
   * player just thought about. `GET /api/rooms/{code}` returns the room view and the
   * players, never the questions.
   */
  import { onMount } from 'svelte'

  import { ApiFailure, getRoom, joinRoom, type RoomSnapshot } from '../lib/api'
  import { setSession } from '../lib/session'

  let { code, navigate }: { code: string; navigate: (to: string) => void } = $props()

  let snapshot = $state<RoomSnapshot | null>(null)
  let lookupError = $state<string | null>(null)
  let displayName = $state('')
  let busy = $state(false)
  let failure = $state<string | null>(null)

  const status = $derived(snapshot?.room.status ?? null)
  const joinable = $derived(status === 'lobby' || status === 'playing')

  onMount(async () => {
    try {
      snapshot = await getRoom(code)
    } catch (error) {
      lookupError =
        error instanceof ApiFailure && error.code === 'not_found'
          ? `There is no room ${code}.`
          : error instanceof ApiFailure
            ? error.message
            : 'could not reach the server'
    }
  })

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const name = displayName.trim()
    if (busy || name === '') return
    busy = true
    failure = null
    try {
      const credentials = await joinRoom(code, name)
      setSession(code, credentials.session)
      navigate(`/r/${code}`)
    } catch (error) {
      failure = error instanceof ApiFailure ? error.message : 'could not join, try again'
    } finally {
      busy = false
    }
  }
</script>

<h1>Room {code}</h1>

{#if lookupError !== null}
  <section class="panel">
    <p>{lookupError}</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else if snapshot === null}
  <p class="note">Looking for the room…</p>
{:else if !joinable}
  <section class="panel">
    <p>This game has finished.</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else}
  <p class="tagline">
    {snapshot.players.length}
    {snapshot.players.length === 1 ? 'player' : 'players'} in so far.
    {#if status === 'playing'}The game has already started — you can still join.{/if}
  </p>
  <section class="panel">
    <form onsubmit={submit}>
      <div class="field">
        <label for="name">Your name</label>
        <input
          id="name"
          type="text"
          bind:value={displayName}
          maxlength="24"
          autocomplete="off"
          spellcheck="false"
        />
        <p class="note">1–24 characters, and not one somebody else already took.</p>
      </div>
      <button class="primary" type="submit" disabled={busy || displayName.trim() === ''}>
        {busy ? 'Joining…' : 'Join'}
      </button>
      {#if failure !== null}
        <p class="error">{failure}</p>
      {/if}
    </form>
  </section>
{/if}
