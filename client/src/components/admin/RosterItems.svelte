<script lang="ts">
  /**
   * `/admin`'s Roster tab: the popular items the price rounds draw on, renamed or
   * removed, and the changes waiting to reach git.
   *
   * Nothing here changes what the server plays. A rename or a removal queues as a pending
   * change against the item's id; a second one replaces it, and Discard drops it. Download
   * hands every pending change to `make edit-roster`, and once that is merged "Mark as
   * applied" drops exactly what the download held. The price pack is generated from the
   * roster, so it follows the next `make gen-price-questions`. Adding an item is a
   * suggestion's job: its import finds the id.
   */
  import { onMount } from 'svelte'

  import {
    discardRosterChange,
    downloadJson,
    exportRosterChanges,
    getRosterChanges,
    getRosterItems,
    markRosterChangesApplied,
    removeRosterItem,
    renameRosterItem,
  } from '../../lib/admin'
  import { ApiFailure } from '../../lib/api'
  import {
    renameProblem,
    rosterChangesFileName,
    searchItems,
    type RosterChange,
    type RosterItem,
  } from '../../lib/rosterEdits'
  import { ITEM_NAME_MAX } from '../../lib/suggestions'

  let { token, onrefused }: { token: string; onrefused: () => void } = $props()

  let items = $state<RosterItem[] | null>(null)
  let changes = $state<RosterChange[] | null>(null)
  let query = $state('')
  let opened = $state<number | null>(null)
  let typed = $state('')
  let attempted = $state(false)
  let failure = $state<string | null>(null)
  let busy = $state(false)

  const found = $derived(searchItems(items ?? [], query))
  const byId = $derived(new Map((changes ?? []).map((change) => [change.item_id, change])))
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
      changes = await getRosterChanges(token)
    } catch (error) {
      fail(error, 'that did not work')
    } finally {
      busy = false
    }
  }

  onMount(async () => {
    try {
      const [listed, pending] = await Promise.all([getRosterItems(token), getRosterChanges(token)])
      items = listed
      changes = pending
    } catch (error) {
      fail(error, 'the roster did not load')
    }
  })

  function open(item: RosterItem): void {
    opened = opened === item.id ? null : item.id
    typed = byId.get(item.id)?.name ?? item.name
    attempted = false
  }

  const problem = $derived.by(() => {
    const item = items?.find((each) => each.id === opened)
    return item === undefined ? null : renameProblem(item, typed, items ?? [])
  })

  function rename(item: RosterItem): void {
    attempted = true
    if (problem !== null) return
    void run(async () => {
      await renameRosterItem(token, item.id, typed.trim())
      opened = null
    })
  }

  function remove(item: RosterItem): void {
    void run(async () => {
      await removeRosterItem(token, item.id)
      opened = null
    })
  }

  function discard(change: RosterChange): void {
    void run(() => discardRosterChange(token, change.item_id))
  }

  function download(): void {
    void run(async () =>
      downloadJson(await exportRosterChanges(token), rosterChangesFileName(new Date())),
    )
  }

  function applied(): void {
    void run(() => markRosterChangesApplied(token))
  }
</script>

<section class="panel" aria-labelledby="roster-changes-heading">
  <h2 id="roster-changes-heading">Pending changes</h2>

  {#if failure !== null}
    <div class="banner bad">{failure}</div>
  {/if}

  {#if changes === null}
    <p class="note">Loading…</p>
  {:else if changes.length === 0}
    <p class="note">
      None. A rename or a removal waits here until it is downloaded, applied with
      <code>make edit-roster</code> and merged; the game plays the roster as it is until then.
    </p>
  {:else}
    <ul class="list">
      {#each changes as change (change.item_id)}
        <li class="row-item">
          <span class="chip" class:bad={change.action === 'remove'}>
            {change.action === 'rename' ? 'Rename' : 'Remove'}
          </span>
          <span class="text">
            {change.name === null ? change.before : `${change.before} → ${change.name}`}
          </span>
          {#if !change.in_roster}<span class="chip warn">No longer on the roster</span>{/if}
          {#if change.exported_at !== null}<span class="chip ok">Downloaded</span>{/if}
          <button type="button" disabled={busy} onclick={() => discard(change)}>Discard</button>
        </li>
      {/each}
    </ul>
    <div class="export">
      {#if exported > 0}
        <p>
          <strong>{exported} downloaded.</strong> Run <code>make edit-roster FILE=…</code>, merge
          it, then mark them applied. A change made since waits for the next download. The price
          pack follows the next <code>make gen-price-questions</code>.
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

<section class="panel" aria-labelledby="roster-heading">
  <h2 id="roster-heading">Popular items</h2>
  <div class="field">
    <label for="roster-search">Search</label>
    <input id="roster-search" type="text" bind:value={query} />
  </div>

  {#if items === null}
    <p class="note">Loading…</p>
  {:else if found.length === 0}
    <p class="note">No item matches.</p>
  {:else}
    <p class="note">{found.length} of {items.length}</p>
    <ul class="list">
      {#each found as item (item.id)}
        {@const change = byId.get(item.id)}
        <li>
          <button
            type="button"
            class="summary"
            aria-expanded={opened === item.id}
            onclick={() => open(item)}
          >
            <span class="text">{item.name}</span>
            <span class="note">{item.id}</span>
            {#if change !== undefined}
              <span class="chip" class:bad={change.action === 'remove'}>
                {change.action === 'rename' ? `Renamed to ${change.name}` : 'To remove'}
              </span>
            {/if}
          </button>
          {#if opened === item.id}
            <div class="detail">
              <div class="field">
                <label for="roster-name">Name</label>
                <input
                  id="roster-name"
                  type="text"
                  maxlength={ITEM_NAME_MAX * 2}
                  bind:value={typed}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') rename(item)
                  }}
                />
                {#if attempted && problem !== null}<p class="error">{problem}</p>{/if}
              </div>
              <div class="row">
                <button type="button" class="primary" disabled={busy} onclick={() => rename(item)}>
                  Queue the rename
                </button>
                {#if change?.action !== 'remove'}
                  <button type="button" class="reject" disabled={busy} onclick={() => remove(item)}>
                    Remove
                  </button>
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
  h2 {
    margin: 0 0 1rem;
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

  .summary,
  .row-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }

  .row-item {
    padding: 0.5rem 0.75rem;
  }

  .summary {
    border: none;
    border-radius: 0;
    background: none;
    text-align: left;
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
    padding: 1rem;
    border-top: 1px dashed var(--line);
  }

  .detail input {
    width: 100%;
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
