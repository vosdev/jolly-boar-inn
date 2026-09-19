<script lang="ts">
  /**
   * Settings plus mode checkboxes. The custom-question editor is Phase 2, so
   * `custom_questions` is always the empty list `api.createRoom` sends.
   *
   * On success the admin link is shown once with a copy button (section 7 step 3): it
   * is single use, and the only way onto a different device is to copy it before
   * claiming here.
   */
  import { ApiFailure, createRoom, type NewRoomSettings } from '../lib/api'
  import { rememberCreated } from '../lib/session'
  import CopyLink from '../components/CopyLink.svelte'

  let { navigate }: { navigate: (to: string) => void } = $props()

  // Phase 1 ships one question type (`app/questions/types/__init__.py`). The rest of
  // the list arrives with the modules, and the checkboxes come along for free.
  const MODES: { id: string; label: string; hint: string }[] = [
    { id: 'higher_lower', label: 'Higher or lower', hint: 'Which of two items is worth more' },
  ]

  let questionCount = $state(20)
  let questionSeconds = $state(30)
  let revealSeconds = $state(8)
  let order = $state<'shuffle' | 'custom_last'>('shuffle')
  let closeWhenAllAnswered = $state(true)
  let modes = $state<string[]>(['higher_lower'])

  let busy = $state(false)
  let failure = $state<string | null>(null)
  let created = $state<{ code: string; admin_url: string } | null>(null)

  function toggle(id: string, on: boolean): void {
    modes = on ? [...modes.filter((m) => m !== id), id] : modes.filter((m) => m !== id)
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (busy || modes.length === 0) return
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
      const room = await createRoom(settings)
      rememberCreated(room.code)
      created = room
    } catch (error) {
      failure =
        error instanceof ApiFailure ? error.message : 'could not create the room, try again'
    } finally {
      busy = false
    }
  }

  /**
   * Claim on this device. The token rides in the fragment of a same-origin URL and a
   * real page load follows, so it goes through `captureAdminToken` in `main.ts` exactly
   * as a pasted link would — one code path onto the host seat.
   *
   * The origin is this page's, not `admin_url`'s: a `PUBLIC_BASE_URL` pointing at
   * somewhere this browser cannot reach would otherwise strand the only admin token.
   */
  function claimHere(): void {
    if (created === null) return
    const link = new URL(created.admin_url)
    location.assign(location.origin + link.pathname + link.hash)
  }
</script>

{#if created === null}
  <h1>Create a room</h1>
  <p class="tagline">Settings are fixed once the room exists.</p>

  <form onsubmit={submit}>
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
      <button class="primary" type="submit" disabled={busy || modes.length === 0}>
        {busy ? 'Creating…' : 'Create room'}
      </button>
      <button type="button" onclick={() => navigate('/')}>Back</button>
    </div>
    {#if failure !== null}
      <p class="error">{failure}</p>
    {/if}
  </form>
{:else}
  <h1>Room created</h1>
  <p class="tagline">Read the code out. Keep the host link to yourself.</p>

  <section class="panel">
    <h2>Room code</h2>
    <p class="code">{created.code}</p>
    <CopyLink label="Link for players" value={`${location.origin}/r/${created.code}`} />
  </section>

  <section class="panel">
    <h2>Host link</h2>
    <p class="note">
      Works once. Open it here, or copy it to the device you want to host from — after that
      it is spent, and a second host has to be promoted from inside the room.
    </p>
    <CopyLink label="Host link" value={created.admin_url} />
    <button class="primary" type="button" onclick={claimHere}>Claim the host seat here</button>
  </section>
{/if}
