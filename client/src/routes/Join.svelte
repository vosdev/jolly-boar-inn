<script lang="ts">
  /**
   * `/r/:code` for a browser with no session for that room.
   *
   * The room is looked up first so a wrong code fails here rather than on a name the
   * player just thought about. `GET /api/rooms/{code}` says only the room's status and
   * how many players are in it.
   *
   * Then, with a room still in its lobby (section 5.1):
   *
   * - **A profile** joins straight through under its name and pet. A returning player
   *   taps a link and is in the lobby; they are never asked again.
   * - **No profile** gets `NamePrompt` first, pre-filled with a generated name and pet,
   *   and cannot dismiss it. The join happens on its button, so nobody in the lobby ever
   *   sees a name the player did not at least look at. What they confirm becomes the
   *   profile, so the next room is the same face and the same name.
   *
   * A `name_taken` turns the number on the end over and tries again, up to three times,
   * before it is the player's problem: two people who rolled the same base name in one
   * room will happen, and a random name that fails at the door removes no friction at
   * all. The profile keeps the name it had; only this room sees the new number. Anything
   * else that goes wrong — the room filled up, the name was refused — falls back to a
   * form, pre-filled with the name that was tried.
   *
   * An invite-only room wants the key from its link's `#k=` fragment, which is replaced
   * away once they are in. Without it, or with an old one, the player is offered to ask
   * the host instead of being asked for a link: a non-admin shares the link without the
   * key, so whoever they sent it to already has the only link they were given. They wait
   * here, polling, until a host answers. Leaving withdraws the request; closing the tab
   * lets it lapse.
   */
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'

  import NameField from '../components/NameField.svelte'
  import NamePrompt from '../components/NamePrompt.svelte'
  import {
    ApiFailure,
    askToJoin,
    cancelRequest,
    getRoom,
    joinRoom,
    pollRequest,
    type Credentials,
    type RoomSnapshot,
  } from '../lib/api'
  import { historyPath, latestPastGame } from '../lib/history'
  import { keyFromHash } from '../lib/invite'
  import { nameProblem, resuffix } from '../lib/names'
  import { profile, returningVisitor, saveProfile } from '../lib/profile'
  import { setSession } from '../lib/session'
  import { arrival, counted, failureOf, reportFailure, routeOf, type Arrival } from '../lib/stats'

  /** Fresh numbers tried after the first `name_taken`, before giving up. */
  const REROLLS = 3
  /** Between polls while a host decides; the server drops a request unpolled for ten seconds. */
  const POLL_MS = 2000

  /** Why a request to the host ended without letting the player in. */
  const REQUEST_TEXT: Record<string, string> = {
    request_denied: "The host didn't let you in.",
    request_gone: 'Nobody answered in time. You can ask again.',
    requests_full: 'Too many people are waiting to be let in. Try again in a minute.',
    room_full: 'The room is full.',
    not_open: 'The game has already started.',
    name_taken: 'Somebody took that name meanwhile. Ask again.',
  }

  let { code, navigate }: { code: string; navigate: (to: string) => void } = $props()

  let snapshot = $state<RoomSnapshot | null>(null)
  let lookupError = $state<string | null>(null)
  let joiningAs = $state<string | null>(null)
  /** A browser with no profile is being asked for one before it joins. */
  let naming = $state(false)
  let displayName = $state('')
  let failure = $state<string | null>(null)
  const key = keyFromHash(location.hash)
  /** Read before anything here replaces the history entry Home left it in. */
  const via = routeOf(key, history.state)
  /** Why the room wants its link, while it does: `key_required` or `bad_key`. */
  let inviteOnly = $state(false)
  /** The join the room refused for want of its key, which asking the host stands in for. */
  let interrupted: { name: string; remember: boolean } | null = null
  /** A request to the host this page is waiting on, and the name it asked as. */
  let waiting = $state<{
    ticket: string
    asked: string
    name: string
    remember: boolean
    reporting: Arrival
  } | null>(null)
  let requestProblem = $state<string | null>(null)
  let pollTimer: ReturnType<typeof setTimeout> | undefined

  const status = $derived(snapshot?.status ?? null)
  const joinable = $derived(status === 'lobby')
  const busy = $derived(joiningAs !== null)

  onMount(async () => {
    try {
      snapshot = await getRoom(code)
    } catch (error) {
      const gone = error instanceof ApiFailure && (error.status === 404 || error.status === 410)
      const past = gone ? latestPastGame(code) : null
      if (past !== null) {
        navigate(historyPath(past))
        return
      }
      if (error instanceof ApiFailure && error.code === 'not_found') reportFailure('not_found')
      lookupError =
        error instanceof ApiFailure && error.code === 'not_found'
          ? `There is no room ${code}.`
          : error instanceof ApiFailure
            ? error.message
            : 'could not reach the server'
      return
    }
    if (snapshot.status === 'lobby') await enter()
    else reportFailure('not_joinable')
  })

  /** Straight through with the profile, once. A browser with none is asked for one first. */
  async function enter(): Promise<void> {
    const current = get(profile)
    if (current === null) {
      naming = true
      return
    }
    await join(current.name)
  }

  /** The prompt's answer is the profile before it is a join, so the pet goes with it. */
  function named(name: string, pet: string): void {
    saveProfile(name, pet)
    naming = false
    void join(name)
  }

  /** `attempt` as `name`, turning its number over on `name_taken`. Throws what is left. */
  async function withFreshNumber<T>(name: string, attempt: (name: string) => Promise<T>): Promise<T> {
    let tried = name
    for (let n = 0; ; n++) {
      joiningAs = tried
      try {
        return await attempt(tried)
      } catch (error) {
        if (!(error instanceof ApiFailure && error.code === 'name_taken') || n >= REROLLS) {
          throw error
        }
        tried = resuffix(tried)
      }
    }
  }

  /** In: `remembered` is the name to save as the profile, for one typed into the form here. */
  function land(credentials: Credentials, remembered: string | null): void {
    setSession(code, credentials.session)
    if (remembered !== null) saveProfile(remembered)
    history.replaceState(null, '', `/r/${code}`)
    navigate(`/r/${code}`)
  }

  /** `remember` saves the name as the profile: set for a name typed into the form here. */
  async function join(name: string, remember = false): Promise<void> {
    failure = null
    const reporting = arrival(via)
    try {
      const credentials = await withFreshNumber(name, (tried) =>
        joinRoom(code, tried, $profile?.pet, returningVisitor, key, reporting),
      )
      counted(reporting)
      land(credentials, remember ? name : null)
    } catch (error) {
      reportFailure(failureOf(error))
      if (error instanceof ApiFailure && (error.code === 'key_required' || error.code === 'bad_key')) {
        inviteOnly = true
        interrupted = { name, remember }
        return
      }
      inviteOnly = false
      displayName = joiningAs ?? name
      failure = error instanceof ApiFailure ? error.message : 'could not join, try again'
    } finally {
      joiningAs = null
    }
  }

  function requestText(error: unknown): string {
    if (!(error instanceof ApiFailure)) return 'could not reach the server'
    return REQUEST_TEXT[error.code] ?? error.message
  }

  /** Ask the host to let in the join the room refused, and start waiting. */
  async function ask(): Promise<void> {
    if (busy || interrupted === null) return
    const { name, remember } = interrupted
    requestProblem = null
    let asked = name
    const reporting = arrival(via)
    try {
      const { ticket } = await withFreshNumber(name, (tried) => {
        asked = tried
        return askToJoin(code, tried, $profile?.pet, returningVisitor, reporting)
      })
      waiting = { ticket, asked, name, remember, reporting }
      pollTimer = setTimeout(() => void poll(), POLL_MS)
    } catch (error) {
      reportFailure(failureOf(error))
      requestProblem = requestText(error)
    } finally {
      joiningAs = null
    }
  }

  async function poll(): Promise<void> {
    const current = waiting
    if (current === null) return
    try {
      const answer = await pollRequest(code, current.ticket)
      if (waiting !== current) return
      if (answer.status === 'waiting') {
        pollTimer = setTimeout(() => void poll(), POLL_MS)
        return
      }
      waiting = null
      counted(current.reporting)
      land(answer, current.remember ? current.name : null)
    } catch (error) {
      if (waiting !== current) return
      // A blip in the connection is no answer; the request outlives a few missed polls.
      if (error instanceof ApiFailure && error.status === 0) {
        pollTimer = setTimeout(() => void poll(), POLL_MS)
        return
      }
      waiting = null
      reportFailure(failureOf(error))
      requestProblem = requestText(error)
    }
  }

  function stopWaiting(): void {
    clearTimeout(pollTimer)
    if (waiting === null) return
    void cancelRequest(code, waiting.ticket).catch(() => undefined)
    waiting = null
  }

  onDestroy(stopWaiting)

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (busy || nameProblem(displayName) !== null) return
    void join(displayName.trim(), true)
  }
