<script lang="ts">
  /**
   * The rounds, the rules, the random events, then one tap. One POST creates the room,
   * its questions and you as its admin, and the response carries your session — so this
   * screen navigates straight into the lobby, which is already the best "room created"
   * screen there is: the code to read out, the link to share, and the players arriving.
   *
   * It is a few steps rather than one long page, each with a sensible default, so a new
   * host can create from any of them. A phone has three: Rounds, Rules, Random events. A
   * wider screen puts the rounds picked and the house rules beside the hosts, so it has
   * two. Every step stays mounted and only hides, so nothing set on one is lost by
   * moving to another, a question half written included.
   *
   * A game mode is a round, presented by its host. Ticking three hosts makes a three-round
   * game, and each round carries its own question count. The default and the range it is
   * held to come from `GET /api/modes`, which is the server's own mode registry — the form
   * never invents a number the server would refuse, and its steppers stop at it. How long
   * a question lasts is not the host's to set per round: each question's type says, and
   * the room's one pace scales every one of them.
   *
   * The rounds play in a random order unless the host puts them in order: a quiz night is
   * rarely improved by always opening on the same round.
   *
   * "Pick for me" asks how many modes and whether to keep them a surprise. Without the
   * surprise it ticks that many cards at random for the host to adjust. With it the cards
   * fold away and the form sends only the number: the server draws the modes, so not even
   * the host's browser knows them, and the rounds stay hidden from everyone until each
   * starts. Their lengths are unknown here, so the events are counted as the shortest draw
   * would have them, which keeps the host's questions within reach.
   *
   * The host is the profile, name and pet, and the form never asks: the name lives in
   * the top bar. A browser with none is handled the way Join handles one: pressing
   * Create opens `NamePrompt` first, and what is confirmed becomes the profile and the
   * host's name. On a phone `CreateSheet` follows, with the room code, which is too long
   * for a phone's header. The room is not made until then.
   *
   * `/api/modes` lists `custom` and `random_event` too, with no round length: their
   * questions are never a round but random events, an NPC interrupting a round with one
   * question and leaving. So the form offers every mode but those two. How often that
   * happens is the host's one choice about events: once per 20, 10 or 5 round questions,
   * on top of the rounds, so the total the form shows counts them. There is no "never";
   * "less often" is the quiet end. The host's own questions (`CustomQuestions`) each take
   * one of those events, so the form will not submit more of them than there are, nor
   * while one is still open in the editor, where it would be lost.
   */
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'

  import {
    ApiFailure,
    createRoom,
    getFreeCode,
    getModes,
    type ModeBounds,
    type ModePacing,
    type NewRoomSettings,
    type RoomAccess,
  } from '../lib/api'
  import CreateSheet from '../components/CreateSheet.svelte'
  import CreateSteps from '../components/CreateSteps.svelte'
  import CustomQuestions from '../components/CustomQuestions.svelte'
  import HouseRules from '../components/HouseRules.svelte'
  import ModeCard from '../components/ModeCard.svelte'
  import NamePrompt from '../components/NamePrompt.svelte'
  import PickForMe from '../components/PickForMe.svelte'
  import RandomEvents from '../components/RandomEvents.svelte'
  import RoundList from '../components/RoundList.svelte'
  import TeamPicker from '../components/TeamPicker.svelte'
  import { FREQUENCY_LABELS, eventSlots, overCap, type HostQuestion } from '../lib/customQuestions'
  import { minutes, plannedSeconds } from '../lib/duration'
  import { MODES, UPCOMING_MODES, hostOf, modeLabel } from '../lib/modes'
  import { npcArt } from '../lib/npcs'
  import { PACES } from '../lib/pace'
  import { profile, returningVisitor, saveProfile } from '../lib/profile'
  import {
    EVENT_EVERY,
    type Difficulty,
    type EventFrequency,
    type ModeSettings,
    type Pace,
  } from '../lib/protocol'
  import { atRoomLimit } from '../lib/roomLimit'
  import { MIN_TEAMS, type TeamId } from '../lib/teams'
  import { rememberCreated, setSession } from '../lib/session'
  import { arrival, counted } from '../lib/stats'

  /** The server's cap on a room, over every round. `NewRoomSettings` checks the same. */
  const MAX_QUESTIONS = 100

  /** Below this a screen is a phone: the steps split, and the code moves to the sheet. */
  const NARROW = '(max-width: 49.99rem)'

  const ACCESS_LABELS: Record<RoomAccess, string> = {
    code: 'Room code',
    link: 'Invite link',
    public: 'Public',
  }

  type Stage = 'rounds' | 'rules' | 'events'

  let { navigate }: { navigate: (to: string) => void } = $props()

  /** Scales every question's time to answer and its reveal. */
  let pace = $state<Pace>('run')
  /** Which question tiers the rounds draw first; random events take any. */
  let difficulty = $state<Difficulty>('mixed')
  /** How long the standings hold between rounds; 0 runs the rounds straight on. */
  let standingsSeconds = $state(10)
  /** How often an NPC interrupts a round: one per 20, 10 or 5 round questions. */
  let frequency = $state<EventFrequency>('default')
  let modeOrder = $state<'listed' | 'random'>('random')
  let closeWhenAllAnswered = $state(true)
  /** List who got it wrong under each reveal. The count of who got it right always shows. */
  let nameWrongAnswers = $state(true)
  /** Players learn each round's mode as it starts; the server holds the rest back. */
  let hideRounds = $state(false)
  /** The server draws the rounds unseen, rather than the host picking them. */
  let surprise = $state(false)
  /** How many modes "Pick for me" last ticked or asked the server to draw. */
  let randomCount = $state(4)
  let pickingForMe = $state(false)
  let access = $state<RoomAccess>('code')
  /** The rounds, in the order they will play: one per mode, and the list is the order. */
  let rounds = $state<ModeSettings[]>([])
  let customQuestions = $state<HostQuestion[]>([])
  /** A team game, and its gods in `TEAMS` order; Saradomin and Zamorak to begin with. */
  let teamGame = $state(false)
  let gods = $state<TeamId[]>(['saradomin', 'zamorak'])
  /** A question open in the editor, unsaved: submitting now would leave it behind. */
  let editingQuestion = $state(false)

  let narrow = $state(window.matchMedia(NARROW).matches)
  let stage = $state<Stage>('rounds')
  let intro = $state<HTMLElement | null>(null)

  /** What the server will play and what it will accept for each, or null until it says. */
  let pacing = $state<ModePacing[] | null>(null)
  let pacingFailure = $state<string | null>(null)
  let busy = $state(false)
  /** A browser with no profile is being asked for one before the room is made. */
  let naming = $state(false)
  /** A phone is showing the room code for a last look before the room is made. */
  let confirming = $state(false)
  let failure = $state<string | null>(null)
  /** The code the room will get, or null if the server could not hand one out: it draws then. */
  let code = $state<string | null>(null)
  let rerollHeld = $state(false)
  let rerollTimer: ReturnType<typeof setTimeout> | undefined
  /** Whether this browser already hosts as many rooms as it may, or null until known. */
  let full = $state<boolean | null>(null)

  /** The modes a host can pick as rounds: every one with a round length to set. */
  const roundModes = $derived(pacing?.filter((mode) => mode.questions !== null) ?? [])
  const bounds = $derived(
    Object.fromEntries(roundModes.map((mode) => [mode.id, mode.questions])) as Record<
      string,
      ModeBounds
    >,
  )
  /** Coming soon, minus any this server already plays: those are in `roundModes` instead. */
  const upcomingModes = $derived(
    UPCOMING_MODES.filter((mode) => !pacing?.some((entry) => entry.id === mode.id)),
  )
  /** At most every mode there is to draw, and at least one. */
  const randomMax = $derived(Math.max(1, roundModes.length))
  const randomRounds = $derived(Math.min(randomCount, randomMax))
  /** The shortest rounds a surprise could draw: the events counted are the fewest it gets. */
  const shortestDraw = $derived(
    roundModes
      .map((mode) => mode.questions?.default ?? 1)
      .sort((a, b) => a - b)
      .slice(0, randomRounds),
  )
  const lengths = $derived(surprise ? shortestDraw : rounds.map((round) => round.questions))
  const questionCount = $derived(lengths.reduce((total, length) => total + length, 0))
  /**
   * The events the room adds to that, counted as the server counts them (`eventSlots`).
   * They are questions the room will play, so they are in the total and under the cap.
   */
  const eventCount = $derived(eventSlots(lengths, EVENT_EVERY[frequency]))
  const totalCount = $derived(questionCount + eventCount)
  const eventsAtMore = $derived(eventSlots(lengths, EVENT_EVERY.more))
  const typical = $derived<Record<string, number | null>>(
    Object.fromEntries((pacing ?? []).map((mode) => [mode.id, mode.seconds?.[pace] ?? null])),
  )
  /** A surprise's rounds are unknown here, so each counts as an average offered round. */
  const averageRound = $derived.by(() => {
    const known = roundModes.flatMap((mode) => typical[mode.id] ?? [])
    return known.length === 0 ? 0 : known.reduce((total, s) => total + s, 0) / known.length
  })
  const duration = $derived(
    minutes(
      plannedSeconds(
        surprise
          ? lengths.map((questions) => ({ questions, seconds: averageRound }))
          : rounds.map((round) => ({
              questions: round.questions,
              seconds: typical[round.mode] ?? 0,
            })),
        eventCount,
        typical.random_event ?? averageRound,
        standingsSeconds,
        nameWrongAnswers,
      ),
    ),
  )
  const tooManyOwn = $derived(overCap(customQuestions.length, eventCount, frequency, eventsAtMore))
  /** What stops the room being made, in words, or null when nothing does. */
  const problem = $derived(
    pacing === null
      ? null
      : !surprise && rounds.length === 0
        ? 'Pick at least one host; a room with no rounds is no game.'
        : !surprise && totalCount > MAX_QUESTIONS
          ? `${totalCount} questions, over the ${MAX_QUESTIONS} cap.`
          : teamGame && gods.length < MIN_TEAMS
            ? 'Tick at least two gods for a team game.'
            : (tooManyOwn ??
              (editingQuestion
                ? 'Add or cancel the question you are writing before you create the room.'
                : null)),
  )
  const ready = $derived(
    pacing !== null &&
      (surprise ? roundModes.length > 0 : rounds.length > 0) &&
      problem === null &&
      full === false,
  )
  const roundsWord = $derived(
    surprise
      ? `${randomRounds} surprise round${randomRounds === 1 ? '' : 's'}`
      : `${rounds.length} round${rounds.length === 1 ? '' : 's'}`,
  )
  const tally = $derived(
    `${questionCount} question${questionCount === 1 ? '' : 's'} in the rounds` +
      (eventCount > 0 ? `, plus ${eventCount} random event${eventCount === 1 ? '' : 's'}.` : '.'),
  )
  const paceLabel = $derived(PACES.find((option) => option.value === pace)?.label ?? pace)

  const steps = $derived<{ id: Stage; label: string }[]>(
    narrow
      ? [
          { id: 'rounds', label: 'Rounds' },
          { id: 'rules', label: 'Rules' },
          { id: 'events', label: 'Random events' },
        ]
      : [
          { id: 'rounds', label: 'Rounds & rules' },
          { id: 'events', label: 'Random events' },
        ],
  )
  /** A wide screen shows the rules beside the rounds, so Rules is its first step. */
  const shown = $derived<Stage>(!narrow && stage === 'rules' ? 'rounds' : stage)
  const current = $derived(steps.findIndex((step) => step.id === shown))
  const next = $derived(steps[current + 1] ?? null)

  onMount(() => {
    const query = window.matchMedia(NARROW)
    const change = (event: MediaQueryListEvent): void => {
      narrow = event.matches
      if (!narrow) confirming = false
    }
    query.addEventListener('change', change)
    void atRoomLimit().then((limited) => (full = limited))
    void reroll()
    void getModes().then(
      (modes) => (pacing = modes),
      (error: unknown) =>
        (pacingFailure =
          error instanceof ApiFailure ? error.message : 'could not reach the server'),
    )
    return () => {
      query.removeEventListener('change', change)
      clearTimeout(rerollTimer)
    }
  })

  async function reroll(): Promise<void> {
    try {
      code = await getFreeCode()
    } catch (error) {
      // A rate-limited or failed reroll keeps the code already shown.
      if (error instanceof ApiFailure && error.retryAfterMs !== undefined) {
        rerollHeld = true
        clearTimeout(rerollTimer)
        rerollTimer = setTimeout(() => (rerollHeld = false), error.retryAfterMs)
      }
    }
  }

  /** A round of `mode` at that mode's own length, which is what ticking it gives you. */
  function roundFor(mode: ModePacing): ModeSettings {
    return { mode: mode.id, questions: mode.questions?.default ?? 1 }
  }

  function toggle(mode: ModePacing, on: boolean): void {
    // Click order, deliberately: the list is the running order, so a mode ticked last
    // plays last — until the host moves it, or hands the order to `random`.
    rounds = on ? [...rounds, roundFor(mode)] : rounds.filter((round) => round.mode !== mode.id)
  }

  /** Draw `count` modes for the server to keep secret, or tick that many in place of the ticked. */
  function pickForMe(count: number, secret: boolean): void {
    pickingForMe = false
    randomCount = count
    surprise = secret
    if (secret) return
    const shuffled = [...roundModes]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    rounds = shuffled.slice(0, count).map(roundFor)
  }

  /** A step starts at its top, not wherever the last one was scrolled to. */
  function go(to: Stage): void {
    stage = to
    intro?.scrollIntoView?.({ block: 'start' })
  }

  function back(): void {
    const previous = steps[current - 1]
    if (previous === undefined) navigate('/')
    else go(previous.id)
  }

  function goHome(event: MouseEvent): void {
    // A modified click is somebody asking for a new tab; let the browser have it.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate('/')
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (busy || !ready) return
    if (get(profile) === null) {
      naming = true
      return
    }
    proceed()
  }

  /** The prompt's answer is the profile before it is the host. */
  function named(name: string, pet: string): void {
    saveProfile(name, pet)
    naming = false
    proceed()
  }

  function proceed(): void {
    failure = null
    if (narrow) confirming = true
    else void create()
  }

  async function create(): Promise<void> {
    const host = get(profile)
    if (host === null) return
    busy = true
    failure = null
    // Another tab may have created a room since this one loaded.
    if (await atRoomLimit()) {
      full = true
      busy = false
      confirming = false
      return
    }
    const settings: NewRoomSettings = {
      ...(surprise ? { surprise_modes: randomRounds } : { modes: rounds }),
      mode_order: surprise ? 'random' : modeOrder,
      random_event_frequency: frequency,
      pace,
      difficulty,
      standings_seconds: standingsSeconds,
      close_when_all_answered: closeWhenAllAnswered,
      name_wrong_answers: nameWrongAnswers,
      hide_rounds: surprise || hideRounds,
      teams: teamGame ? gods : [],
    }
    try {
      const reporting = arrival()
      const created = await createRoom(
        host.name,
        settings,
        host.pet,
        returningVisitor,
        access,
        customQuestions,
        reporting,
        code ?? undefined,
      )
      counted(reporting)
      setSession(created.code, created.session)
      rememberCreated(created.code, created.expires_at)
      navigate(`/r/${created.code}`)
    } catch (error) {
      failure =
        error instanceof ApiFailure && error.code === 'code_taken'
          ? 'That code was just taken — roll a new one.'
          : error instanceof ApiFailure
            ? error.message
            : 'could not create the room, try again'
    } finally {
      busy = false
    }
  }
