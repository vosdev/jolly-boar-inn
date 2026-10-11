<script lang="ts">
  /**
   * The rounds, then one tap. One POST creates the room, its questions and you as its
   * admin, and the response carries your session — so this screen navigates straight
   * into the lobby, which is already the best "room created" screen there is: the code
   * to read out, the link to share, and the players arriving.
   *
   * A game mode is a round. Ticking three modes makes a three-round game, and each one
   * carries its own question count. The default and the range it is held to come from
   * `GET /api/modes`, which is the server's own mode registry — the form never invents a
   * number the server would refuse, and its steppers stop at it. How long a question
   * lasts is not the host's to set per round: each question's type says, and the room's
   * one pace scales every one of them.
   *
   * The rounds play in a random order unless the host numbers them: a quiz night is
   * rarely improved by always opening on the same round.
   *
   * Two tabs choose the rounds. Pick is the cards, with "Pick for me" ticking a number of
   * them at random for the host to adjust. Surprise sends only a number: the server draws
   * the modes, so not even the host's browser knows them, and the rounds stay hidden from
   * everyone until each starts. Their lengths are unknown here, so the events are counted
   * as the shortest draw would have them, which keeps the host's questions within reach.
   *
   * The host is the profile, name and pet, and the form never asks: the name lives in
   * the top bar. A browser with none is handled the way Join handles one: pressing
   * Create opens `NamePrompt` first, and what is confirmed becomes the profile and the
   * host's name. The room is not made until then.
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
    getModes,
    type ModePacing,
    type NewRoomSettings,
    type RoomAccess,
  } from '../lib/api'
  import CustomQuestions from '../components/CustomQuestions.svelte'
  import ModeCard from '../components/ModeCard.svelte'
  import NamePrompt from '../components/NamePrompt.svelte'
  import Segmented from '../components/Segmented.svelte'
  import Stepper from '../components/Stepper.svelte'
  import { eventSlots, overCap, type CustomQuestion } from '../lib/customQuestions'
  import { MODES, UPCOMING_MODES, modeLabel } from '../lib/modes'
  import { PACES } from '../lib/pace'
  import { profile, returningVisitor, saveProfile } from '../lib/profile'
  import { EVENT_EVERY, type EventFrequency, type ModeSettings, type Pace } from '../lib/protocol'
  import { atRoomLimit } from '../lib/roomLimit'
  import { rememberCreated, setSession } from '../lib/session'
  import { arrival, counted } from '../lib/stats'

  /** The server's cap on a room, over every round. `NewRoomSettings` checks the same. */
  const MAX_QUESTIONS = 100

  const OFF_ON = [
    { value: false, label: 'Off' },
    { value: true, label: 'On' },
  ]

  const ACCESS: { value: RoomAccess; label: string; note: string }[] = [
    { value: 'code', label: 'Room code', note: 'Anyone you give the room code to can join.' },
    {
      value: 'link',
      label: 'Invite link',
      note: "The room code alone won't let anyone in; they need the link, or be manually approved by you.",
    },
    {
      value: 'public',
      label: 'Public',
      note: "Listed on this site's homepage, where anyone can join it.",
    },
  ]

  let { navigate }: { navigate: (to: string) => void } = $props()

  /** Scales every question's time to answer and its reveal. */
  let pace = $state<Pace>('run')
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
  /** Whether the host picks the rounds or the server draws them unseen. */
  let choosing = $state<'pick' | 'surprise'>('pick')
  /** How many modes "Pick for me" ticks, or the server draws for a surprise. */
  let randomCount = $state(3)
  let access = $state<RoomAccess>('code')
  /** The rounds, in the order they will play: one per mode, and the list is the order. */
  let rounds = $state<ModeSettings[]>([])
  let customQuestions = $state<CustomQuestion[]>([])
  /** A question open in the editor, unsaved: submitting now would leave it behind. */
  let editingQuestion = $state(false)

  /** What the server will play and what it will accept for each, or null until it says. */
  let pacing = $state<ModePacing[] | null>(null)
  let pacingFailure = $state<string | null>(null)
  let busy = $state(false)
  /** A browser with no profile is being asked for one before the room is made. */
  let naming = $state(false)
  let failure = $state<string | null>(null)
  /** Whether this browser already hosts as many rooms as it may, or null until known. */
  let full = $state<boolean | null>(null)

  /** The modes a host can pick as rounds: every one with a round length to set. */
  const roundModes = $derived(pacing?.filter((mode) => mode.questions !== null) ?? [])
  /** Coming soon, minus any this server already plays: those are in `roundModes` instead. */
  const upcomingModes = $derived(
    UPCOMING_MODES.filter((mode) => !pacing?.some((entry) => entry.id === mode.id)),
  )
  const surprise = $derived(choosing === 'surprise')
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
  const tooManyOwn = $derived(overCap(customQuestions.length, eventCount, frequency, eventsAtMore))
  const ready = $derived(
    (surprise ? roundModes.length > 0 : rounds.length > 0) &&
      questionCount >= 1 &&
      (surprise || totalCount <= MAX_QUESTIONS) &&
      tooManyOwn === null &&
      !editingQuestion &&
      full === false,
  )

  onMount(async () => {
    void atRoomLimit().then((limited) => (full = limited))
    try {
      pacing = await getModes()
    } catch (error) {
      pacingFailure =
        error instanceof ApiFailure ? error.message : 'could not reach the server'
    }
  })

  /** A round of `mode` at that mode's own length, which is what ticking it gives you. */
  function roundFor(mode: ModePacing): ModeSettings {
    return { mode: mode.id, questions: mode.questions?.default ?? 1 }
  }

  function toggle(mode: ModePacing, on: boolean): void {
    // Click order, deliberately: the list is the running order, so a mode ticked last
    // plays last — until the host moves it, or hands the order to `random`.
    rounds = on
      ? [...rounds, roundFor(mode)]
      : rounds.filter((round) => round.mode !== mode.id)
  }

  /** Tick `randomRounds` modes at random in place of what was ticked, in a random order. */
  function pickForMe(): void {
    const shuffled = [...roundModes]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    rounds = shuffled.slice(0, randomRounds).map(roundFor)
  }

  function setRound(mode: string, questions: number): void {
    rounds = rounds.map((round) => (round.mode === mode ? { ...round, questions } : round))
  }

  /** Move round `index` one place `by` (-1 up, 1 down); the ends stay put. */
  function move(index: number, by: number): void {
    const to = index + by
    if (to < 0 || to >= rounds.length) return
    const moved = [...rounds]
    const [round] = moved.splice(index, 1)
    if (round === undefined) return
    moved.splice(to, 0, round)
    rounds = moved
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
    void create()
  }

  /** The prompt's answer is the profile before it is the host. */
  function named(name: string, pet: string): void {
    saveProfile(name, pet)
    naming = false
    void create()
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
      return
    }
    const settings: NewRoomSettings = {
      ...(surprise ? { surprise_modes: randomRounds } : { modes: rounds }),
      mode_order: surprise ? 'random' : modeOrder,
      random_event_frequency: frequency,
      pace,
      standings_seconds: standingsSeconds,
      close_when_all_answered: closeWhenAllAnswered,
      name_wrong_answers: nameWrongAnswers,
      hide_rounds: surprise || hideRounds,
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
      )
      counted(reporting)
      setSession(created.code, created.session)
      rememberCreated(created.code, created.expires_at)
      navigate(`/r/${created.code}`)
    } catch (error) {
      failure =
        error instanceof ApiFailure ? error.message : 'could not create the room, try again'
    } finally {
      busy = false
    }
  }