</script>

<!-- The code is not in the top bar (section 4), and this is the one screen where
     nothing else says which room you are about to join. -->
<section class="panel">
  <h1>Room {code}</h1>
  {#if lookupError === null && snapshot === null}
    <p class="tagline">Looking for the room…</p>
  {:else if joinable && snapshot !== null}
    <p class="tagline">
      {snapshot.players}
      {snapshot.players === 1 ? 'player' : 'players'} in so far.
    </p>
    {#if !naming && !inviteOnly && failure === null}
      <p class="tagline" role="status">Joining as {joiningAs ?? $profile?.name ?? '…'}…</p>
    {/if}
  {/if}
</section>

{#if lookupError !== null}
  <section class="panel">
    <p>{lookupError}</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else if snapshot !== null && !joinable}
  <section class="panel">
    <p>{status === 'playing' ? 'This game has already started.' : 'This game has finished.'}</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else if snapshot !== null}
  {#if waiting !== null}
    <section class="panel">
      <p role="status">Waiting for the host to let you in as {waiting.asked}…</p>
      <p class="note">Keep this page open.</p>
      <button type="button" onclick={stopWaiting}>Cancel</button>
    </section>
  {:else if inviteOnly}
    <section class="panel">
      <p>This room is invite-only.</p>
      <button class="primary" type="button" disabled={busy} onclick={ask}>
        Ask the host to let you in
      </button>
      {#if requestProblem !== null}
        <p class="error">{requestProblem}</p>
      {/if}
    </section>
  {:else if failure !== null}
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

{#if naming}
  <NamePrompt action="Join" avoid={code} onConfirm={named} />
{/if}
