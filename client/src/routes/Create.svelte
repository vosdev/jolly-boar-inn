<script lang="ts">
  /**
   * The rounds, then one tap. One POST creates the room, its questions and you as its
   * admin, and the response carries your session — so this screen navigates straight
   * into the lobby, which is already the best "room created" screen there is: the code
   * to read out, the link to share, and the players arriving.
   *
   * A game mode is a round. Ticking three modes makes a three-round game, and each one
   * carries its own length and its own question count, because the modes differ in pace:
   * `more_less` is two names and one word to read, so its round runs long and quick,
   * where a release-date round is short and slow. The defaults and the ranges those
   * numbers are held to come from `GET /api/modes`, which is the server's own mode
   * registry — the form never invents a number the server would refuse, and its
   * steppers stop at them.
   *
   * The rounds play in a random order unless the host numbers them: a quiz night is
   * rarely improved by always opening on the same round.
   *
   * The host is the profile, name and head, and the form never asks: the name lives in
   * the top bar. A browser with none is handled the way Join handles one: it is given a
   * generated name and head, which become its profile, and the chip nudges it once in
   * the lobby. Nothing stands between a first-time host and their room.
   *
   * `/api/modes` lists `custom` and `random_event` too, with no round length: their
   * questions are never a round but random events, an NPC interrupting a round with one
   * question and leaving. So the form offers every mode but those two. How often that
   * happens is the host's one choice about events: once per 20, 10 or 5 round questions,
   * on top of the rounds, so the total the form shows counts them. There is no "never";
   * "less often" is the quiet end. Writing the host's own questions is the editor's job
   * (T30); until it lands `custom_questions` is always the empty list `api.createRoom`
   * sends, and every event is an NPC asking a question of their own.
   */
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'

  import {
    ApiFailure,
    createRoom,
    getModes,
    type ModePacing,
    type NewRoomSettings,
  } from '../lib/api'
  import ModeCard from '../components/ModeCard.svelte'
  import Segmented from '../components/Segmented.svelte'
  import Stepper from '../components/Stepper.svelte'
  import { randomHead } from '../lib/heads'
  import { MODES, UPCOMING_MODES, modeLabel } from '../lib/modes'
  import { generateName } from '../lib/names'
  import { nudge, profile, returningVisitor, saveProfile } from '../lib/profile'
  import { EVENT_EVERY, type EventFrequency, type ModeSettings } from '../lib/protocol'
  import { atRoomLimit } from '../lib/roomLimit'
  import { rememberCreated, setSession } from '../lib/session'

  /** The server's cap on a room, over every round. `NewRoomSettings` checks the same. */
  const MAX_QUESTIONS = 100

  const OFF_ON = [
    { value: false, label: 'Off' },
    { value: true, label: 'On' },
  ]

  let { navigate }: { navigate: (to: string) => void } = $props()

  let revealSeconds = $state(3)
  /** How long the standings hold between rounds (D9); 0 runs the rounds straight on. */
  let standingsSeconds = $state(10)
  /** `splash_seconds` on the wire: 0 is off, anything else on (D7: it is no longer a length). */
  let introduceRounds = $state(true)
  /** How often an NPC interrupts a round: one per 20, 10 or 5 round questions. */
  let frequency = $state<EventFrequency>('default')
  let modeOrder = $state<'listed' | 'random'>('random')
  let closeWhenAllAnswered = $state(true)
  /** List who got it wrong under each reveal (D8). The count of who got it right always shows. */
  let nameWrongAnswers = $state(false)
  /** Players learn each round's mode as it starts; the server holds the rest back. */
  let hideRounds = $state(false)
  /** The rounds, in the order they will play: one per mode, and the list is the order. */
  let rounds = $state<ModeSettings[]>([])

  /** What the server will play and what it will accept for each, or null until it says. */
  let pacing = $state<ModePacing[] | null>(null)
  let pacingFailure = $state<string | null>(null)
  let busy = $state(false)
  let failure = $state<string | null>(null)
  /** Whether this browser already hosts as many rooms as it may, or null until known. */
  let full = $state<boolean | null>(null)

  /** The modes a host can pick as rounds: every one with a round length to set. */
  const roundModes = $derived(pacing?.filter((mode) => mode.questions !== null) ?? [])
  /** Coming soon, minus any this server already plays: those are in `roundModes` instead. */
  const upcomingModes = $derived(
    UPCOMING_MODES.filter((mode) => !pacing?.some((entry) => entry.id === mode.id)),
  )
  const questionCount = $derived(rounds.reduce((total, round) => total + round.questions, 0))
  /**
   * The events the room adds to that, counted as the server counts them: one per whole
   * `EVENT_EVERY` round questions. They are questions the room will play, so they are in
   * the total and under the cap.
   */
  const eventCount = $derived(Math.floor(questionCount / EVENT_EVERY[frequency]))
  const totalCount = $derived(questionCount + eventCount)
  const ready = $derived(
    rounds.length > 0 && questionCount >= 1 && totalCount <= MAX_QUESTIONS && full === false,
  )

  onMount(async () => {
    void atRoomLimit().then((limited) => (full = limited))
    try {
      pacing = await getModes()
      rounds = roundModes.map(roundFor)
    } catch (error) {
      pacingFailure =
        error instanceof ApiFailure ? error.message : 'could not reach the server'
    }
  })

  /** A round of `mode` at that mode's own pace, which is what ticking it gives you. */
  function roundFor(mode: ModePacing): ModeSettings {
    return {
      mode: mode.id,
      questions: mode.questions?.default ?? 1,
      seconds: mode.seconds?.default ?? 1,
    }
  }

  function toggle(mode: ModePacing, on: boolean): void {
    // Click order, deliberately: the list is the running order, so a mode ticked last
    // plays last — until the host moves it, or hands the order to `random`.
    rounds = on
      ? [...rounds, roundFor(mode)]
      : rounds.filter((round) => round.mode !== mode.id)
  }

  function setRound(mode: string, field: 'questions' | 'seconds', value: number): void {
    rounds = rounds.map((round) => (round.mode === mode ? { ...round, [field]: value } : round))
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

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (busy || !ready) return
    busy = true
    failure = null
    // Another tab may have created a room since this one loaded.
    if (await atRoomLimit()) {
      full = true
      busy = false
      return
    }
    const settings: NewRoomSettings = {
      modes: rounds,
      mode_order: modeOrder,
      random_event_frequency: frequency,
      reveal_seconds: revealSeconds,
      splash_seconds: introduceRounds ? 8 : 0,
      standings_seconds: standingsSeconds,
      close_when_all_answered: closeWhenAllAnswered,
      name_wrong_answers: nameWrongAnswers,
      hide_rounds: hideRounds,
    }
    const saved = get(profile)
    const host = saved ?? { name: generateName(), head: randomHead() }
    try {
      const created = await createRoom(host.name, settings, host.head, returningVisitor)
      setSession(created.code, created.session)
      rememberCreated(created.code, created.expires_at)
      // Only once the room exists, so a failed create leaves a browser that is still
      // nudged when it does get one.
      if (saved === null) {
        saveProfile(host.name, host.head)
        nudge.set(created.code)
      }
      navigate(`/r/${created.code}`)
    } catch (error) {
      failure =
        error instanceof ApiFailure ? error.message : 'could not create the room, try again'
    } finally {
      busy = false
    }
  }
