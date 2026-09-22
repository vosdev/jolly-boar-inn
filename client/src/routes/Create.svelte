<script lang="ts">
  /**
   * Name first, then the rounds. One POST creates the room, its questions and you as its
   * admin, and the response carries your session — so this screen navigates straight
   * into the lobby, which is already the best "room created" screen there is: the code
   * to read out, the link to share, and the players arriving.
   *
   * A game mode is a round. Ticking three modes makes a three-round game, and each one
   * carries its own length and its own question count, because the modes differ in pace:
   * `more_less` is two names and one word to read, so its round runs long and quick,
   * where a release-date round is short and slow. The defaults and the ranges those
   * numbers are held to come from `GET /api/modes`, which is the server's own mode
   * registry — the form never invents a number the server would refuse.
   *
   * The name comes from the profile (D3). A browser with none is stopped by the popup
   * before the form, which then arrives filled in: the host's name is the one read aloud
   * and put at the top of the standings, so a beat to choose it is well spent, and here it
   * is free — no room exists yet, so there is nothing to check it against or undo. What
   * the host creates with becomes the profile, so the next room starts from it.
   *
   * `/api/modes` lists `custom` too, with no round length: the host's own questions are
   * never a round but random events, one dropped into each round after the first. So the
   * form offers every mode but that one. Writing those questions is the editor's job
   * (T30); until it lands `custom_questions` is always the empty list `api.createRoom`
   * sends, and the one choice about events here is whether the packs may interrupt.
   */
  import { onMount, untrack } from 'svelte'

  import {
    ApiFailure,
    createRoom,
    getModes,
    type ModePacing,
    type NewRoomSettings,
  } from '../lib/api'
  import NameField from '../components/NameField.svelte'
  import NamePrompt from '../components/NamePrompt.svelte'
  import { MODES, modeLabel } from '../lib/modes'
  import { nameProblem } from '../lib/names'
  import { profile, saveProfile } from '../lib/profile'
  import type { ModeSettings } from '../lib/protocol'
  import { rememberCreated, setSession } from '../lib/session'

  /** The server's cap on a room, over every round. `NewRoomSettings` checks the same. */
  const MAX_QUESTIONS = 100

  let { navigate }: { navigate: (to: string) => void } = $props()

  let displayName = $state($profile?.name ?? '')
  let revealSeconds = $state(3)
  /** How long the standings hold between rounds (D9); 0 runs the rounds straight on. */
  let standingsSeconds = $state(10)
  /** `splash_seconds` on the wire: 0 is off, anything else on (D7: it is no longer a length). */
  let introduceRounds = $state(true)
  /** May a pack question interrupt a round? A room's own questions always do. */
  let randomEvents = $state(true)
  let modeOrder = $state<'listed' | 'random'>('listed')
  let closeWhenAllAnswered = $state(true)
  /** The rounds, in the order they will play: one per mode, and the list is the order. */
  let rounds = $state<ModeSettings[]>([])

  /** What the server will play and what it will accept for each, or null until it says. */
  let pacing = $state<ModePacing[] | null>(null)
  let pacingFailure = $state<string | null>(null)
  let busy = $state(false)
  let failure = $state<string | null>(null)

  /** The modes a host can pick as rounds: every one but `custom`, which has no round length. */
  const roundModes = $derived(pacing?.filter((mode) => mode.questions !== null) ?? [])
  const questionCount = $derived(rounds.reduce((total, round) => total + round.questions, 0))
  /**
   * The events the room may add to that, which count against the cap as the server counts
   * them: one per round after the first, whenever the packs are allowed to interrupt.
   */
  const eventCount = $derived(randomEvents ? Math.max(0, rounds.length - 1) : 0)
  /** Every round's two numbers inside what `/api/modes` said the server would take. */
  const roundsInRange = $derived(
    rounds.every(
      (round) =>
        inRange(round.mode, 'questions', round.questions) &&
        inRange(round.mode, 'seconds', round.seconds),
    ),
  )
  /** `NewRoomSettings`' 0..30, and an integer: a cleared field binds `null`. */
  const standingsInRange = $derived(
    Number.isInteger(standingsSeconds) && 0 <= standingsSeconds && standingsSeconds <= 30,
  )
  const ready = $derived(
    nameProblem(displayName) === null &&
      rounds.length > 0 &&
      roundsInRange &&
      questionCount >= 1 &&
      questionCount + eventCount <= MAX_QUESTIONS &&
      standingsInRange,
  )

  // Filled in the moment the popup saves one. Only ever from empty, so a name the host
  // is typing is never pulled out from under them.
  $effect(() => {
    const saved = $profile
    untrack(() => {
      if (displayName === '' && saved !== null) displayName = saved.name
    })
  })

  onMount(async () => {
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
    return { mode: mode.id, questions: mode.questions?.default ?? 1, seconds: mode.seconds.default }
  }

  function bounds(mode: string): ModePacing | null {
    return pacing?.find((entry) => entry.id === mode) ?? null
  }

  /**
   * Would the server take this number for this round? The `min` and `max` attributes are
   * a nudge, not a gate — a host may type 45 into a field that says 5–20 — so the same
   * bounds gate the submit button and colour the hint under the field.
   *
   * A mode `/api/modes` did not list answers no rather than yes: without its bounds there
   * is nothing to check against, and the server is the one holding the opinion. A field
   * the host cleared answers no too, because `bind:value` writes `null` into an empty
   * number input and posting that earns a complaint about integers instead of a range.
   */
  function inRange(mode: string, field: 'questions' | 'seconds', value: number): boolean {
    const limits = bounds(mode)?.[field]
    if (limits === undefined || limits === null || !Number.isInteger(value)) return false
    return limits.min <= value && value <= limits.max
  }

  function toggle(mode: ModePacing, on: boolean): void {
    // Click order, deliberately: the list is the running order now, so a mode ticked
    // last plays last — until the host moves it, or hands the order to `random`.
    rounds = on
      ? [...rounds, roundFor(mode)]
      : rounds.filter((round) => round.mode !== mode.id)
  }

  /** Move round `index` one place `by` (-1 up, 1 down); the ends stay put. */
  function move(index: number, by: number): void {
    const to = index + by
    if (to < 0 || to >= rounds.length) return
    const moved = [...rounds]
    const [round] = moved.splice(index, 1)
    moved.splice(to, 0, round)
    rounds = moved
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (busy || !ready) return
    busy = true
    failure = null
    const settings: NewRoomSettings = {
      modes: rounds,
      mode_order: modeOrder,
      random_events: randomEvents,
      reveal_seconds: revealSeconds,
      splash_seconds: introduceRounds ? 8 : 0,
      standings_seconds: standingsSeconds,
      close_when_all_answered: closeWhenAllAnswered,
    }
    try {
      const created = await createRoom(displayName.trim(), settings, $profile?.head)
      setSession(created.code, created.session)
      saveProfile(displayName)
      rememberCreated(created.code)
      navigate(`/r/${created.code}`)
    } catch (error) {
      failure =
        error instanceof ApiFailure ? error.message : 'could not create the room, try again'
    } finally {
      busy = false
    }
  }
</script>

{#if $profile === null}
  <NamePrompt action="Host" onBack={() => navigate('/')} />
{/if}

<h1>Create a room</h1>
<p class="tagline">Choose and configure the settings for your room. They cannot be changed once the room is created.</p>

<form onsubmit={submit}>
  <section class="panel">
    <h2>You</h2>
    <NameField id="name" bind:value={displayName} />
  </section>

  <section class="panel">
    <h2>Game modes</h2>
    <p class="note">Each mode you pick is one round. Each round opens with a screen introducing it.</p>
    {#if pacingFailure !== null}
      <p class="error">{pacingFailure}</p>
    {:else if pacing === null}
      <p class="note">Loading the game modes…</p>
    {:else}
      {#each roundModes as mode (mode.id)}
        <label class="check">
          <input
            type="checkbox"
            checked={rounds.some((round) => round.mode === mode.id)}
            onchange={(event) => toggle(mode, event.currentTarget.checked)}
          />
          {modeLabel(mode.id)}
          {#if MODES[mode.id]}<span class="note">— {MODES[mode.id].hint}</span>{/if}
        </label>
      {/each}
      {#if rounds.length === 0}
        <p class="error">Pick at least one type; a room with no rounds is no game.</p>
      {/if}
    {/if}
  </section>

  {#if rounds.length > 0}
    <section class="panel">
      <h2>Rounds ({rounds.length})</h2>
      <div class="field">
        <label for="mode-order">Round order</label>
        <select id="mode-order" bind:value={modeOrder}>
          <option value="listed">The order below</option>
          <option value="random">Random</option>
        </select>
      </div>
      <ul class="rounds">
        {#each rounds as round, index (round.mode)}
          <li>
            <div class="spread">
              <span class="name">
                {#if modeOrder === 'listed'}<span class="tag">{index + 1}</span>{/if}
                {modeLabel(round.mode)}
              </span>
              {#if modeOrder === 'listed' && rounds.length > 1}
                <span class="row">
                  <button
                    type="button"
                    class="small"
                    disabled={index === 0}
                    aria-label="Move {modeLabel(round.mode)} earlier"
                    onclick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="small"
                    disabled={index === rounds.length - 1}
                    aria-label="Move {modeLabel(round.mode)} later"
                    onclick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                </span>
              {/if}
            </div>
            <div class="grid">
              <div>
                <label for="questions-{round.mode}">Questions</label>
                <input
                  id="questions-{round.mode}"
                  type="number"
                  min={bounds(round.mode)?.questions?.min ?? 1}
                  max={bounds(round.mode)?.questions?.max ?? 30}
                  bind:value={round.questions}
                />
                <p class="note" class:error={!inRange(round.mode, 'questions', round.questions)}>
                  {bounds(round.mode)?.questions?.min}–{bounds(round.mode)?.questions?.max}
                </p>
              </div>
              <div>
                <label for="seconds-{round.mode}">Seconds per question</label>
                <input
                  id="seconds-{round.mode}"
                  type="number"
                  min={bounds(round.mode)?.seconds.min ?? 5}
                  max={bounds(round.mode)?.seconds.max ?? 120}
                  bind:value={round.seconds}
                />
                <p class="note" class:error={!inRange(round.mode, 'seconds', round.seconds)}>
                  {bounds(round.mode)?.seconds.min}–{bounds(round.mode)?.seconds.max}
                </p>
              </div>
            </div>
          </li>
        {/each}
      </ul>
      <p class="note" class:error={questionCount + eventCount > MAX_QUESTIONS}>
        {questionCount} question{questionCount === 1 ? '' : 's'} in total{eventCount > 0
          ? `, and up to ${eventCount} random event${eventCount === 1 ? '' : 's'}`
          : ''}{questionCount + eventCount > MAX_QUESTIONS ? `, over the ${MAX_QUESTIONS} cap` : ''}
      </p>
    </section>
  {/if}

  <section class="panel">
    <h2>The rest of the game</h2>
    <div class="grid">
      <div>
        <label for="reveal">Reveal answers seconds</label>
        <input id="reveal" type="number" min="2" max="30" bind:value={revealSeconds} />
        <p class="note">2–30</p>
      </div>
      <div>
        <label for="standings">Standings between rounds, seconds</label>
        <input id="standings" type="number" min="0" max="30" bind:value={standingsSeconds} />
        <p class="note" class:error={!standingsInRange}>0–30, and 0 for none</p>
      </div>
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={randomEvents} />
      Random events: now and then, a question from another mode interrupts a round
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={introduceRounds} />
      Introduce each round, and start it when most of the room is ready
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={closeWhenAllAnswered} />
      Close a question as soon as everyone has answered
    </label>
  </section>

  <div class="row">
    <button class="primary" type="submit" disabled={busy || !ready}>
      {busy ? 'Creating…' : 'Create room'}
    </button>
    <button type="button" onclick={() => navigate('/')}>Back</button>
  </div>
  {#if failure !== null}
    <!-- A banner rather than a bare .error: this sits on the page, under the buttons,
         and a theme's page may be a floor --bad does not read against. -->
    <p class="banner bad" role="alert">{failure}</p>
  {/if}
</form>