</script>

{#snippet rerollIcon()}
  <svg class="icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" />
  </svg>
{/snippet}

{#snippet footer()}
  <div class="footer">
    {#if problem !== null}
      <p class="status error">{problem}</p>
    {:else if pacing !== null}
      <p class="status">
        <b>{roundsWord} · {surprise ? 'at least ' : ''}{totalCount} questions · {duration}</b>
      </p>
    {/if}
    <div class="buttons">
      <button type="button" onclick={back}>Back</button>
      {#if full !== true}
        {#if next !== null}
          <button type="submit" class="now" disabled={busy || !ready}>Create now</button>
          <button type="button" class="primary" onclick={() => go(next.id)}>
            Next: {next.label}
          </button>
        {:else}
          <button type="submit" class="primary" disabled={busy || !ready}>
            {busy ? 'Creating…' : 'Create room'}
          </button>
        {/if}
      {/if}
    </div>
    {#if !narrow && full !== true}
      <p class="note final">Its settings are final once the room is open.</p>
    {/if}
    {#if failure !== null && !confirming}
      <!-- A banner rather than a bare .error: a theme's page may be a floor --bad
           does not read against. -->
      <p class="banner bad">{failure}</p>
    {/if}
  </div>
{/snippet}

<form class="create" class:narrow onsubmit={submit}>
  <section class="panel intro" bind:this={intro}>
    <div class="title">
      <h1>Create a room</h1>
      {#if !narrow}<p class="tagline">Kept for 48 hours, ready for clan night.</p>{/if}
    </div>
    <CreateSteps
      steps={steps.map((step) => step.label)}
      {current}
      onpick={(index) => go(steps[index]!.id)}
    />
    {#if !narrow && code !== null && full !== true}
      <div class="code-line">
        <span class="note">Room code</span>
        <span class="roomcode">
          <b>{code}</b>
          <button
            type="button"
            class="reroll"
            aria-label="Reroll"
            onclick={reroll}
            disabled={busy || rerollHeld}
          >
            {@render rerollIcon()}
          </button>
        </span>
      </div>
    {/if}
  </section>

  {#if full === true}
    <p class="banner">
      You already have five rooms. Remove one on the <a href="/" onclick={goHome}>homepage</a>
      to make another.
    </p>
  {/if}

  <div class="columns">
    <div class="main">
      <section class="panel hosts" hidden={shown !== 'rounds'} aria-labelledby="hosts-title">
        <div class="spread head">
          <div>
            <h2 id="hosts-title">Who's hosting tonight?</h2>
            <p class="note">Each host brings one round.</p>
          </div>
          {#if !surprise}
            <button
              type="button"
              onclick={() => (pickingForMe = true)}
              disabled={roundModes.length === 0}>Pick for me</button
            >
          {/if}
        </div>
        {#if pacingFailure !== null}
          <p class="error">{pacingFailure}</p>
        {:else if pacing === null}
          <p class="note">Loading the game modes…</p>
        {:else if surprise}
          <div class="spread">
            <p class="count">
              {roundsWord}, drawn when the room is created
            </p>
            <button type="button" onclick={() => (pickingForMe = true)}>Change</button>
          </div>
          <p class="note">Nobody sees them, you included, until each round starts.</p>
        {:else}
          <ul class="cards">
            {#each roundModes as mode (mode.id)}
              <ModeCard
                id={mode.id}
                label={modeLabel(mode.id)}
                hint={MODES[mode.id]?.hint ?? null}
                picked={rounds.some((round) => round.mode === mode.id)}
                onpick={(on) => toggle(mode, on)}
              />
            {/each}
          </ul>
        {/if}
        {#if upcomingModes.length > 0}
          <div class="soon">
            <h3>Coming soon</h3>
            <ul>
              {#each upcomingModes as mode (mode.id)}
                {@const art = npcArt(mode.host)}
                <li class="upcoming">
                  <img class={art.cut} src={art.url} alt="" draggable="false" />
                  <span>{mode.label}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </section>

      <div class="events" hidden={shown !== 'events'}>
        <RandomEvents bind:frequency slots={eventCount} atLeast={surprise} own={customQuestions} />
        <CustomQuestions
          bind:questions={customQuestions}
          bind:editing={editingQuestion}
          slots={eventCount}
          {frequency}
          atMore={eventsAtMore}
          sheet={narrow}
        />
      </div>
    </div>

    <aside class="side">
      <div class="setup" hidden={narrow ? stage !== 'rules' : shown !== 'rounds'}>
        <RoundList
          bind:rounds
          bind:order={modeOrder}
          {bounds}
          surprise={surprise ? randomRounds : null}
          {tally}
        />
        <HouseRules
          bind:pace
          bind:difficulty
          bind:access
          bind:standingsSeconds
          bind:hideRounds
          bind:closeWhenAllAnswered
          bind:nameWrongAnswers
          {surprise}
        />
        <TeamPicker bind:on={teamGame} bind:picked={gods} />
      </div>

      {#if !narrow}
        <section class="panel tonight" hidden={shown !== 'events'} aria-labelledby="tonight-title">
          <div class="spread">
            <h2 id="tonight-title">Tonight</h2>
            <button type="button" class="link" onclick={() => go('rounds')}>Change</button>
          </div>
          {#if surprise}
            <p class="count">{roundsWord}</p>
          {:else}
            <ol class="mini">
              {#each rounds as round, index (round.mode)}
                {@const art = npcArt(hostOf(round.mode).host.id)}
                <li>
                  <img class={art.cut} src={art.url} alt="" />
                  <span
                    >{modeOrder === 'listed' ? `${index + 1} · ` : ''}{modeLabel(round.mode)}</span
                  >
                  <span class="note">{round.questions}</span>
                </li>
              {/each}
            </ol>
          {/if}
          <dl>
            <div>
              <dt>Pace</dt>
              <dd>{paceLabel}</dd>
            </div>
            <div>
              <dt>Who can join</dt>
              <dd>{ACCESS_LABELS[access]}</dd>
            </div>
            <div>
              <dt>Random events</dt>
              <dd>{FREQUENCY_LABELS[frequency]} · {eventCount}</dd>
            </div>
          </dl>
        </section>
      {/if}

      {#if !narrow}{@render footer()}{/if}
    </aside>
  </div>
  {#if narrow}{@render footer()}{/if}
</form>

{#if pickingForMe}
  <PickForMe
    count={randomCount}
    max={randomMax}
    {surprise}
    onPick={pickForMe}
    onCancel={() => (pickingForMe = false)}
  />
{/if}

{#if naming}
  <NamePrompt action={narrow ? 'Continue' : 'Create room'} onConfirm={named} />
{/if}

{#if confirming}
  <CreateSheet
    {code}
    modes={surprise ? [] : rounds.map((round) => round.mode)}
    surprise={surprise ? randomRounds : null}
    questions={totalCount}
    details="{paceLabel} pace · {eventCount} random event{eventCount === 1 ? '' : 's'} · {duration}"
    {busy}
    held={rerollHeld}
    {failure}
    onreroll={reroll}
    onconfirm={() => void create()}
    oncancel={() => (confirming = false)}
  />
{/if}

<style>
  .intro {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem 1.5rem;
  }

  .intro :global(.steps) {
    flex: 1 1 16rem;
    max-width: 26rem;
  }

  .narrow .intro {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .narrow .intro :global(.steps) {
    flex: none;
    max-width: none;
  }

  .intro h1 {
    margin: 0;
  }

  .narrow .intro h1 {
    font-size: 1.4rem;
  }

  .code-line {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .roomcode {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.2rem 0 0.75rem;
    min-height: 2.75rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
  }

  .roomcode b {
    font-family: var(--font-display);
    font-size: 1.1rem;
    white-space: nowrap;
  }

  .reroll {
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
  }

  .icon {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Hosts on the left, what they add up to on the right; one column on a phone. */
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 23rem;
    gap: 1.25rem;
    align-items: start;
  }

  .narrow .columns {
    display: block;
  }

  .side {
    position: sticky;
    top: 1rem;
  }

  .narrow .side {
    position: static;
  }

  [hidden] {
    display: none !important;
  }

  .head {
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .head h2,
  .head .note {
    margin: 0;
  }

  .head .note {
    margin-top: 0.2rem;
  }

  .hosts {
    container-type: inline-size;
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  @container (min-width: 36rem) {
    .cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.65rem;
    }
  }

  @container (min-width: 48rem) {
    .cards {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .count {
    margin: 0;
    font-weight: 700;
  }

  .soon {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-top: 1rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }

  .soon h3 {
    margin: 0;
    font-size: 0.9rem;
  }

  .soon ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .upcoming {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .upcoming img {
    height: 1.75rem;
    opacity: 0.55;
    filter: grayscale(0.4);
  }

  .upcoming .render {
    width: 1.75rem;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  .tonight .spread h2 {
    margin: 0;
  }

  .mini {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
  }

  .mini li {
    display: grid;
    grid-template-columns: 1.9rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.25rem;
  }

  .mini img {
    display: block;
    max-width: 1.75rem;
    max-height: 2rem;
  }

  .mini .render {
    aspect-ratio: 1;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  dl {
    margin: 0.5rem 0 0;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    min-height: 2.1rem;
    align-items: center;
    border-top: 1px solid var(--line);
  }

  dd {
    margin: 0;
    color: var(--muted);
  }

  /* On a phone the step's buttons ride the bottom of the screen; on a wide one they end
     the column beside the hosts. Either way they sit on a panel, since the page floor
     may be one no ink reads on. */
  .footer {
    padding: calc(0.75rem - var(--border-give)) calc(1rem - var(--border-give));
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    --ink: var(--surface-ink);
    --muted: var(--surface-muted);
    color: var(--ink);
  }

  .narrow .footer {
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin-inline: -1rem;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
    border-width: var(--border-width) 0 0;
    border-radius: 0;
  }

  .status {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
  }

  .status.error {
    margin-top: 0;
  }

  /* Three buttons do not always fit a phone or the side column; then Next takes a row of
     its own under the other two, where a thumb finds it. */
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .buttons > * {
    flex: 1 0 auto;
  }

  .buttons button {
    min-height: 2.75rem;
    padding-inline: calc(0.7rem - var(--border-give));
    white-space: nowrap;
  }

  .final {
    margin: 0.5rem 0 0;
  }

  .footer .banner {
    margin: 0.75rem 0 0;
  }
</style>
