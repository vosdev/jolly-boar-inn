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
  import { rememberCreated, setSession } from '../lib/session'

  let { navigate }: { navigate: (to: string) => void } = $props()

  // Phase 1 ships one question type (`app/questions/types/__init__.py`). The rest of
  // the list arrives with the modules, and the checkboxes come along for free.
  const MODES: { id: string; label: string; hint: string }[] = [
    { id: 'higher_lower', label: 'Higher or lower', hint: 'Which of two items is worth more' },
  ]

  let displayName = $state('')
  let questionCount = $state(20)
  let questionSeconds = $state(30)
  let revealSeconds = $state(8)
  let order = $state<'shuffle' | 'custom_last'>('shuffle')
  let closeWhenAllAnswered = $state(true)
  let modes = $state<string[]>(['higher_lower'])

  let busy = $state(false)
  let failure = $state<string | null>(null)

  const ready = $derived(displayName.trim() !== '' && modes.length > 0)

  function toggle(id: string, on: boolean): void {
    modes = on ? [...modes.filter((m) => m !== id), id] : modes.filter((m) => m !== id)
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (busy || !ready) return
    busy = true
    failure = null
    const settings: NewRoomSettings = {
      question_seconds: questionSeconds,
      question_count: questionCount,
      modes,
      order,
      reveal_seconds: revealSeconds,
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
    <div class="grid">
      <div>
        <label for="count">Questions</label>
        <input id="count" type="number" min="1" max="100" bind:value={questionCount} />
        <p class="note">1–100</p>
      </div>
      <div>
        <label for="seconds">Seconds per question</label>
        <input id="seconds" type="number" min="10" max="120" bind:value={questionSeconds} />
        <p class="note">10–120, 30–60 plays well</p>
      </div>
      <div>
        <label for="reveal">Reveal seconds</label>
        <input id="reveal" type="number" min="3" max="30" bind:value={revealSeconds} />
        <p class="note">3–30</p>
      </div>
      <div>
        <label for="order">Order</label>
        <select id="order" bind:value={order}>
          <option value="shuffle">Shuffle everything</option>
          <option value="custom_last">Custom questions last</option>
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
    {#each MODES as mode (mode.id)}
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
