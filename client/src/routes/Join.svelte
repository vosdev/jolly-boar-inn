<script lang="ts">
  /**
   * `/r/:code` for a browser with no session for that room.
   *
   * The room is looked up first so a wrong code fails here rather than on a name the
   * player just thought about. `GET /api/rooms/{code}` says only the room's status and
   * how many players are in it.
   *
   * Then, with a room still in its lobby (D3, section 5.1):
   *
   * - **A profile** joins straight through under its name and head. A returning player
   *   taps a link and is in the lobby; they are never asked again.
   * - **No profile** joins straight through too, as a random name and a random head
   *   (D4, section 5.1.1 option B). The link is tapped at the exact moment a distracted
   *   person at a party puts their phone down, so nothing stands between it and the
   *   room: they are in, seeing the others arrive, and the top bar's chip nudges them
   *   once — "You're Cow31337Killer42 — tap to change" — where `set_profile` renames them
   *   in place. What they were given becomes the profile, so the next room is the same
   *   face and the same name, and never nudges again.
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
  import { ApiFailure, getRoom, joinRoom, type Credentials, type RoomSnapshot } from '../lib/api'
  import { randomHead } from '../lib/heads'
  import { generateName, nameProblem, resuffix } from '../lib/names'
  import { nudge, profile, saveProfile } from '../lib/profile'
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

  const status = $derived(snapshot?.status ?? null)
  const joinable = $derived(status === 'lobby')
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

  // Join-first: a browser with no profile is given one, and nudged in the lobby.
  $effect(() => {
    if (!joinable || attempted || $profile !== null) return
    saveProfile(generateName(code), randomHead())
    nudge.set(code)
  })

  // Straight through with the profile, whether it was there already or was just made.
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
        return await joinRoom(code, tried, $profile?.head)
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
    <p>{status === 'playing' ? 'This game has already started.' : 'This game has finished.'}</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else}
  <p class="tagline">
    {snapshot.players}
    {snapshot.players === 1 ? 'player' : 'players'} in so far.
  </p>
  {#if failure === null}
    <p class="note" role="status">Joining as {joiningAs ?? $profile?.name ?? '…'}…</p>
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
