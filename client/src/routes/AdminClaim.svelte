<script lang="ts">
  /**
   * Section 7 step 4: turn the single-use admin token into a session.
   *
   * The token is already out of the address bar by the time this component exists —
   * `main.ts` calls `captureAdminToken()` before mounting, so the strip happens before
   * the first paint rather than in an `onMount` after it. All that is left here is to
   * spend the token, and it is spent in a POST body; nothing puts it in a URL.
   *
   * A session for this room in localStorage means the claim already happened and this
   * is a refresh, so the token is dropped unread and the page goes straight to the room.
   */
  import { onMount, untrack } from 'svelte'

  import { ApiFailure, claimAdmin } from '../lib/api'
  import { getSession, rememberCreated, setSession, takeAdminToken } from '../lib/session'

  let { code, navigate }: { code: string; navigate: (to: string) => void } = $props()

  // Take it in either case: once this page has decided it does not need the token,
  // leaving it in memory only gives a later bug something to leak.
  const token = takeAdminToken()
  // `untrack`: the initial value is the answer. App.svelte keys this component on
  // `code`, so a different room is a different instance, not a prop change.
  const alreadyClaimed = untrack(() => getSession(code)) !== null

  let displayName = $state('')
  let busy = $state(false)
  let inlineError = $state<string | null>(null)
  let dead = $state<string | null>(null)

  onMount(() => {
    if (alreadyClaimed) navigate(`/r/${code}`)
  })

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (busy || token === null || displayName.trim() === '') return
    busy = true
    inlineError = null
    try {
      const credentials = await claimAdmin(code, token, displayName.trim())
      setSession(code, credentials.session)
      rememberCreated(code)
      navigate(`/r/${code}`)
    } catch (error) {
      if (!(error instanceof ApiFailure)) {
        inlineError = 'something went wrong, try again'
      } else if (error.code === 'token_used') {
        dead = 'This host link was already used. Ask an admin in the room to promote you.'
      } else if (error.code === 'expired') {
        dead = 'This room has expired.'
      } else if (error.code === 'not_found') {
        dead = `There is no room ${code}.`
      } else {
        inlineError = error.message
      }
    } finally {
      busy = false
    }
  }
</script>

{#if alreadyClaimed}
  <p class="note">Opening room {code}…</p>
{:else if dead !== null}
  <h1>Room {code}</h1>
  <section class="panel">
    <p>{dead}</p>
    <div class="row">
      <button type="button" onclick={() => navigate(`/r/${code}`)}>Join as a player</button>
      <button type="button" onclick={() => navigate('/')}>Home</button>
    </div>
  </section>
{:else if token === null}
  <h1>Room {code}</h1>
  <section class="panel">
    <p>
      This page needs a host link, and there is no token in this one. A host link works
      once — if you already used it, you are an admin on whichever device you used it on.
    </p>
    <div class="row">
      <button type="button" onclick={() => navigate(`/r/${code}`)}>Join as a player</button>
      <button type="button" onclick={() => navigate('/')}>Home</button>
    </div>
  </section>
{:else}
  <h1>Host room {code}</h1>
  <p class="tagline">Pick the name the room will see.</p>
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
        <p class="note">1–24 characters.</p>
      </div>
      <button class="primary" type="submit" disabled={busy || displayName.trim() === ''}>
        {busy ? 'Claiming…' : 'Take the host seat'}
      </button>
      {#if inlineError !== null}
        <p class="error">{inlineError}</p>
      {/if}
    </form>
  </section>
{/if}
