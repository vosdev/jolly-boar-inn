<script lang="ts">
  /**
   * Name first, then settings. One POST creates the room, its questions and you as its
   * admin, and the response carries your session — so this screen navigates straight
   * into the lobby, which is already the best "room created" screen there is: the code
   * to read out, the link to share, and the players arriving.
   *
   * The custom-question editor is Phase 2, so `custom_questions` is always the empty
   * list `api.createRoom` sends.
   */
  import { ApiFailure, createRoom, type NewRoomSettings } from '../lib/api'
  import { MODE_LIST } from '../lib/modes'
  import { rememberCreated, setSession } from '../lib/session'

  let { navigate }: { navigate: (to: string) => void } = $props()

  let displayName = $state('')
  let rounds = $state(4)
  let perRound = $state(5)
  let questionSeconds = $state(30)
  let revealSeconds = $state(8)
  let splashSeconds = $state(8)
  let order = $state<'shuffle' | 'custom_last'>('shuffle')
  let closeWhenAllAnswered = $state(true)
  let modes = $state<string[]>([MODE_LIST[0].id])

  let busy = $state(false)
  let failure = $state<string | null>(null)

  /** The server takes a total and a round length; the form asks for the two factors. */
  const questionCount = $derived(rounds * perRound)
  const ready = $derived(
    displayName.trim() !== '' && modes.length > 0 && questionCount >= 1 && questionCount <= 100,
  )

  function toggle(id: string, on: boolean): void {
    // Registry order, not click order: the rounds are dealt out in the order the modes
    // are given, so "most recently ticked" would make the running order an artefact of
    // which box was clicked last.
    const wanted = new Set(on ? [...modes, id] : modes.filter((m) => m !== id))
    modes = MODE_LIST.map((mode) => mode.id).filter((mode) => wanted.has(mode))
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (busy || !ready) return
    busy = true
    failure = null
    const settings: NewRoomSettings = {
      question_seconds: questionSeconds,
      question_count: questionCount,
      questions_per_round: perRound,
      modes,
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
    <h2>Rounds</h2>
    <p class="note">
      Each round plays one question type and opens with a screen introducing it. With
      more than one type picked, the rounds take turns.
    </p>
    <div class="grid">
      <div>
        <label for="rounds">Rounds</label>
        <input id="rounds" type="number" min="1" max="20" bind:value={rounds} />
        <p class="note">1–20</p>
      </div>
      <div>
        <label for="per-round">Questions per round</label>
        <input id="per-round" type="number" min="1" max="20" bind:value={perRound} />
        <p class="note" class:error={questionCount > 100}>
          1–20 · {questionCount} questions in total{questionCount > 100 ? ', over the 100 cap' : ''}
        </p>
      </div>
      <div>
        <label for="seconds">Seconds per question</label>
        <input id="seconds" type="number" min="10" max="120" bind:value={questionSeconds} />
        <p class="note">10–120. Quick types cap themselves lower.</p>
      </div>
      <div>
        <label for="splash">Round intro seconds</label>
        <input id="splash" type="number" min="0" max="30" bind:value={splashSeconds} />
        <p class="note">0–30, 0 skips it</p>
      </div>
      <div>
        <label for="reveal">Reveal seconds</label>
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

  <section class="panel">
    <h2>Question types</h2>
    {#each MODE_LIST as mode (mode.id)}
      <label class="check">
        <input
          type="checkbox"
          checked={modes.includes(mode.id)}
          onchange={(event) => toggle(mode.id, event.currentTarget.checked)}
        />
        {mode.label} <span class="note">— {mode.hint}</span>
      </label>
    {/each}
    {#if modes.length === 0}
      <p class="error">Pick at least one type.</p>
    {/if}
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
