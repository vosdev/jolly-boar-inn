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
   * - **A profile** joins straight through under its name and head. A returning player
   *   taps a link and is in the lobby; they are never asked again.
   * - **No profile** joins straight through too, as a random name and a random head
   *   (section 5.1.1 option B). The link is tapped at the exact moment a distracted
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
   *
   * An invite-only room wants the key from its link's `#k=` fragment. A missing or wrong
   * one is a prompt for the link, not an error: the player was most likely sent the code
   * alone, or an old link. The fragment is replaced away once they are in. Beside the
   * prompt they can ask the host to let them in instead, and wait here, polling, until a
   * host answers. Leaving withdraws the request; closing the tab lets it lapse.
   */
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'

  import NameField from '../components/NameField.svelte'
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
  import { randomHead } from '../lib/heads'
  import { historyPath, latestPastGame } from '../lib/history'
  import { keyFromHash, keyFromInput } from '../lib/invite'
  import { generateName, nameProblem, resuffix } from '../lib/names'
  import { nudge, profile, returningVisitor, saveProfile } from '../lib/profile'
  import { setSession } from '../lib/session'

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
  let displayName = $state('')
  let failure = $state<string | null>(null)
  let key = keyFromHash(location.hash)
  /** Why the room wants its link, while it does: `key_required` or `bad_key`. */
  let keyProblem = $state<string | null>(null)
  let pasted = $state('')
  /** The join the key prompt interrupted, retried once a key is pasted. */
  let interrupted: { name: string; remember: boolean } | null = null
  /** A request to the host this page is waiting on, and the name it asked as. */
  let waiting = $state<{ ticket: string; asked: string; name: string; remember: boolean } | null>(
    null,
  )
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
      lookupError =
        error instanceof ApiFailure && error.code === 'not_found'
          ? `There is no room ${code}.`
          : error instanceof ApiFailure
            ? error.message
            : 'could not reach the server'
      return
    }
    if (snapshot.status === 'lobby') await enter()
  })

  /**
   * Straight through with the profile, once. A browser with none is given one first
   * (join-first), and nudged about it in the lobby.
   */
  async function enter(): Promise<void> {
    let current = get(profile)
    if (current === null) {
      saveProfile(generateName(code), randomHead())
      nudge.set(code)
      current = get(profile)
    }
    if (current !== null) await join(current.name)
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
    try {
      const credentials = await withFreshNumber(name, (tried) =>
        joinRoom(code, tried, $profile?.head, returningVisitor, key),
      )
      land(credentials, remember ? name : null)
    } catch (error) {
      if (error instanceof ApiFailure && (error.code === 'key_required' || error.code === 'bad_key')) {
        keyProblem = error.code
        interrupted = { name, remember }
        return
      }
      keyProblem = null
      displayName = joiningAs ?? name
      failure = error instanceof ApiFailure ? error.message : 'could not join, try again'
    } finally {
      joiningAs = null
    }
  }

  const pastedKey = $derived(keyFromInput(pasted))

  function requestText(error: unknown): string {
    if (!(error instanceof ApiFailure)) return 'could not reach the server'
    return REQUEST_TEXT[error.code] ?? error.message
  }

  /** Ask the host to let in the join the key prompt interrupted, and start waiting. */
  async function ask(): Promise<void> {
    if (busy || interrupted === null) return
    const { name, remember } = interrupted
    requestProblem = null
    let asked = name
    try {
      const { ticket } = await withFreshNumber(name, (tried) => {
        asked = tried
        return askToJoin(code, tried, $profile?.head, returningVisitor)
      })
      waiting = { ticket, asked, name, remember }
      pollTimer = setTimeout(() => void poll(), POLL_MS)
    } catch (error) {
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
      land(answer, current.remember ? current.name : null)
    } catch (error) {
      if (waiting !== current) return
      // A blip in the connection is no answer; the request outlives a few missed polls.
      if (error instanceof ApiFailure && error.status === 0) {
        pollTimer = setTimeout(() => void poll(), POLL_MS)
        return
      }
      waiting = null
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

  function submitKey(event: SubmitEvent): void {
    event.preventDefault()
    if (busy || pastedKey === null || interrupted === null) return
    key = pastedKey
    void join(interrupted.name, interrupted.remember)
  }

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
    {#if keyProblem === null && failure === null}
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
  {:else if keyProblem !== null}
    <section class="panel">
      <form onsubmit={submitKey}>
        <div class="field">
          <label for="invite">Invite link</label>
          <input id="invite" type="text" autocomplete="off" spellcheck="false" bind:value={pasted} />
          <p class="note">This room is invite-only. Paste the link the host shared.</p>
        </div>
        <button class="primary" type="submit" disabled={busy || pastedKey === null}>
          {busy ? 'Joining…' : 'Join'}
        </button>
        {#if keyProblem === 'bad_key'}
          <p class="error">That link is out of date or mistyped.</p>
        {/if}
      </form>
      <p class="note">No link?</p>
      <button type="button" disabled={busy} onclick={ask}>Ask the host to let you in</button>
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