</script>

<h1>Create a room</h1>
<p class="tagline">Choose and configure the settings for your room. They cannot be changed once the room is created.</p>

<form onsubmit={submit}>
  <section class="panel modes">
    <!-- Always the same furniture, so picking the first mode or dropping the last one
         never moves the cards under the host's pointer. -->
    <div class="head spread">
      <h2>Game modes</h2>
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
    {#if pacingFailure !== null}
      <p class="error">{pacingFailure}</p>
    {:else if pacing === null}
      <p class="note">Loading the game modes…</p>
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
            seconds={mode.seconds}
            onpick={(on) => toggle(mode, on)}
            onset={(field, value) => setRound(mode.id, field, value)}
            onmove={(by) => move(position, by)}
          />
        {/each}
        {#each upcomingModes as mode (mode.id)}
          <ModeCard id={mode.id} label={mode.label} hint={mode.hint} upcoming />
        {/each}
      </ul>
    {/if}
  </section>

  <section class="panel rest">
    <h2>The rest of the game</h2>
    <div class="settings">
      <Stepper
        label="Reveal answers, seconds"
        noun="reveal seconds"
        value={revealSeconds}
        min={2}
        max={30}
        onchange={(value) => (revealSeconds = value)}
      />
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
        <Segmented
          legend="Random events frequency"
          options={[
            { value: 'less', label: 'Less' },
            { value: 'default', label: 'Default' },
            { value: 'more', label: 'More' },
          ]}
          bind:value={frequency}
        />
        <p class="note">
          An NPC interrupts on average once every {EVENT_EVERY[frequency]} questions, on top of
          the round's.
        </p>
      </div>
      <Segmented legend="Introduce each round" options={OFF_ON} bind:value={introduceRounds} />
      <div>
        <Segmented legend="Surprise rounds" options={OFF_ON} bind:value={hideRounds} />
        <p class="note">Hide the game modes in the lobby from the players</p>
      </div>
      <Segmented
        legend="Close when everyone has answered"
        options={OFF_ON}
        bind:value={closeWhenAllAnswered}
      />
      <Segmented legend="Name who got it wrong" options={OFF_ON} bind:value={nameWrongAnswers} />
    </div>
  </section>

  {#if full === true}
    <p class="banner">
      You already have five rooms. Remove one on the <a href="/" onclick={goHome}>homepage</a>
      to make another.
    </p>
  {/if}
  <div class="row">
    {#if full !== true}
      <button class="primary" type="submit" disabled={busy || !ready}>
        {busy ? 'Creating…' : 'Create room'}
      </button>
    {/if}
    <button type="button" onclick={() => navigate('/')}>Back</button>
  </div>
  {#if failure !== null}
    <!-- A banner rather than a bare .error: this sits on the page, under the buttons,
         and a theme's page may be a floor --bad does not read against. -->
    <p class="banner bad" role="alert">{failure}</p>
  {/if}
</form>

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

  .rest .note {
    margin: 0.3rem 0 0;
  }
</style>
