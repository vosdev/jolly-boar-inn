<script lang="ts">
  /**
   * `/admin`'s Questions tab: the hand-written packs' questions, read whole, edited or
   * deleted, and the changes waiting to reach git.
   *
   * Nothing here changes what the server plays. An edit or a delete queues as a pending
   * change against the question's id in the packs as they are; a second one replaces it,
   * and Discard drops it. Download hands every pending change to `make edit-packs`, and
   * once that is merged "Mark as applied" drops exactly what the download held. A change
   * made after a download waits for the next one.
   *
   * A question with an edit waiting is edited from that edit, so a second pass refines
   * the first rather than starting over from the pack. Stats shows how players score on
   * each question instead, and its Set queues a tier edit the same way.
   */
  import { onMount, untrack } from 'svelte'

  import {
    deletePackQuestion,
    discardQuestionChange,
    downloadJson,
    editPackQuestion,
    exportQuestionChanges,
    getEditModes,
    getPackQuestions,
    getQuestionChanges,
    markQuestionChangesApplied,
  } from '../../lib/admin'
  import { ApiFailure } from '../../lib/api'
  import { npcArt } from '../../lib/npcs'
  import {
    changesFileName,
    groupingsFor,
    groupQuestions,
    loadGrouping,
    questionHost,
    saveGrouping,
    searchQuestions,
    type Grouping,
    editOf,
    type QuestionChange,
    type QuestionEdit,
  } from '../../lib/questionEdits'
  import { loadView, saveView, type QuestionsView } from '../../lib/questionStats'
  import { questionLine, reportModeName, type PackQuestion } from '../../lib/reports'
  import PackQuestionForm from './PackQuestionForm.svelte'
  import PackQuestionView from './PackQuestionView.svelte'
  import QuestionStats from './QuestionStats.svelte'
  import type { QuestionDifficulty } from '../../lib/suggestions'

  let { token, onrefused }: { token: string; onrefused: () => void } = $props()

  let modes = $state<string[]>([])
  let mode = $state<string | null>(null)
  let questions = $state<PackQuestion[] | null>(null)
  let changes = $state<QuestionChange[] | null>(null)
  let query = $state('')
  let opened = $state<string | null>(null)
  let editing = $state<string | null>(null)
  let openedChange = $state<string | null>(null)
  let failure = $state<string | null>(null)
  let busy = $state(false)
  let grouping = $state<Grouping>(loadGrouping())
  let view = $state<QuestionsView>(loadView())

  const GROUPING_LABELS: Record<Grouping, string> = { all: 'All', host: 'Host', type: 'Type' }

  const found = $derived(searchQuestions(questions ?? [], query))
  const groupings = $derived(mode === null ? [] : groupingsFor(mode, questions ?? []))
  // The stored choice outlives a round that cannot offer it, and returns with the next that can.
  const groups = $derived(groupQuestions(found, groupings.includes(grouping) ? grouping : 'all'))
  const byId = $derived(new Map((changes ?? []).map((change) => [change.question_id, change])))
  const exported = $derived((changes ?? []).filter((change) => change.exported_at !== null).length)

  function fail(error: unknown, otherwise: string): void {
    if (error instanceof ApiFailure && error.status === 401) onrefused()
    else failure = error instanceof ApiFailure ? error.message : otherwise
  }

  async function run(work: () => Promise<unknown>): Promise<void> {
    if (busy) return
    busy = true
    failure = null
    try {
      await work()
      changes = await getQuestionChanges(token)
    } catch (error) {
      fail(error, 'that did not work')
    } finally {
      busy = false
    }
  }

  onMount(async () => {
    try {
      const [listed, pending] = await Promise.all([getEditModes(token), getQuestionChanges(token)])
      modes = listed
      changes = pending
      mode = listed[0] ?? null
    } catch (error) {
      fail(error, 'the editor did not load')
    }
  })

  async function load(wanted: string): Promise<void> {
    try {
      const next = await getPackQuestions(token, wanted)
      if (mode === wanted) questions = next
    } catch (error) {
      fail(error, 'the questions did not load')
    }
  }

  $effect(() => {
    const wanted = mode
    untrack(() => {
      opened = null
      editing = null
      questions = null
      if (wanted !== null) void load(wanted)
    })
  })

  /** What an edit starts from: the edit waiting for it, or the pack's question. */
  function current(question: PackQuestion): PackQuestion {
    const change = byId.get(question.id)
    return change?.action === 'edit' && change.question !== null ? change.question : question
  }

  function save(question: PackQuestion, edit: QuestionEdit): void {
    void run(async () => {
      await editPackQuestion(token, question.id, edit)
      editing = null
    })
  }

  function setTier(question: PackQuestion, tier: QuestionDifficulty): void {
    void run(() =>
      editPackQuestion(token, question.id, { ...editOf(current(question)), difficulty: tier }),
    )
  }

  function show(next: QuestionsView): void {
    view = next
    saveView(next)
  }

  function remove(question: PackQuestion): void {
    void run(() => deletePackQuestion(token, question.id))
  }

  function discard(change: QuestionChange): void {
    void run(() => discardQuestionChange(token, change.question_id))
  }

  function download(): void {
    void run(async () =>
      downloadJson(await exportQuestionChanges(token), changesFileName(new Date())),
    )
  }

  function applied(): void {
    void run(() => markQuestionChangesApplied(token))
  }

  function actionLabel(change: QuestionChange): string {
    return change.action === 'edit' ? 'Edit' : 'Delete'
  }
