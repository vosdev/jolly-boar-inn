<script lang="ts">
  /**
   * `/report`: tell the innkeeper what is wrong with a pack question (`lib/reports.ts`).
   *
   * A mode, then one of its questions, or for a price mode the item, then what is wrong.
   * Only for a browser that has finished a game, as Home's link is. Before any field the
   * page asks the server how many reports this address has left this hour.
   */
  import { onMount } from 'svelte'

  import ChoiceSearch from '../components/report/ChoiceSearch.svelte'
  import {
    ApiFailure,
    getReportAllowance,
    getReportChoices,
    getReportModes,
    sendReport,
  } from '../lib/api'
  import { npcArt } from '../lib/npcs'
  import {
    REPORT_TEXT_MAX,
    reportHost,
    reportModeName,
    reportTextProblem,
    type Picked,
    type ReportBody,
    type ReportChoices,
  } from '../lib/reports'
  import { maySuggest, retryIn } from '../lib/suggestions'

  let { navigate }: { navigate: (to: string) => void } = $props()

  const allowed = maySuggest()
  let view = $state<'checking' | 'pick' | 'write' | 'sending' | 'sent' | 'limited'>('checking')
  let modes = $state<string[]>([])
  let mode = $state<string | null>(null)
  let listed = $state<ReportChoices | null>(null)
  let picked = $state<Picked>(null)
  let text = $state('')
  let attempted = $state(false)
  let retryAt = $state<string | null>(null)
  let failure = $state<string | null>(null)

  const textError = $derived(reportTextProblem(text))
  const pickError = $derived(
    picked !== null
      ? null
      : listed?.by === 'item'
        ? 'Pick the item, or Something else.'
        : 'Pick the question, or Something else.',
  )
  const length = $derived([...text.trim()].length)

  async function checkAllowance(): Promise<boolean> {
    try {
      const allowance = await getReportAllowance()
      if (allowance.left > 0) return true
      retryAt = allowance.retry_at
      view = 'limited'
      return false
    } catch {
      // The send will say so if it really is over; a failed check is no reason to stop.
      return true
    }
  }

  async function start(): Promise<void> {
    if (!(await checkAllowance())) return
    try {
      modes = await getReportModes()
      view = 'pick'
    } catch (error) {
      failure = error instanceof ApiFailure ? error.message : 'the modes did not load'
      view = 'pick'
    }
  }

  onMount(() => {
    if (allowed) void start()
  })

  async function pick(next: string): Promise<void> {
    mode = next
    listed = null
    picked = null
    attempted = false
    failure = null
    view = 'write'
    try {
      const found = await getReportChoices(next)
      if (mode === next) listed = found
    } catch (error) {
      failure = error instanceof ApiFailure ? error.message : 'the questions did not load'
    }
  }

  function back(): void {
    mode = null
    listed = null
    picked = null
    view = 'pick'
  }

  async function send(): Promise<void> {
    attempted = true
    if (view === 'sending' || mode === null || textError !== null || pickError !== null) return
    const body: ReportBody = { mode, text: text.trim() }
    if (picked !== 'other' && picked !== null) {
      if (listed?.by === 'item') body.item = picked.id as number
      else body.question = picked.id as string
    }
    view = 'sending'
    failure = null
    try {
      await sendReport(body)
      view = 'sent'
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 429) {
        await checkAllowance()
        view = 'limited'
        return
      }
      failure = error instanceof ApiFailure ? error.message : 'the report was not sent'
      view = 'write'
    }
  }

  async function another(): Promise<void> {
    back()
    text = ''
    attempted = false
    view = 'checking'
    if (await checkAllowance()) view = 'pick'
  }
</script>

{#if !allowed}
  <section class="panel">
    <h1>Report a question</h1>
    <p>Play a game first. Once you have, come back here if a question was wrong.</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else if view === 'checking'}
  <section class="panel">
    <h1>Report a question</h1>
    <p class="note">Checking with the innkeeper…</p>
  </section>
{:else if view === 'limited'}
  <section class="panel">
    <h1>Report a question</h1>
    <p>
      That's as many reports as the innkeeper reads from one connection in an hour. Try again
      {retryIn(retryAt, Date.now())}.
    </p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else if view === 'sent'}
  <section class="panel">
    <h1>Thanks, the innkeeper will look into it</h1>
    <p>
      A fixed question comes back in a later update. There's no account, so you won't hear back.
    </p>
    <div class="row">
      <button type="button" class="primary" onclick={() => void another()}>Report another</button>
      <button type="button" onclick={() => navigate('/')}>Home</button>
    </div>
  </section>
{:else}
  <section class="panel">
    <h1>Report a question</h1>
    <p class="note">A wrong answer, a typo, an outdated fact: tell the innkeeper which question.</p>
  </section>
  {#if failure !== null}
    <div class="banner bad" role="alert">{failure}</div>
  {/if}
  {#if mode === null}
    <section class="panel">
      <h2>Which round was it in?</h2>
      <ul class="choices">
        {#each modes as each (each)}
          {@const art = npcArt(reportHost(each))}
          <li>
            <button type="button" class="choice" onclick={() => void pick(each)}>
              <img src={art.url} alt="" class={art.cut} />
              <strong>{reportModeName(each)}</strong>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <section class="panel">
      <p class="back">
        <button type="button" class="link" onclick={back}>← Every round</button>
      </p>
      <h2>{reportModeName(mode)}</h2>
      {#if listed === null}
        <p class="note">Loading the questions…</p>
      {:else}
        <form
          novalidate
          onsubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <ChoiceSearch
            choices={listed.choices}
            bind:picked
            label={listed.by === 'item' ? 'Which item?' : 'Which question?'}
            problem={attempted ? pickError : null}
          />
          <div class="field">
            <label for="report-text">What is wrong with it?</label>
            <textarea id="report-text" rows="5" bind:value={text}></textarea>
            <p class="note count" class:over={length > REPORT_TEXT_MAX}>
              {length} / {REPORT_TEXT_MAX}
            </p>
            {#if attempted && textError !== null}<p class="error">{textError}</p>{/if}
          </div>
          <button type="submit" class="primary" disabled={view === 'sending'}>
            {view === 'sending' ? 'Sending…' : 'Send to the innkeeper'}
          </button>
        </form>
      {/if}
    </section>
  {/if}
{/if}

<style>
  h1 {
    margin-top: 0;
  }

  .choices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.75rem;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    text-align: left;
    background: var(--panel-raised);
  }

  .choice img {
    flex: none;
    width: 40px;
    height: 40px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  /* Hosts face the scroll from its left; a render faces the other way (lib/npcs.ts). */
  .choice img.render {
    transform: scaleX(-1);
    object-fit: cover;
    object-position: top;
  }

  .back {
    margin: 0 0 0.75rem;
  }

  textarea {
    width: 100%;
    font: inherit;
    padding: calc(0.55rem - var(--border-give)) calc(0.7rem - var(--border-give));
    color: var(--ink);
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    resize: vertical;
  }

  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .count {
    margin: 0.25rem 0 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .count.over {
    color: var(--bad);
  }

  form > :global(.field) {
    margin-top: 1rem;
  }
</style>
