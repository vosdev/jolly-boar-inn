<script lang="ts">
  /**
   * The front page: join a room by code or from the public list, host a new one, manage
   * the rooms this browser created, and look back at the games it finished.
   *
   * "Rooms you created here" is the list in localStorage, and removing one really
   * removes it: the server deletes the row, its players and their answers, and the code
   * is free again the moment it answers. That is the only way to be rid of a room before
   * it expires, so the button asks first.
   *
   * A browser that has finished a game is asked for its questions too, and for what was wrong
   * with ours (`lib/suggestions.ts`, `lib/reports.ts`).
   */
  import { onMount } from 'svelte'
  import { siteName } from 'virtual:branding'

  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import Pet from '../components/Pet.svelte'
  import Stage from '../components/stage/Stage.svelte'
  import { hasAdminToken } from '../lib/admin'
  import { ApiFailure, deleteRoom, getPublicRooms, type PublicRoom } from '../lib/api'
  import { expiresIn, finishedTime } from '../lib/dates'
  import { petOf } from '../lib/pets'
  import { historyPath, pastGames, placeIn, removePastGame, type PastGame } from '../lib/history'
  import { REPO_URL } from '../lib/links'
  import { atRoomLimit } from '../lib/roomLimit'
  import { maySuggest } from '../lib/suggestions'
  import { modeLabel } from '../lib/modes'
  import {
    createdRoomExpiries,
    forgetCreated,
    getSession,
    isRoomCode,
    normalizeCode,
  } from '../lib/session'

  let { navigate }: { navigate: (to: string) => void } = $props()

  /** The server caches the list for 5 s; twice that keeps a Home left open current. */
  const PUBLIC_REFRESH_MS = 10_000

  /** Moved on with the refresh below, so a Home left open keeps its countdowns honest. */
  let now = $state(Date.now())
  let hosted = $state(createdRoomExpiries())
  let past = $state(pastGames())
  /** Twenty games are kept, and a column that long buries what sits under it. */
  const PAST_PAGE = 5
  let pastPage = $state(0)
  const pastPages = $derived(Math.ceil(past.length / PAST_PAGE))
  const pastShown = $derived(past.slice(pastPage * PAST_PAGE, (pastPage + 1) * PAST_PAGE))
  const admin = hasAdminToken()
  const suggesting = maySuggest()
  let code = $state('')
  let removing = $state<string | null>(null)
  /** The room whose Remove is waiting on a yes. */
  let confirming = $state<string | null>(null)
  /** The past game whose Remove is waiting on a yes. */
  let confirmingPast = $state<PastGame | null>(null)
  let codeProblem = $state<string | null>(null)
  let notice = $state<{ text: string; bad: boolean } | null>(null)
  let open = $state<PublicRoom[]>([])
  /** Null until the list has been checked against the server, so Create is not refused early. */
  let full = $state<boolean | null>(null)

  const target = $derived(normalizeCode(code))

  /** A failed fetch keeps the last list: it is a convenience, never worth an error. */
  async function refreshOpen(): Promise<void> {
    try {
      open = await getPublicRooms()
    } catch {
      return
    }
  }

  async function refreshFull(): Promise<void> {
    full = await atRoomLimit()
  }

  onMount(() => {
    void refreshOpen()
    void refreshFull()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        now = Date.now()
        void refreshOpen()
      }
    }, PUBLIC_REFRESH_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        now = Date.now()
        void refreshOpen()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  function describe(room: PublicRoom): string {
    const rounds = `${room.rounds} round${room.rounds === 1 ? '' : 's'}`
    const modes = room.modes === undefined ? '' : `: ${room.modes.map(modeLabel).join(', ')}`
    return `${room.players}/${room.max_players} players · ${rounds}${modes}`
  }

  /** Anything the router cannot match would leave Home on screen with no word said. */
  function join(event: SubmitEvent): void {
    event.preventDefault()
    if (isRoomCode(target)) navigate(`/r/${target}`)
    else codeProblem = 'That is not a room code.'
  }

  /** Forget the room here. The list is re-read rather than spliced, so it cannot drift. */
  function forget(room: string): void {
    forgetCreated(room)
    hosted = createdRoomExpiries()
    void refreshFull()
  }

  /** The list is re-read, as with the created rooms, so it cannot drift from storage. */
  function removePast(game: PastGame): void {
    confirmingPast = null
    removePastGame(game)
    past = pastGames()
    // Removing the last game on a page would otherwise leave an empty one showing.
    pastPage = Math.max(0, Math.min(pastPage, Math.ceil(past.length / PAST_PAGE) - 1))
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

<div class="intro">
  <Stage host="wise_old_man">
    {#snippet paper()}
      <h1>Think you know Gielinor? Prove it at {siteName}.</h1>
      <p class="tagline">
        Every question is OSRS and every second counts. Join a room and race for the top of the
        leaderboard.
      </p>
    {/snippet}
  </Stage>
</div>

<div class="columns">
  <div class="column">
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
        Create a game room for your friends, your stream or your clan. Pick the rounds and game
        modes, or add your own questions.
      </p>
      {#if full === true}
        <p id="room-limit" class="banner">
          You already have five rooms. Remove one under "Rooms you created here" to make another.
        </p>
      {/if}
      <button
        type="button"
        disabled={full === true}
        aria-describedby={full === true ? 'room-limit' : undefined}
        onclick={() => navigate('/create')}
      >
        Create a room
      </button>
    </section>
  </div>
  <div class="column">
    <section class="panel">
      <h2>Public rooms</h2>
      {#if open.length === 0}
        <p class="note">There are no public rooms right now.</p>
      {:else}
        <ul class="players">
          {#each open as room (room.code)}
            <li>
              <Pet pet={petOf(room.host)} size={32} cut="icon" label="" />
              <span class="name">
                <span class="code-small">{room.code}</span>
                <span class="host">{room.host.display_name}</span>
                <span class="about">{describe(room)}</span>
              </span>
              <button
                type="button"
                class="small"
                aria-label={`Join ${room.code}`}
                onclick={() => navigate(`/r/${room.code}`)}
              >
                Join
              </button>
            </li>
          {/each}
        </ul>
      {/if}
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
          {#each hosted as { code: room, expiresAt } (room)}
            <li>
              <span class="name">
                <span class="code-small">{room}</span>
                <span class="when">Expires {expiresIn(expiresAt, now)}</span>
              </span>
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
      </section>
    {/if}

    {#if past.length > 0}
      <section class="panel">
        <h2>Past games</h2>
        <ul class="players">
          {#each pastShown as game (historyPath(game))}
            {@const place = placeIn(game)}
            <li>
              <span class="name">
                <span class="code-small">{game.code}</span>
                <span class="when">{finishedTime(game.finishedAt)}</span>
              </span>
              {#if place !== null}
                <span class="place">{place}</span>
              {/if}
              <button
                type="button"
                class="small"
                aria-label={`Hi-scores for ${game.code}`}
                onclick={() => navigate(historyPath(game))}
              >
                Hi-scores
              </button>
              <button
                type="button"
                class="small"
                aria-label={`Remove ${game.code} from past games`}
                onclick={() => (confirmingPast = game)}
              >
                Remove
              </button>
            </li>
          {/each}
        </ul>
        {#if pastPages > 1}
          <nav class="paging" aria-label="Past games pages">
            <button
              type="button"
              class="small"
              disabled={pastPage === 0}
              onclick={() => pastPage--}
            >
              Newer
            </button>
            <span class="when">Page {pastPage + 1} of {pastPages}</span>
            <button
              type="button"
              class="small"
              disabled={pastPage === pastPages - 1}
              onclick={() => pastPage++}
            >
              Older
            </button>
          </nav>
        {/if}
      </section>
    {/if}

    {#if suggesting}
      <section class="panel">
        <h2>Suggest or report a question</h2>
        <p class="note">
          Know something the inn doesn't ask yet? Write a question, an examine line or an item for
          the Grand Exchange rounds. Spotted a wrong answer, a typo or an outdated fact? Tell the
          innkeeper which question. The innkeeper reads every one.
        </p>
        <div class="row">
          <button type="button" onclick={() => navigate('/suggest')}>Suggest something</button>
          <button type="button" onclick={() => navigate('/report')}>Report a question</button>
        </div>
      </section>
    {/if}
  </div>
</div>

<section class="panel">
  <h2>Open source</h2>
  <p class="note">
    This quiz is free software. Read the code, report a bug, or host your own for your clan.
  </p>
  <p class="links">
    <a class="link" href={REPO_URL} target="_blank" rel="noopener">jolly-boar-inn on GitHub</a>
    <!-- Only for the operator, whose browser kept the token from their first `/admin#token=` visit. -->
    {#if admin}
      <button type="button" class="link" onclick={() => navigate('/admin')}>Admin</button>
    {/if}
  </p>
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

{#if confirmingPast !== null}
  {@const game = confirmingPast}
  <ConfirmDialog
    message={`Remove ${game.code} from your past games? Its hi-scores are not kept anywhere else, and this cannot be undone.`}
    confirmLabel="Remove"
    onConfirm={() => removePast(game)}
    onCancel={() => (confirmingPast = null)}
  />
{/if}

<style>
  .intro {
    margin-bottom: 1rem;
  }

  .intro h1 {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: max(1.15rem, 1.5rem * var(--scroll-text, 1));
    line-height: 1.15;
  }

  .intro .tagline {
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
  }

  /* Join and Host are what you come to do, so they stand apart from the lists of rooms.
     The DOM order is the phone order, so a screen reader and the tab key follow it. */
  @media (min-width: 50rem) {
    .columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 1.25rem;
      align-items: start;
    }
  }

  .code-small {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    letter-spacing: 0.08em;
    font-weight: 600;
  }

  .when,
  .host {
    color: var(--muted);
    margin-left: 0.5rem;
  }

  .about {
    display: block;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .place {
    font-weight: 600;
  }

  .paging {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .paging .when {
    margin: 0;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin: 0;
  }
</style>