</script>

{#snippet rows(list: PackQuestion[])}
  <ul class="list">
    {#each list as question (question.id)}
      {@const change = byId.get(question.id)}
      <li>
        <button
          type="button"
          class="summary"
          aria-expanded={opened === question.id}
          onclick={() => {
            opened = opened === question.id ? null : question.id
            editing = null
          }}
        >
          <span class="text">{questionLine(question)}</span>
          {#if change !== undefined}
            <span class="chip" class:bad={change.action === 'delete'}>
              {change.action === 'edit' ? 'Edited' : 'To delete'}
            </span>
          {/if}
        </button>
        {#if opened === question.id}
          <div class="detail single">
            {#if editing === question.id}
              <PackQuestionForm
                question={current(question)}
                onsave={(edit) => save(question, edit)}
                oncancel={() => (editing = null)}
              />
            {:else}
              <PackQuestionView question={current(question)} />
              <div class="row">
                <button type="button" disabled={busy} onclick={() => (editing = question.id)}>
                  Edit
                </button>
                {#if change?.action !== 'delete'}
                  <button
                    type="button"
                    class="reject"
                    disabled={busy}
                    onclick={() => remove(question)}
                  >
                    Delete
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<section class="panel" aria-labelledby="changes-heading">
  <h2 id="changes-heading">Pending changes</h2>

  {#if failure !== null}
    <div class="banner bad" role="alert">{failure}</div>
  {/if}

  {#if changes === null}
    <p class="note">Loading…</p>
  {:else if changes.length === 0}
    <p class="note">
      None. An edit or a delete waits here until it is downloaded, applied with
      <code>make edit-packs</code> and merged; the game plays the packs as they are until then.
    </p>
  {:else}
    <ul class="list">
      {#each changes as change (change.question_id)}
        <li>
          <button
            type="button"
            class="summary"
            aria-expanded={openedChange === change.question_id}
            onclick={() =>
              (openedChange = openedChange === change.question_id ? null : change.question_id)}
          >
            <img src={npcArt(questionHost(change.before)).url} alt="" />
            <span class="chip" class:bad={change.action === 'delete'}>{actionLabel(change)}</span>
            <span class="chip">{reportModeName(change.mode)}</span>
            <span class="text">{questionLine(change.before)}</span>
            {#if !change.in_packs}<span class="chip warn">No longer in the packs</span>{/if}
            {#if change.exported_at !== null}<span class="chip ok">Downloaded</span>{/if}
          </button>
          {#if openedChange === change.question_id}
            <div class="detail">
              <div>
                <h3>Before</h3>
                <PackQuestionView question={change.before} />
              </div>
              <div>
                {#if change.question === null}
                  <h3>After</h3>
                  <p class="note">Deleted from its pack.</p>
                {:else}
                  <h3>After</h3>
                  <PackQuestionView question={change.question} />
                {/if}
                <div class="row">
                  <button type="button" disabled={busy} onclick={() => discard(change)}>
                    Discard
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <div class="export">
      {#if exported > 0}
        <p>
          <strong>{exported} downloaded.</strong> Run <code>make edit-packs FILE=…</code>, merge it,
          then mark them applied. A change made since waits for the next download.
        </p>
      {/if}
      <div class="row">
        {#if exported > 0}
          <button type="button" class="primary" disabled={busy} onclick={applied}>
            Mark {exported} as applied
          </button>
        {/if}
        <button type="button" class:primary={exported === 0} disabled={busy} onclick={download}>
          Download {changes.length} change{changes.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  {/if}
</section>

<section class="panel" aria-labelledby="packs-heading">
  <div class="head">
    <h2 id="packs-heading">Pack questions</h2>
    <div class="views" role="group" aria-label="View">
      <button type="button" aria-pressed={view === 'list'} onclick={() => show('list')}>List</button
      >
      <button type="button" aria-pressed={view === 'stats'} onclick={() => show('stats')}
        >Stats</button
      >
    </div>
  </div>
  {#if view === 'stats'}
    <QuestionStats
      {token}
      {modes}
      changes={byId}
      {busy}
      onset={setTier}
      ondiscard={discard}
      onfail={fail}
    />
  {:else}
    <div class="filters">
      <div class="field">
        <label for="pack-mode">Round</label>
        <select id="pack-mode" bind:value={mode}>
          {#each modes as each (each)}
            <option value={each}>{reportModeName(each)}</option>
          {/each}
        </select>
      </div>
      <div class="field grow">
        <label for="pack-search">Search</label>
        <input id="pack-search" type="text" bind:value={query} />
      </div>
      {#if groupings.length > 1}
        <div class="field">
          <label for="pack-grouping">Group by</label>
          <select
            id="pack-grouping"
            value={groupings.includes(grouping) ? grouping : 'all'}
            onchange={(event) => {
              grouping = event.currentTarget.value as Grouping
              saveGrouping(grouping)
            }}
          >
            {#each groupings as each (each)}
              <option value={each}>{GROUPING_LABELS[each]}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    {#if questions === null}
      <p class="note">Loading…</p>
    {:else if found.length === 0}
      <p class="note">No question matches.</p>
    {:else}
      <p class="note">{found.length} of {questions.length}</p>
      {#each groups as group (group.key)}
        {#if group.key === ''}
          {@render rows(group.questions)}
        {:else}
          <div class="group" role="group" aria-labelledby="group-{group.key}">
            <h3 id="group-{group.key}">
              {#if group.host !== null}<img src={npcArt(group.host).url} alt="" />{/if}
              <span>{group.label}</span>
              <span class="chip">{group.questions.length}</span>
            </h3>
            {@render rows(group.questions)}
          </div>
        {/if}
      {/each}
    {/if}
  {/if}
</section>

<style>
  h2 {
    margin: 0 0 1rem;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .head h2 {
    margin: 0;
  }

  .views {
    display: flex;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .views button {
    border: none;
    border-radius: 0;
    font-weight: 500;
  }

  .views button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-ink);
  }

  h3 {
    margin: 0 0 0.6rem;
    font-size: 1rem;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
  }

  .filters .grow {
    flex: 1;
    min-width: 12rem;
  }

  .filters input {
    width: 100%;
  }

  .group + .group {
    margin-top: 1.25rem;
  }

  .group h3 {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .group h3 img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel-raised);
  }

  .list li + li {
    border-top: 1px solid var(--line);
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    border: none;
    border-radius: 0;
    background: none;
    text-align: left;
  }

  .summary img {
    flex: none;
    width: 32px;
    height: 32px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip {
    flex: none;
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.05rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--muted);
    white-space: nowrap;
  }

  .chip.warn {
    border-color: var(--warn);
    color: var(--warn);
  }

  .chip.ok {
    border-color: var(--ok);
    color: var(--ok);
  }

  .chip.bad {
    border-color: var(--bad);
    color: var(--bad);
  }

  .detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.5rem;
    padding: 1rem;
    border-top: 1px dashed var(--line);
  }

  .detail.single {
    display: block;
  }

  /* Before above after on a phone, where two columns of a question do not fit. */
  @media (max-width: 40rem) {
    .detail {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .reject {
    border-color: var(--bad);
    color: var(--bad);
  }

  .export {
    margin-top: 1rem;
  }

  .export p {
    margin: 0 0 0.5rem;
  }
</style>
