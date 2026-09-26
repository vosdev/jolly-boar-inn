<script lang="ts">
  /**
   * The front page: join a room by code, host a new one, and manage the rooms this
   * browser created.
   *
   * "Rooms you created here" is the list in localStorage, and removing one really
   * removes it: the server deletes the row, its players and their answers, and the code
   * is free again the moment it answers. That is the only way to be rid of a room before
   * it expires, so the button asks first.
   */
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import { ApiFailure, deleteRoom } from '../lib/api'
  import { REPO_URL } from '../lib/links'
  import {
    createdRooms,
    forgetCreated,
    getSession,
    isRoomCode,
    normalizeCode,
  } from '../lib/session'

  let { navigate }: { navigate: (to: string) => void } = $props()

  let hosted = $state(createdRooms())
  let code = $state('')
  let removing = $state<string | null>(null)
  /** The room whose Remove is waiting on a yes. */
  let confirming = $state<string | null>(null)
  let codeProblem = $state<string | null>(null)
  let notice = $state<{ text: string; bad: boolean } | null>(null)

  const target = $derived(normalizeCode(code))

  /** Anything the router cannot match would leave Home on screen with no word said. */
  function join(event: SubmitEvent): void {
    event.preventDefault()
    if (isRoomCode(target)) navigate(`/r/${target}`)
    else codeProblem = 'That is not a room code.'
  }

  /** Forget the room here. The list is re-read rather than spliced, so it cannot drift. */
  function forget(room: string): void {
    forgetCreated(room)
    hosted = createdRooms()
  }

  async function remove(room: string): Promise<void> {
    confirming = null
    notice = null
    const session = getSession(room)
    if (session === null) {
      // The host session for this room is not in this browser any more (cleared storage,
      // or another device created it). Nothing here can prove we may delete it, so the
      // most that can be done is to stop listing it.
      forget(room)
      notice = {
        text: `${room} is off this list. Its host session is not in this browser, so the room itself stays until it expires.`,
        bad: false,
      }
      return
    }
    removing = room
    try {
      await deleteRoom(room, session)
      forget(room)
    } catch (failure) {
      // 404 and 410 are the room already being gone -- expired, or removed from another
      // device. The list is what is wrong then, so fix the list.
      if (failure instanceof ApiFailure && (failure.status === 404 || failure.status === 410)) {
        forget(room)
      } else {
        const message = failure instanceof ApiFailure ? failure.message : 'the room was not removed'
        notice = { text: message, bad: true }
      }
    } finally {
      removing = null
    }
  }
</script>

<!-- The inn's name is in the top bar on every screen (D2), so the front page says what
     you are here for instead of saying it twice. -->
<h1>Welcome in</h1>
<p class="tagline">Quiz night. One host, a room code, and everybody's phone.</p>

<section class="panel">
  <h2>Join a room</h2>
  <form onsubmit={join}>
    <div class="field">
      <label for="code">Room code</label>
      <input
        id="code"
        type="text"
        bind:value={code}
        oninput={() => (codeProblem = null)}
        aria-invalid={codeProblem !== null}
        aria-describedby={codeProblem === null ? undefined : 'code-problem'}
        placeholder="DRAGON"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
      />
      {#if codeProblem !== null}
        <p id="code-problem" class="error">{codeProblem}</p>
      {/if}
    </div>
    <button class="primary" type="submit" disabled={code.trim() === ''}>Join</button>
  </form>
</section>

<section class="panel">
  <h2>Host a room</h2>
  <p class="note">
    Pick your name and the settings. You are the host, and you get a room code to read out.
  </p>
  <button type="button" onclick={() => navigate('/create')}>Create a room</button>
</section>

{#if hosted.length > 0}
  <section class="panel">
    <h2>Rooms you created here</h2>
    {#if notice !== null}
      <div class="banner" class:bad={notice.bad}>
        {notice.text}
        <button type="button" class="link" onclick={() => (notice = null)}>dismiss</button>
      </div>
    {/if}
    <ul class="players">
      {#each hosted as room (room)}
        <li>
          <span class="name code-small">{room}</span>
          <button type="button" class="small" onclick={() => navigate(`/r/${room}`)}>Open</button>
          <button
            type="button"
            class="small"
            disabled={removing === room}
            onclick={() => (confirming = room)}
          >
            {removing === room ? 'Removing…' : 'Remove'}
          </button>
        </li>
      {/each}
    </ul>
    <p class="note">
      Removing a room deletes it and its scores for everyone, and frees the code.
    </p>
  </section>
{/if}

<section class="panel">
  <h2>Open source</h2>
  <p class="note">
    This quiz is free software. Read the code, report a bug, or host your own for your clan.
  </p>
  <a class="link" href={REPO_URL} target="_blank" rel="noopener">jolly-boar-inn on GitHub</a>
</section>

{#if confirming !== null}
  {@const room = confirming}
  <ConfirmDialog
    message={`Remove room ${room}? Anybody still in it is dropped, and this cannot be undone.`}
    confirmLabel="Remove"
    onConfirm={() => remove(room)}
    onCancel={() => (confirming = null)}
  />
{/if}

<style>
  .code-small {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    letter-spacing: 0.08em;
    font-weight: 600;
  }
</style>
