<script lang="ts">
  /**
   * "Already in the game": the pack questions of the mode a suggestion is for, so a player
   * finds an example or sees that theirs is already asked.
   *
   * Each row is what players read while the question is open (`reports.label` on the
   * server), never its answer. A random event's row shows who asks it, the NPC the player
   * picked first. Pending and approved suggestions are not in the packs, so never here.
   * A mode with nothing to list, whether it is not built, not offered here or the fetch
   * failed, gets one line: the list is help, never worth an error.
   */
  import { onMount } from 'svelte'

  import { getReportChoices } from '../../lib/api'
  import { randomEventFor } from '../../lib/randomEvents'
  import type { ReportChoice } from '../../lib/reports'
  import { inGameOrder } from '../../lib/suggestions'
  import { matches, SHOWN_MAX, words } from '../../lib/vocab'
  import NpcFace from '../NpcFace.svelte'

  let {
    mode,
    npc = '',
    open = false,
    onloaded = undefined,
  }: {
    mode: string
    /** The NPC picked to ask a random event's question, `''` for none yet. */
    npc?: string
    /** Whether it starts open. */
    open?: boolean
    /** Told the questions once they arrive, so the editor can refuse one already asked. */
    onloaded?: (rows: readonly ReportChoice[]) => void
  } = $props()

  const uid = $props.id()
  let rows = $state<readonly ReportChoice[] | 'loading' | 'none'>('loading')
  let query = $state('')

  onMount(() => {
    getReportChoices(mode).then(
      (found) => {
        rows = found.by === 'question' && found.choices.length > 0 ? found.choices : 'none'
        if (typeof rows !== 'string') onloaded?.(rows)
      },
      () => (rows = 'none'),
    )
  })

  // Folded once per list, rather than on every keystroke.
  const indexed = $derived(
    typeof rows === 'string'
      ? []
      : rows.map((row) => ({
          row,
          label: words(row.label),
          asker: row.random_event === undefined ? [] : words(randomEventFor(row.random_event).name),
        })),
  )
  const found = $derived.by(() => {
    const wanted = words(query)
    const hits = indexed
      .filter((entry) => matches(entry.label, wanted) || matches(entry.asker, wanted))
      .map((entry) => entry.row)
    return inGameOrder(hits, npc)
  })
</script>

<details class="panel existing" aria-labelledby="{uid}-title" {open}>
  <summary><h2 id="{uid}-title">Already in the game</h2></summary>
  {#if rows === 'loading'}
    <p class="note">Fetching the list…</p>
  {:else if rows === 'none'}
    <p class="note">The game has no questions here yet.</p>
  {:else}
    <input
      type="search"
      aria-label="Search the questions already in the game"
      placeholder="Search"
      bind:value={query}
    />
    {#if found.length === 0}
      <p class="note">None of them match.</p>
    {:else}
      <ul aria-labelledby="{uid}-title">
        {#each found.slice(0, SHOWN_MAX) as row (row.id)}
          <li>
            {#if row.random_event !== undefined}
              <span class="face"><NpcFace npc={row.random_event} /></span>
              <span>
                <strong>{randomEventFor(row.random_event).name}</strong>
                {row.label}
              </span>
            {:else}
              {row.label}
            {/if}
          </li>
        {/each}
      </ul>
      {#if found.length > SHOWN_MAX}
        <p class="note">{found.length - SHOWN_MAX} more — keep typing to narrow the list.</p>
      {/if}
    {/if}
  {/if}
</details>

<style>
  summary {
    cursor: pointer;
  }

  summary h2 {
    display: inline;
    margin: 0;
  }

  .existing[open] summary {
    margin-bottom: 0.75rem;
  }

  input {
    width: 100%;
  }

  /* The list scrolls inside the panel, so a mode with hundreds of questions does not
     push the page out to every one of them. */
  ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    max-height: 60vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--surface-muted) var(--panel-raised);
    overscroll-behavior: contain;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel-raised);
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.7rem;
    overflow-wrap: anywhere;
  }

  li + li {
    border-top: var(--border-width) solid var(--line);
  }

  li strong {
    display: block;
    font-size: 0.85rem;
  }

  .face {
    flex: none;
    display: grid;
    place-items: end center;
    width: 2.4rem;
    height: 2.4rem;
    overflow: hidden;
  }

  .note {
    margin: 0.5rem 0 0;
  }
</style>
