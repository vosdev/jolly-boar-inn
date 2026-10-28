<script lang="ts">
  /**
   * The front page (section 8 of ideas/design.md): the site's hero in the dialogue box over
   * the theme's sheet, which holds Join and Create beside the game modes; under it the public rooms, the rooms this
   * browser created and the games it finished, each only while it has any.
   *
   * "Rooms you created here" is the list in localStorage, and removing one really
   * removes it: the server deletes the row, its players and their answers, and the code
   * is free again the moment it answers. That is the only way to be rid of a room before
   * it expires, so the button asks first.
   *
   * A browser that has finished a game is asked for its questions too, and for what was wrong
   * with ours (`lib/suggestions.ts`, `lib/reports.ts`), by Reldo at the column's foot.
   *
   * How to play, at `/how-to-play` and a view under it, is drawn here too: everything
   * under the dialogue box fades out and the page fades in, while the box stays and its
   * speaker changes. The router says which view; Home only fades between them.
   */
  import { onMount, tick, untrack } from 'svelte'
  import { siteName } from 'virtual:branding'

  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import DialogueBox from '../components/DialogueBox.svelte'
  import HowToPage, { type HowToView } from '../components/HowToPage.svelte'
  import Icon from '../components/Icon.svelte'
  import ModeShowcase, { SHOWN } from '../components/ModeShowcase.svelte'
  import Pet from '../components/Pet.svelte'
  import Said from '../components/stage/Said.svelte'
  import Stage from '../components/stage/Stage.svelte'
  import TryQuestion from '../components/TryQuestion.svelte'
  import { ApiFailure, deleteRoom, getPublicRooms, type PublicRoom } from '../lib/api'
  import { expiresIn, finishedTime } from '../lib/dates'
  import { heroFor, speakerFor } from '../lib/hero'
  import { petOf } from '../lib/pets'
  import {
    historyPath,
    pastGames,
    placeIn,
    removePastGame,
    winnerIn,
    type PastGame,
  } from '../lib/history'
  import { howToPath } from '../lib/howToPlay'
  import { atRoomLimit } from '../lib/roomLimit'
  import type { Route } from '../lib/stats'
  import { maySuggest } from '../lib/suggestions'
  import { getQueue, storedAdminToken } from '../lib/admin'
  import { MODES, modeLabel } from '../lib/modes'
  import { STRANGER } from '../lib/randomEvents'
  import { SAMPLES, nextSample } from '../lib/samples'
  import { OUT_MS, cuts } from '../lib/routeFade'
  import {
    createdRoomExpiries,
    forgetCreated,
    getSession,
    isRoomCode,
    normalizeCode,
  } from '../lib/session'
  import { watchTheme } from '../lib/theme'

  let {
    navigate,
    howTo = null,
  }: {
    navigate: (to: string, state?: { via: Route } | { howTo: HowToEntry }) => void
    /** How to play's view at this address, null for Home itself. */
    howTo?: HowToView | null
  } = $props()

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
  const suggesting = maySuggest()
  const adminToken = storedAdminToken()
  /** Pending suggestions, unknown until the server answers, and left so if it refuses the token. */
  let pending = $state<number | null>(null)
  let theme = $state('')
  const heroArt = $derived(heroFor(theme))
  onMount(() => watchTheme((current) => (theme = current)))
  onMount(() => {
    if (adminToken === null) return
    getQueue(adminToken, 'pending').then(
      (queue) => (pending = queue.counts.pending),
      () => {},
    )
  })

  let code = $state('')

  /**
   * What `history.state` carries for a view of How to play: `from` is the view it was
   * opened from, `home` how many entries back Home is, null when Home is not behind it.
   */
  interface HowToEntry {
    from: HowToView | null
    home: number | null
  }

  function entryNow(): HowToEntry | null {
    const state: unknown = history.state
    if (typeof state !== 'object' || state === null || !('howTo' in state)) return null
    return (state as { howTo: HowToEntry }).howTo
  }

  /** The view on screen, which trails `howTo` while the old one fades out. */
  let shown = $state<HowToView | null>(untrack(() => howTo))
  /** While the old view fades out and before the new one fades in. */
  let fading = $state(false)
  let swap = 0
  /** The mode whose sample question is being tried in the dialogue box's place, if any. */
  let trying = $state<string | null>(null)

  function tryMode(mode: string): void {
    trying = mode
    scrollTo(0, 0)
  }

  async function show(next: HowToView | null): Promise<void> {
    if (next === shown) return
    trying = null
    const mine = ++swap
    if (cuts()) {
      shown = next
      scrollTo(0, 0)
      return
    }
    fading = true
    await new Promise((done) => setTimeout(done, OUT_MS))
    if (mine !== swap) return
    shown = next
    scrollTo(0, 0)
    await tick()
    // A frame at opacity 0 first, or the new view would not fade in.
    requestAnimationFrame(() => requestAnimationFrame(() => mine === swap && (fading = false)))
  }

  $effect(() => {
    const next = howTo
    untrack(() => void show(next))
  })

  function open(next: HowToView): void {
    const before = entryNow()?.home ?? null
    const home = howTo === null ? 1 : before === null ? null : before + 1
    navigate(howToPath(next, SHOWN), { howTo: { from: howTo, home } })
  }

  /** Back to the overview: the entry before, if that is where this view was opened. */
  function allModes(): void {
    if (entryNow()?.from === 'overview') history.back()
    else open('overview')
  }

  /** Back through the entries to Home, if it is behind them, so Back does not return here. */
  function leaveHowTo(): void {
    const home = entryNow()?.home ?? null
    if (home !== null) history.go(-home)
    else navigate('/')
  }

  const howToMode = $derived(shown === null ? null : (MODES[shown] ?? null))
  let removing = $state<string | null>(null)
  /** The room whose Remove is waiting on a yes. */
  let confirming = $state<string | null>(null)
  /** The past game whose Remove is waiting on a yes. */
  let confirmingPast = $state<PastGame | null>(null)
  let codeProblem = $state<string | null>(null)
  let notice = $state<{ text: string; bad: boolean } | null>(null)
  let publicRooms = $state<PublicRoom[]>([])
  /** Null until the list has been checked against the server, so Create is not refused early. */
  let full = $state<boolean | null>(null)

  const target = $derived(normalizeCode(code))

  /** A failed fetch keeps the last list: it is a convenience, never worth an error. */
  async function refreshOpen(): Promise<void> {
    try {
      publicRooms = await getPublicRooms()
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
    if (isRoomCode(target)) navigate(`/r/${target}`, { via: 'code' })
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

{#snippet welcome()}
  <p>
    Think you know Gielinor? Prove it at {siteName}! Join a room with its code, or create your own
    and host it for your friends, your clan or your stream.
  </p>
{/snippet}

{#snippet newHere()}
  <p>
    New here? This is how a night at {siteName} goes. Pick one of my hosts below to see their round.
  </p>
{/snippet}

{#snippet visitors()}
  <p>
    Some nights the road brings visitors. They barge in mid-round with a question of their own, then
    go on their way.
  </p>
{/snippet}

{#snippet presents()}
  <p>{howToMode?.greeting}</p>
  <p>{howToMode?.blurb}</p>
{/snippet}

<div class="home" class:fading>
  {#if trying !== null && trying in SAMPLES}
    {#key trying}
      <TryQuestion
        sample={SAMPLES[trying]!}
        next={nextSample(
          trying,
          SHOWN.map((mode) => mode.id),
        )}
        onnext={tryMode}
      />
    {/key}
  {:else}
    <Stage
      host={howToMode?.host.id ?? (shown === 'events' ? STRANGER : 'wise_old_man')}
      hero={howToMode === null && shown !== 'events' ? heroArt : null}
      bubble="on"
      paper={shown === null ? sheet : undefined}
    >
      {#snippet said()}
        {#if howToMode !== null}
          <Said name={howToMode.host.name} line={presents} />
        {:else if shown === 'events'}
          <Said name="Mysterious Old Man" line={visitors} />
        {:else}
          <Said name={speakerFor(heroArt)} line={shown === null ? welcome : newHere} />
        {/if}
      {/snippet}
    </Stage>
  {/if}

  <div class="below">
    {#if shown !== null}
      <HowToPage view={shown} onopen={open} onall={allModes} onback={leaveHowTo} ontry={tryMode} />
    {:else}
      {@render rest()}
    {/if}
  </div>
</div>

{#snippet sheet()}
  <h1 class="sr">{siteName}</h1>
  <div class="halves">
    <div class="entry">
      <form class="join" onsubmit={join}>
        <div class="field">
          <label for="code">Room code</label>
          <input
            id="code"
            type="text"
            bind:value={code}
            oninput={() => (codeProblem = null)}
            aria-invalid={codeProblem !== null}
            aria-describedby={codeProblem === null ? undefined : 'code-problem'}
            placeholder="ThermonuclearSmokeDevil"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button class="primary big" type="submit" disabled={code.trim() === ''}>Join</button>
      </form>
      {#if codeProblem !== null}
        <p id="code-problem" class="error">{codeProblem}</p>
      {/if}
      <p class="or">or</p>
      {#if full === true}
        <p id="room-limit" class="banner">
          You already have five rooms. Remove one under "Rooms you created here" to make another.
        </p>
      {/if}
      <button
        type="button"
        class="big"
        disabled={full === true}
        aria-describedby={full === true ? 'room-limit' : undefined}
        onclick={() => navigate('/create')}
      >
        Create a room
      </button>
      <button type="button" class="how-to" onclick={() => open('overview')}> How to play </button>
    </div>
    <span class="split" aria-hidden="true"></span>
    <ModeShowcase onpick={open} />
  </div>
{/snippet}

{#snippet rest()}
  {#if publicRooms.length > 0}
    <section class="panel">
      <h2>Public rooms</h2>
      <ul class="players">
        {#each publicRooms as room (room.code)}
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
              onclick={() => navigate(`/r/${room.code}`, { via: 'public' })}
            >
              Join
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if hosted.length > 0 || past.length > 0}
    <div class="yours">
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
                <button type="button" class="small" onclick={() => navigate(`/r/${room}`)}
                  >Open</button
                >
                <button
                  type="button"
                  class="small"
                  aria-label={`Remove room ${room}`}
                  disabled={removing === room}
                  onclick={() => (confirming = room)}
                >
                  <Icon name="trash" />
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
              {@const place = winnerIn(game) ?? placeIn(game)}
              <li>
                <span class="name">
                  <span class="code-small">{game.code}</span>
                  <span class="when">{finishedTime(game.finishedAt)}</span>
                </span>
                <span class="actions">
                  {#if place !== null}
                    <span class="place">{place}</span>
                  {/if}
                  <button
                    type="button"
                    class="small"
                    aria-label={`Hi-scores for ${game.code}`}
                    onclick={() => navigate(historyPath(game))}
                  >
                    <Icon name="trophy" />
                  </button>
                  <button
                    type="button"
                    class="small"
                    aria-label={`Remove ${game.code} from past games`}
                    onclick={() => (confirmingPast = game)}
                  >
                    <Icon name="trash" />
                  </button>
                </span>
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
    </div>
  {/if}

  {#if suggesting || adminToken !== null}
    <section class="reldo" aria-labelledby="suggest-heading">
      <h2 id="suggest-heading" class="sr">Suggest or report a question</h2>
      <DialogueBox npc="reldo" name="Reldo" side="right">
        <p>Know a question we don't ask yet, or spotted a wrong answer or an outdated fact?</p>
        <div class="row">
          <button type="button" onclick={() => navigate('/suggest')}>Suggest a question</button>
          <button type="button" onclick={() => navigate('/report')}>Report a question</button>
          {#if adminToken !== null}
            <button type="button" onclick={() => navigate('/admin')}>
              Admin{pending ? ` (${pending})` : ''}
            </button>
          {/if}
        </div>
      </DialogueBox>
    </section>
  {/if}
{/snippet}

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
  /* Narrower than the page, so the theme's floor and its lights show at both sides. */
  .home {
    max-width: var(--home-width);
    margin-inline: auto;
  }

  .home > :global(.stage.speaks) {
    max-width: none;
    margin-bottom: 1.25rem;
  }

  /* Between Home and How to play the dialogue box stays; its speaker, its words and
     everything under it fade out (150 ms) and back in (200 ms). */
  .below,
  .home :global(.stage .stage-row),
  .home :global(.stage .speaker .bubble > *) {
    transition: opacity 200ms ease-out;
  }

  .fading .below,
  .fading :global(.stage .stage-row),
  .fading :global(.stage .speaker .bubble > *) {
    opacity: 0;
    transition-duration: 150ms;
  }

  @media (prefers-reduced-motion: reduce) {
    .below,
    .home :global(.stage .stage-row),
    .home :global(.stage .speaker .bubble > *) {
      transition: none;
    }
  }

  /* Join and Create beside the game modes, one over the other once two would be cramped. */
  .halves {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2px minmax(0, 1fr);
    gap: 1.75rem;
    padding-block: 0.5rem;
    text-align: start;
  }

  @media (max-width: 47.98rem) {
    .halves {
      grid-template-columns: minmax(0, 1fr);
    }

    .split {
      display: none;
    }
  }

  .split {
    background: repeating-linear-gradient(var(--scroll-edge) 0 6px, transparent 6px 11px);
    opacity: 0.6;
  }

  /* The sheet writes in Quill; its controls keep the page's face, as they do everywhere else. */
  .entry {
    display: grid;
    gap: 0.75rem;
    align-content: center;
    font-family: var(--font-body);
  }

  /* Join beside the field, or under it at full width once the field would be too short. */
  .join {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.6rem;
  }

  .join .field {
    flex: 999 1 16rem;
    min-width: 0;
    margin: 0;
    text-align: start;
  }

  .join button {
    flex: 1 0 auto;
  }

  .join input {
    min-height: 56px;
    font-family: 'RuneScape', var(--font-body);
    font-size: 1.35rem;
    line-height: 1;
  }

  @media (max-width: 26rem) {
    .join input {
      font-size: 1.1rem;
    }
  }

  .join input::placeholder {
    color: var(--muted);
    opacity: 0.6;
  }

  .entry .error,
  .entry .banner {
    margin: 0;
  }

  button.big {
    min-height: 56px;
    padding-inline: 1.5rem;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    border-top: 1px dashed currentColor;
  }

  .how-to {
    --ink: var(--scroll-ink);
    justify-self: center;
    padding: 0.35rem 0.25rem;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  /* Side by side when both have rows and there is room for two; one alone takes the width. */
  .yours {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 0 1.25rem;
    align-items: start;
  }

  .reldo .row {
    margin-top: 0.75rem;
    font-family: var(--font-body);
  }

  .code-small {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    letter-spacing: 0.08em;
    font-weight: 600;
  }

  .host {
    color: var(--muted);
    margin-left: 0.5rem;
  }

  /* Under the room code, and kept whole: a wide basis sends the row's buttons to a line of
     their own before the date would have to wrap. */
  .name {
    flex-basis: 11rem;
  }

  .when {
    display: block;
    color: var(--muted);
    white-space: nowrap;
  }

  .about {
    display: block;
    color: var(--muted);
    font-size: 0.9rem;
  }

  /* One unit, so a narrow row drops the place and both buttons together, never one alone. */
  .actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-left: auto;
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
    display: inline;
    white-space: normal;
  }
</style>
