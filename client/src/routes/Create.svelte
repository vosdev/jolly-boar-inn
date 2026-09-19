<script lang="ts">
  /**
   * Name first, then the rounds. One POST creates the room, its questions and you as its
   * admin, and the response carries your session — so this screen navigates straight
   * into the lobby, which is already the best "room created" screen there is: the code
   * to read out, the link to share, and the players arriving.
   *
   * A game mode is a round. Ticking three types makes a three-round game, and each one
   * carries its own length and its own question count, because the modes differ in pace:
   * `more_less` is two names and one word to read, so its round runs long and quick,
   * where a release-date round is short and slow. The defaults and the ranges those
   * numbers are held to come from `GET /api/modes`, which is the server's own type
   * registry — the form never invents a number the server would refuse.
   *
   * The custom-question editor is Phase 2, so `custom_questions` is always the empty
   * list `api.createRoom` sends.
   */
  import { onMount } from 'svelte'

  import {
    ApiFailure,
    createRoom,
    getModes,
    type ModePacing,
    type NewRoomSettings,
  } from '../lib/api'
  import { MODES, modeLabel } from '../lib/modes'
  import type { ModeSettings } from '../lib/protocol'
  import { rememberCreated, setSession } from '../lib/session'

  /** The server's cap on a room, over every round. `NewRoomSettings` checks the same. */
  const MAX_QUESTIONS = 100

  let { navigate }: { navigate: (to: string) => void } = $props()

  let displayName = $state('')
  let revealSeconds = $state(4)
  let splashSeconds = $state(8)
  let order = $state<'shuffle' | 'custom_last'>('shuffle')
  let modeOrder = $state<'listed' | 'random'>('listed')
  let closeWhenAllAnswered = $state(true)
  /** The rounds, in the order they will play: one per mode, and the list is the order. */
  let rounds = $state<ModeSettings[]>([])

  /** What the server will play and what it will accept for each, or null until it says. */
  let pacing = $state<ModePacing[] | null>(null)
  let pacingFailure = $state<string | null>(null)
  let busy = $state(false)
  let failure = $state<string | null>(null)

  const questionCount = $derived(rounds.reduce((total, round) => total + round.questions, 0))
  const ready = $derived(
    displayName.trim() !== '' &&
      rounds.length > 0 &&
      questionCount >= 1 &&
      questionCount <= MAX_QUESTIONS,
  )

  onMount(async () => {
    try {
      pacing = await getModes()
      const first = pacing[0]
      if (first !== undefined) rounds = [roundFor(first)]
    } catch (error) {
      pacingFailure =
        error instanceof ApiFailure ? error.message : 'could not reach the server'
    }
  })

  /** A round of `mode` at that mode's own pace, which is what ticking it gives you. */
  function roundFor(mode: ModePacing): ModeSettings {
    return { mode: mode.id, questions: mode.questions.default, seconds: mode.seconds.default }
  }

  function bounds(mode: string): ModePacing | null {
    return pacing?.find((entry) => entry.id === mode) ?? null
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
      order,
      reveal_seconds: revealSeconds,
      splash_seconds: splashSeconds,
      close_when_all_answered: closeWhenAllAnswered,
    }
    try {
      const created = await createRoom(displayName.trim(), settings)
      setSession(created.code, created.session)
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

<h1>Create a room</h1>
<p class="tagline">You are the host. Settings are fixed once the room exists.</p>

<form onsubmit={submit}>
  <section class="panel">
    <h2>You</h2>
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
      <p class="note">1–24 characters. This is what the room sees.</p>
    </div>
  </section>

  <section class="panel">
    <h2>Question types</h2>
    <p class="note">Each type you pick is one round, opening with a screen introducing it.</p>
    {#if pacingFailure !== null}
      <p class="error">{pacingFailure}</p>
    {:else if pacing === null}
      <p class="note">Loading the question types…</p>
    {:else}
      {#each pacing as mode (mode.id)}
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
                  min={bounds(round.mode)?.questions.min ?? 1}
                  max={bounds(round.mode)?.questions.max ?? 30}
                  bind:value={round.questions}
                />
                <p class="note">
                  {bounds(round.mode)?.questions.min}–{bounds(round.mode)?.questions.max}
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
                <p class="note">
                  {bounds(round.mode)?.seconds.min}–{bounds(round.mode)?.seconds.max}
                </p>
              </div>
            </div>
          </li>
        {/each}
      </ul>
      <p class="note" class:error={questionCount > MAX_QUESTIONS}>
        {questionCount} question{questionCount === 1 ? '' : 's'} in total{questionCount >
        MAX_QUESTIONS
          ? `, over the ${MAX_QUESTIONS} cap`
          : ''}
      </p>
    </section>
  {/if}

  <section class="panel">
    <h2>The rest of the game</h2>
    <div class="grid">
      <div>
        <label for="splash">Round intro seconds</label>
        <input id="splash" type="number" min="0" max="30" bind:value={splashSeconds} />
        <p class="note">0–30, 0 skips it</p>
      </div>
      <div>
        <label for="reveal">Reveal answers seconds</label>
        <input id="reveal" type="number" min="3" max="30" bind:value={revealSeconds} />
        <p class="note">3–30</p>
      </div>
      <div>
        <label for="order">Your own questions</label>
        <select id="order" bind:value={order}>
          <option value="shuffle">Mixed into their round</option>
          <option value="custom_last">All at the end</option>
        </select>
      </div>
    </div>
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
    <p class="error">{failure}</p>
  {/if}
</form>
