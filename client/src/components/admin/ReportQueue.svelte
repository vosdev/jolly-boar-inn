<script lang="ts">
  /**
   * The operator's queue of question reports, in `/admin`: what a player says is wrong,
   * beside the question as it was filed, and a way to close it once the pack is fixed.
   *
   * A report keeps a snapshot of its question, since a fixed question has a new id. The
   * mode's current pack questions are fetched to say whether the pack still holds it; a
   * price report names an item, and the day's questions that ask about it are listed.
   * Closed reports are kept, and can be reopened.
   *
   * Everything a player typed is drawn as text, never as markup.
   */
  import { untrack } from 'svelte'

  import { getPackQuestions, getReports, setReportStatus, type ReportQueue } from '../../lib/admin'
  import { ApiFailure } from '../../lib/api'
  import { npcArt } from '../../lib/npcs'
  import { pictureUrl } from '../../lib/pictures'
  import { screenshotFile } from '../../lib/screenshots.svelte'
  import {
    asksAbout,
    isItem,
    itemWiki,
    reportHost,
    reportModeName,
    reportSummary,
    type PackQuestion,
    type QueuedReport,
    type ReportStatus,
  } from '../../lib/reports'
  import PackQuestionView from './PackQuestionView.svelte'

  let { token, onrefused }: { token: string; onrefused: () => void } = $props()

  const STATUSES: { value: ReportStatus; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
  ]

  let status = $state<ReportStatus>('open')
  let queue = $state<ReportQueue | null>(null)
  /** Each mode's pack questions by id, as this build has them. */
  let packs = $state<Record<string, Map<string, PackQuestion>>>({})
  let opened = $state<string | null>(null)
  let failure = $state<string | null>(null)
  let busy = $state(false)

  const rows = $derived(queue?.reports ?? [])

  function fail(error: unknown, otherwise: string): void {
    if (error instanceof ApiFailure && error.status === 401) onrefused()
    else failure = error instanceof ApiFailure ? error.message : otherwise
  }

  async function loadPacks(reports: QueuedReport[]): Promise<void> {
    const missing = [...new Set(reports.map((r) => r.mode))].filter((m) => !(m in packs))
    const fetched = await Promise.all(missing.map((mode) => getPackQuestions(token, mode)))
    const next = { ...packs }
    missing.forEach((mode, index) => {
      next[mode] = new Map(fetched[index]!.map((question) => [question.id, question]))
    })
    packs = next
  }

  async function load(wanted: ReportStatus): Promise<void> {
    try {
      const next = await getReports(token, wanted)
      if (status !== wanted) return
      queue = next
      await loadPacks(next.reports)
    } catch (error) {
      fail(error, 'the reports did not load')
    }
  }

  $effect(() => {
    const wanted = status
    untrack(() => {
      opened = null
      queue = null
      void load(wanted)
    })
  })

  async function move(row: QueuedReport, next: ReportStatus): Promise<void> {
    if (busy) return
    busy = true
    failure = null
    try {
      await setReportStatus(token, row.id, next)
      queue = await getReports(token, status)
    } catch (error) {
      fail(error, 'that did not work')
    } finally {
      busy = false
    }
  }

  /** Whether the pack still holds the reported question; null while unknown or not one. */
  function inPack(row: QueuedReport): boolean | null {
    if (row.question_id === null) return null
    const pack = packs[row.mode]
    return pack === undefined ? null : pack.has(row.question_id)
  }

  function asking(row: QueuedReport, item: number): PackQuestion[] {
    return [...(packs[row.mode]?.values() ?? [])].filter((question) => asksAbout(question, item))
  }

  function sent(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }
</script>

<section class="panel" aria-labelledby="reports-heading">
  <div class="head">
    <h2 id="reports-heading">Reports</h2>
    <div class="tabs" role="tablist" aria-label="Report status">
      {#each STATUSES as each (each.value)}
        <button
          type="button"
          role="tab"
          aria-selected={status === each.value}
          class:on={status === each.value}
          onclick={() => (status = each.value)}
        >
          {each.label}
          <span class="count">{queue?.counts[each.value] ?? '–'}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if failure !== null}
    <div class="banner bad">{failure}</div>
  {/if}

  {#if queue === null}
    <p class="note">Loading…</p>
  {:else if rows.length === 0}
    <p class="note">No {status} reports.</p>
  {:else}
    <ul class="list">
      {#each rows as row (row.id)}
        {@const kept = inPack(row)}
        <li>
          <button
            type="button"
            class="summary"
            aria-expanded={opened === row.id}
            onclick={() => (opened = opened === row.id ? null : row.id)}
          >
            <img src={npcArt(reportHost(row.mode)).url} alt="" />
            <span class="chip">{reportModeName(row.mode)}</span>
            {#if row.snapshot !== null && !isItem(row.snapshot)}
              {@const shot = screenshotFile(row.snapshot.payload)}
              {#if shot !== null}<img class="shot" src={pictureUrl(shot)} alt="" />{/if}
            {/if}
            <span class="text">{reportSummary(row)}</span>
            {#if kept === false}<span class="chip warn">No longer in the pack</span>{/if}
            <span class="when">{sent(row.created_at)}</span>
          </button>

          {#if opened === row.id}
            {@const snapshot = row.snapshot}
            <div class="detail">
              <div>
                <h3>What is wrong</h3>
                <p class="report">{row.text}</p>
                <div class="row">
                  {#if row.status === 'open'}
                    <button
                      type="button"
                      class="primary"
                      disabled={busy}
                      onclick={() => void move(row, 'closed')}
                    >
                      Close
                    </button>
                  {:else}
                    <button type="button" disabled={busy} onclick={() => void move(row, 'open')}>
                      Reopen
                    </button>
                  {/if}
                </div>
              </div>
              <div>
                {#if snapshot === null}
                  <p class="note">About no one question.</p>
                {:else if isItem(snapshot)}
                  <h3>{snapshot.name}</h3>
                  <p class="link">
                    <a href={itemWiki(snapshot.id)} target="_blank" rel="noopener noreferrer">
                      Item {snapshot.id} on the wiki ↗
                    </a>
                  </p>
                  {@const questions = asking(row, snapshot.id)}
                  {#if questions.length === 0}
                    <p class="note">No question in this build asks about it.</p>
                  {:else}
                    <p class="note">{questions.length} in this build ask about it:</p>
                    {#each questions as question (question.id)}
                      <PackQuestionView {question} />
                    {/each}
                  {/if}
                {:else}
                  <h3>
                    {kept === false ? 'As filed; no longer in the pack' : 'As filed'}
                  </h3>
                  <PackQuestionView question={snapshot} />
                {/if}
              </div>
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

  .summary img.shot {
    width: 64px;
    height: 36px;
    object-fit: cover;
    image-rendering: auto;
    border-radius: 4px;
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

  .when {
    flex: none;
    width: 10rem;
    font-size: 0.85rem;
    color: var(--muted);
    text-align: right;
    white-space: nowrap;
  }

  .detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.5rem;
    padding: 1rem;
    border-top: 1px dashed var(--line);
  }

  h3 {
    margin: 0 0 0.6rem;
    font-size: 1rem;
  }

  .report {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0 0 1rem;
  }

  .link {
    margin: 0 0 0.75rem;
  }
</style>