</script>

<section class="panel">
  <h1>Create a room</h1>
  <p class="tagline">Choose and configure the settings for your room. They cannot be changed once the room is created. After creation, rooms exist for up to 48 hours to let you prepare in time for a clan event.</p>
</section>

  {#if full === true}
    <p class="banner">
      You already have five rooms. Remove one on the <a href="/" onclick={goHome}>homepage</a>
      to make another.
    </p>
  {/if}

<form onsubmit={submit}>
  <section class="panel modes">
    <!-- Always the same furniture, so picking the first mode or dropping the last one
         never moves the cards under the host's pointer. -->
    <div class="head spread">
      <h2>Game modes</h2>
      <Segmented
        legend="Choose the rounds"
        hideLegend
        options={[
          { value: 'pick', label: 'Pick' },
          { value: 'surprise', label: 'Surprise' },
        ]}
        bind:value={choosing}
      />
    </div>
    {#if surprise}
      <p class="count">
        {randomRounds} surprise round{randomRounds === 1 ? '' : 's'}
      </p>
    {:else}
      <div class="head spread">
        <Stepper
          label="Pick for me"
          noun="modes to pick"
          value={randomRounds}
          min={1}
          max={randomMax}
          onchange={(value) => (randomCount = value)}
        />
        <button type="button" onclick={pickForMe} disabled={roundModes.length === 0}>
          Pick {randomRounds} at random
        </button>
      </div>
      <div class="head spread">
        <div class="summary">
          <p class="count" class:error={rounds.length === 0 || totalCount > MAX_QUESTIONS}>
            {#if pacing === null}
              &nbsp;
            {:else if rounds.length === 0}
              Pick at least one type; a room with no rounds is no game.
            {:else}
              {rounds.length} round{rounds.length === 1 ? '' : 's'}, {totalCount} question{totalCount ===
              1
                ? ''
                : 's'}{eventCount > 0
                ? ` (${questionCount} in the rounds, ${eventCount} random event${eventCount === 1 ? '' : 's'})`
                : ''}{totalCount > MAX_QUESTIONS ? `, over the ${MAX_QUESTIONS} cap` : ''}
            {/if}
          </p>
          <Segmented
            legend="Round order"
            options={[
              { value: 'listed', label: 'As numbered' },
              { value: 'random', label: 'Random' },
            ]}
            bind:value={modeOrder}
          />
        </div>
      </div>
    {/if}
    {#if pacingFailure !== null}
      <p class="error">{pacingFailure}</p>
    {:else if pacing === null}
      <p class="note">Loading the game modes…</p>
    {:else if surprise}
      <Stepper
        label="Surprise rounds"
        noun="surprise rounds"
        value={randomRounds}
        min={1}
        max={randomMax}
        onchange={(value) => (randomCount = value)}
      />
      <p class="note">
        The game modes are picked at random when the room is created. Nobody sees them, you
        included, until each round starts.
      </p>
    {:else}
      <ul class="cards">
        {#each roundModes as mode (mode.id)}
          {@const position = rounds.findIndex((round) => round.mode === mode.id)}
          <ModeCard
            id={mode.id}
            label={modeLabel(mode.id)}
            hint={MODES[mode.id]?.hint ?? null}
            round={rounds[position] ?? null}
            position={position < 0 ? null : position}
            count={rounds.length}
            shuffled={modeOrder === 'random'}
            questions={mode.questions}
            onpick={(on) => toggle(mode, on)}
            onset={(value) => setRound(mode.id, value)}
            onmove={(by) => move(position, by)}
          />
        {/each}
        {#each upcomingModes as mode (mode.id)}
          <ModeCard id={mode.id} label={mode.label} hint={mode.hint} host={mode.host} upcoming />
        {/each}
      </ul>
    {/if}
  </section>

  <section class="panel pace">
    <h2>Pace</h2>
    <Segmented legend="Pace" hideLegend options={PACES} bind:value={pace} />
    <p class="note">{PACES.find((option) => option.value === pace)?.note}</p>
  </section>

  <section class="panel events">
    <h2>Random events frequency</h2>
    <Segmented
      legend="Random events frequency"
      hideLegend
      options={[
        { value: 'less', label: 'Less' },
        { value: 'default', label: 'Default' },
        { value: 'more', label: 'More' },
      ]}
      bind:value={frequency}
    />
    <p class="note">
      An NPC interrupts on average once every {EVENT_EVERY[frequency]} questions, on top of the
      round's.
    </p>
    {#if surprise || rounds.length > 0}
      <p class="count">
        {surprise ? 'At least ' : ''}{eventCount} random event{eventCount === 1 ? '' : 's'} in this game
      </p>
    {/if}
    {#if tooManyOwn !== null}
      <p class="error">{tooManyOwn}</p>
    {/if}
  </section>

  <CustomQuestions
    bind:questions={customQuestions}
    bind:editing={editingQuestion}
    slots={eventCount}
    {frequency}
    atMore={eventsAtMore}
  />

  <section class="panel access">
    <h2>Who can join</h2>
    <Segmented legend="Access" hideLegend options={ACCESS} bind:value={access} />
    <p class="note">{ACCESS.find((option) => option.value === access)?.note}</p>
  </section>

  <details class="panel rest">
    <summary><h2>Advanced</h2></summary>
    <div class="settings">
      <Stepper
        label="Standings between rounds, seconds"
        noun="standings seconds"
        value={standingsSeconds}
        min={0}
        max={30}
        step={5}
        onchange={(value) => (standingsSeconds = value)}
      />
      <div>
        {#if surprise}
          <p class="note">Surprise rounds are always on when the modes are a surprise.</p>
        {:else}
          <Segmented legend="Surprise rounds" options={OFF_ON} bind:value={hideRounds} />
          <p class="note">Hide the game modes in the lobby from the players</p>
        {/if}
      </div>
      <Segmented
        legend="Close when everyone has answered"
        options={OFF_ON}
        bind:value={closeWhenAllAnswered}
      />
      <Segmented legend="Name who got it wrong" options={OFF_ON} bind:value={nameWrongAnswers} />
    </div>
  </details>

  <div class="row">
    {#if full !== true}
      <button class="primary" type="submit" disabled={busy || !ready}>
        {busy ? 'Creating…' : 'Create room'}
      </button>
    {/if}
    <button type="button" onclick={() => navigate('/')}>Back</button>
  </div>
  {#if editingQuestion && full !== true}
    <p class="note">Add or cancel the question you are writing before you create the room.</p>
  {/if}
  {#if failure !== null}
    <!-- A banner rather than a bare .error: this sits on the page, under the buttons,
         and a theme's page may be a floor --bad does not read against. -->
    <p class="banner bad" role="alert">{failure}</p>
  {/if}
</form>

{#if naming}
  <NamePrompt action="Create room" onConfirm={named} />
{/if}

<style>
  /* One card a row on a phone, two on a tablet, three once the page is wide enough. */
  .modes {
    container-type: inline-size;
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  @container (min-width: 34rem) {
    .cards {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @container (min-width: 52rem) {
    .cards {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .head {
    align-items: baseline;
    margin-bottom: 1rem;
  }

  .head h2,
  .head .error {
    margin: 0;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.25rem;
  }

  .count {
    margin: 0;
    font-weight: 700;
  }

  /* Two columns of settings where the page is wide, so a label and its control are not
     a whole panel apart. */
  .rest {
    container-type: inline-size;
  }

  .rest .settings {
    display: grid;
    gap: 0.9rem 2.5rem;
  }

  @container (min-width: 44rem) {
    .rest .settings {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .rest summary {
    cursor: pointer;
  }

  .rest summary h2 {
    display: inline;
  }

  .rest[open] summary {
    margin-bottom: 1rem;
  }

  .rest .note,
  .modes .note,
  .pace .note,
  .events .note,
  .events .count,
  .access .note {
    margin: 0.3rem 0 0;
  }
</style>
