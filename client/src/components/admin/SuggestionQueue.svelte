<script lang="ts">
  /**
   * The operator's queue of player suggestions, in `/admin`: read one as players would see
   * it, check it against its wiki page, edit, approve or reject it.
   *
   * The approved ones leave in a file for `make import-suggestions`. Exporting marks what
   * the file held, and once the import is merged "Mark as imported" moves exactly those to
   * Imported, where they stay and can be exported again if an import goes wrong. A question
   * for a round not built yet waits in Approved: no export includes it until the round is.
   *
   * Everything a player typed is drawn as text, never as markup.
   */
  import { untrack } from 'svelte'

  import {
    downloadJson,
    editSuggestion,
    exportSuggestions,
    getQueue,
    markImported,
    setSuggestionStatus,
    type Queue,
  } from '../../lib/admin'
  import { ApiFailure } from '../../lib/api'
  import { npcArt } from '../../lib/npcs'
  import {
    STATUS_LABELS,
    answerOf,
    choiceOf,
    examinePreview,
    exportName,
    modeName,
    questionPreview,
    summary,
    type ExamineContent,
    type ItemContent,
    type QueuedSuggestion,
    type QuestionContent,
    type SuggestionBody,
    type SuggestionStatus,
  } from '../../lib/suggestions'
  import QuestionStage from '../QuestionStage.svelte'
  import RandomEvent from '../RandomEvent.svelte'
  import SuggestionEditor from '../suggest/SuggestionEditor.svelte'

  let { token, onrefused }: { token: string; onrefused: () => void } = $props()

  const STATUSES: SuggestionStatus[] = ['pending', 'approved', 'rejected', 'imported']
  const KIND_LABELS = { question: 'Question', examine: 'Examine', item: 'Item' } as const

  let status = $state<SuggestionStatus>('pending')
  let queue = $state<Queue | null>(null)
  let opened = $state<string | null>(null)
  let editing = $state<string | null>(null)
  let failure = $state<string | null>(null)
  let busy = $state(false)

  const rows = $derived(queue?.suggestions ?? [])
  const exportable = $derived(rows.filter((row) => row.playable).length)
  const exported = $derived(rows.filter((row) => row.exported_at !== null).length)

  async function run(work: () => Promise<unknown>): Promise<void> {
    if (busy) return
    busy = true
    failure = null
    try {
      await work()
      queue = await getQueue(token, status)
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) onrefused()
      else failure = error instanceof ApiFailure ? error.message : 'that did not work'
    } finally {
      busy = false
    }
  }

  async function load(wanted: SuggestionStatus): Promise<void> {
    try {
      const next = await getQueue(token, wanted)
      if (status === wanted) queue = next
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) onrefused()
      else failure = error instanceof ApiFailure ? error.message : 'the queue did not load'
    }
  }

  $effect(() => {
    const wanted = status
    untrack(() => {
      opened = null
      editing = null
      queue = null
      void load(wanted)
    })
  })

  function move(row: QueuedSuggestion, next: 'pending' | 'approved' | 'rejected'): void {
    void run(() => setSuggestionStatus(token, row.id, next))
  }

  function save(row: QueuedSuggestion, body: SuggestionBody): void {
    void run(async () => {
      await editSuggestion(token, row.id, {
        content: body.content,
        credit: body.credit,
        credit_shown: body.credit_shown,
      })
      editing = null
    })
  }

  function download(which: 'approved' | 'imported'): void {
    void run(async () =>
      downloadJson(await exportSuggestions(token, which), exportName(which, new Date())),
    )
  }

  function imported(): void {
    void run(() => markImported(token))
  }

  function sent(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  /** The pages to check it against; an item names none, so it is the wiki's own page for it. */
  function checksOf(row: QueuedSuggestion): string[] {
    if (row.kind === 'item') {
      const name = (row.content as ItemContent).name.replace(/ /g, '_')
      return [`https://oldschool.runescape.wiki/w/${encodeURIComponent(name)}`]
    }
    const { wiki, source_url: source } = row.content as QuestionContent
    return [wiki, source].filter((url) => url !== undefined)
  }

  function explanationOf(row: QueuedSuggestion): string | null {
    if (row.kind !== 'question') return null
    const explanation = (row.content as QuestionContent).payload.explanation
    return typeof explanation === 'string' ? explanation : null
  }

  function kindLine(row: QueuedSuggestion): string {
    if (row.kind !== 'question') return KIND_LABELS[row.kind]
    const content = row.content as QuestionContent
    return modeName(content.mode)
  }
</script>

<section class="panel" aria-labelledby="suggestions-heading">
  <div class="head">
    <h2 id="suggestions-heading">Suggestions</h2>
    <div class="tabs" role="tablist" aria-label="Status">
      {#each STATUSES as each (each)}
        <button
          type="button"
          role="tab"
          aria-selected={status === each}
          class:on={status === each}
          onclick={() => (status = each)}
        >
          {STATUS_LABELS[each]}
          <span class="count">{queue?.counts[each] ?? '–'}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if failure !== null}
    <div class="banner bad" role="alert">{failure}</div>
  {/if}

  {#if status === 'approved' && queue !== null}
    <div class="export">
      {#if exported > 0}
        <p>
          <strong>{exported} exported.</strong> Run <code>make import-suggestions FILE=…</code>,
          merge it, then mark them imported. Anything approved since waits for the next export.
        </p>
        <div class="row">
          <button type="button" class="primary" disabled={busy} onclick={imported}>
            Mark {exported} as imported
          </button>
          <button
            type="button"
            disabled={busy || exportable === 0}
            onclick={() => download('approved')}
          >
            Export again
          </button>
        </div>
      {:else}
        <p class="note">
          Export downloads every approved suggestion whose round is playable, for
          <code>make import-suggestions</code>.
        </p>
        <button
          type="button"
          class="primary"
          disabled={busy || exportable === 0}
          onclick={() => download('approved')}
        >
          Export {exportable} approved
        </button>
      {/if}
    </div>
  {:else if status === 'imported' && rows.length > 0}
    <div class="export">
      <p class="note">Already imported. Download them again if an import has to be redone.</p>
      <button type="button" disabled={busy} onclick={() => download('imported')}>
        Export again
      </button>
    </div>
  {/if}

  {#if queue === null}
    <p class="note">Loading…</p>
  {:else if rows.length === 0}
    <p class="note">Nothing {STATUS_LABELS[status].toLowerCase()}.</p>
  {:else}
    <ul class="list">
      {#each rows as row (row.id)}
        {@const choice = choiceOf(row.kind, row.content)}
        <li class:open={opened === row.id}>
          <button
            type="button"
            class="summary"
            aria-expanded={opened === row.id}
            onclick={() => {
              opened = opened === row.id ? null : row.id
              editing = null
            }}
          >
            <img src={npcArt(choice?.host ?? 'innkeeper').url} alt="" />
            <span class="chip">{kindLine(row)}</span>
            <span class="text">{summary(row)}</span>
            {#if !row.playable}<span class="chip warn">Waits for its round</span>{/if}
            {#if row.exported_at !== null}<span class="chip ok">Exported</span>{/if}
            <span class="who">{row.credit}{row.credit_shown ? '' : ' · hidden'}</span>
            <span class="when">{sent(row.created_at)}</span>
          </button>

          {#if opened === row.id}
            <div class="detail">
              {#if editing === row.id && choice !== undefined}
                <SuggestionEditor
                  {choice}
                  initial={row}
                  saveLabel="Save"
                  onsave={(body) => save(row, body)}
                  oncancel={() => (editing = null)}
                />
              {:else}
                <div class="preview" aria-label="As players will see it">
                  {#if row.kind === 'question'}
                    {@const content = row.content as QuestionContent}
                    {#if content.random_event !== undefined}
                      <RandomEvent
                        question={questionPreview(content)}
                        yourValue={null}
                        onAnswer={() => {}}
                      />
                    {:else}
                      <QuestionStage
                        question={questionPreview(content)}
                        yourValue={null}
                        onAnswer={() => {}}
                      />
                    {/if}
                  {:else if row.kind === 'examine'}
                    {@const examine = row.content as ExamineContent}
                    <QuestionStage
                      question={examinePreview(examine.prompt, [examine.name, ...(examine.decoys ?? [])])}
                      yourValue={null}
                      onAnswer={() => {}}
                    />
                  {:else}
                    <p class="item">{(row.content as ItemContent).name}</p>
                  {/if}
                </div>
                <div class="facts">
                  <dl>
                    <dt>Answer</dt>
                    <dd><strong>{answerOf(row)}</strong></dd>
                    {#if explanationOf(row) !== null}
                      <dt>Explanation</dt>
                      <dd>{explanationOf(row)}</dd>
                    {/if}
                    <dt>Credit</dt>
                    <dd>
                      {row.credit}
                      <span class="note">
                        {row.credit_shown ? 'shown to players' : 'not shown to players'}
                      </span>
                    </dd>
                    <dt>Sent</dt>
                    <dd>{sent(row.created_at)}</dd>
                  </dl>
                  {#each checksOf(row) as link, index (link)}
                    <p class="check">
                      <span class="note">{index === 0 ? 'Fact-check' : 'Also'}</span>
                      <a href={link} target="_blank" rel="noopener noreferrer">{link} ↗</a>
                    </p>
                  {/each}
                  {#if row.status !== 'imported'}
                    <div class="row">
                      {#if row.status !== 'approved'}
                        <button
                          type="button"
                          class="primary"
                          disabled={busy}
                          onclick={() => move(row, 'approved')}
                        >
                          Approve
                        </button>
                      {/if}
                      <button type="button" disabled={busy} onclick={() => (editing = row.id)}>
                        Edit
                      </button>
                      {#if row.status !== 'rejected'}
                        <button
                          type="button"
                          class="reject"
                          disabled={busy}
                          onclick={() => move(row, 'rejected')}
                        >
                          Reject
                        </button>
                      {/if}
                      {#if row.status !== 'pending'}
                        <button type="button" disabled={busy} onclick={() => move(row, 'pending')}>
                          Back to pending
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .head h2 {
    margin: 0;
  }

  .tabs {
    display: inline-flex;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    overflow: hidden;
  }

  .tabs button {
    border: none;
    border-radius: 0;
    border-right: var(--border-width) solid var(--line);
    background: var(--panel-raised);
  }

  .tabs button:last-child {
    border-right: none;
  }

  .tabs button.on {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
  }

  .count {
    margin-left: 0.35rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }

  .export {
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .export p {
    margin: 0 0 0.6rem;
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

  .chip.ok {
    border-color: var(--ok);
    color: var(--ok);
  }

  .chip.warn {
    border-color: var(--warn);
    color: var(--warn);
  }

  .who,
  .when {
    flex: none;
    font-size: 0.85rem;
    color: var(--muted);
    white-space: nowrap;
  }

  .when {
    width: 10rem;
    text-align: right;
  }

  .detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.5rem;
    padding: 1rem;
    border-top: 1px dashed var(--line);
  }

  .detail > :global(.editor) {
    grid-column: 1 / -1;
  }

  .item {
    font-size: 1.2rem;
    font-weight: 700;
    margin: 0;
  }

  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.35rem 1rem;
    margin: 0 0 1rem;
  }

  dt {
    color: var(--muted);
    font-size: 0.9rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .check {
    display: grid;
    gap: 0.2rem;
    padding: 0.6rem 0.8rem;
    margin: 0 0 1rem;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel);
  }

  .check a {
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .reject {
    border-color: var(--bad);
    color: var(--bad);
  }
</style>
