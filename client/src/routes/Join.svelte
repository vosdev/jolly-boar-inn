<script lang="ts">
  /**
   * `/r/:code` for a browser with no session for that room.
   *
   * The room is looked up first so a wrong code fails here rather than on a name the
   * player just thought about. `GET /api/rooms/{code}` returns the room view and the
   * players, never the questions.
   *
   * Then, with a joinable room (D3, section 5.1):
   *
   * - **A profile** joins straight through under its name. A returning player taps a link
   *   and is in the lobby; they are never asked again.
   * - **No profile** gets the blocking popup first, pre-filled, and joins the moment it
   *   is saved. Join-first-and-rename needs `set_profile`, which is D4's (5.1.1).
   *
   * A `name_taken` turns the number on the end over and tries again, up to three times,
   * before it is the player's problem: two people who rolled the same base name in one
   * room will happen, and a random name that fails at the door removes no friction at
   * all. The profile keeps the name it had; only this room sees the new number. Anything
   * else that goes wrong — the room filled up, the name was refused — falls back to a
   * form, pre-filled with the name that was tried.
   */
  import { onMount } from 'svelte'

  import NameField from '../components/NameField.svelte'
  import NamePrompt from '../components/NamePrompt.svelte'
  import { ApiFailure, getRoom, joinRoom, type Credentials, type RoomSnapshot } from '../lib/api'
  import { nameProblem, resuffix } from '../lib/names'
  import { profile, saveProfile } from '../lib/profile'
  import { setSession } from '../lib/session'

  /** Fresh numbers tried after the first `name_taken`, before giving up. */
  const REROLLS = 3

  let { code, navigate }: { code: string; navigate: (to: string) => void } = $props()

  let snapshot = $state<RoomSnapshot | null>(null)
  let lookupError = $state<string | null>(null)
  /** Set once the automatic join has been tried, so a failure is not retried forever. */
  let attempted = $state(false)
  let joiningAs = $state<string | null>(null)
  let displayName = $state('')
  let failure = $state<string | null>(null)

  const status = $derived(snapshot?.room.status ?? null)
  const joinable = $derived(status === 'lobby' || status === 'playing')
  const busy = $derived(joiningAs !== null)

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

  // Straight through with the profile, whether it was there already or the popup has
  // just saved it.
  $effect(() => {
    if (!joinable || attempted || $profile === null) return
    attempted = true
    void join($profile.name)
  })

  /** Join as `name`, turning its number over on `name_taken`. Throws what is left. */
  async function joinAs(name: string): Promise<Credentials> {
    let tried = name
    for (let attempt = 0; ; attempt++) {
      joiningAs = tried
      try {
        return await joinRoom(code, tried)
      } catch (error) {
        if (!(error instanceof ApiFailure && error.code === 'name_taken') || attempt >= REROLLS) {
          throw error
        }
        tried = resuffix(tried)
      }
    }
  }

  /** `remember` saves the name as the profile: set for a name typed into the form here. */
  async function join(name: string, remember = false): Promise<void> {
    failure = null
    try {
      const credentials = await joinAs(name)
      setSession(code, credentials.session)
      if (remember) saveProfile(name)
      navigate(`/r/${code}`)
    } catch (error) {
      displayName = joiningAs ?? name
      failure = error instanceof ApiFailure ? error.message : 'could not join, try again'
    } finally {
      joiningAs = null
    }
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (busy || nameProblem(displayName) !== null) return
    void join(displayName.trim(), true)
  }
</script>

<!-- The code is not in the top bar (D2, section 4), and this is the one screen where
     nothing else says which room you are about to join. -->
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
  {#if $profile === null}
    <NamePrompt action="Join" avoid={code} onBack={() => navigate('/')} />
  {:else if failure === null}
    <p class="note" role="status">Joining as {joiningAs ?? $profile.name}…</p>
  {:else}
    <section class="panel">
      <form onsubmit={submit}>
        <NameField
          id="name"
          bind:value={displayName}
          avoid={code}
          hint="1–24 characters, and not one somebody else already took."
        />
        <button
          class="primary"
          type="submit"
          disabled={busy || nameProblem(displayName) !== null}
        >
          {busy ? 'Joining…' : 'Join'}
        </button>
        <p class="error">{failure}</p>
      </form>
    </section>
  {/if}
{/if}
