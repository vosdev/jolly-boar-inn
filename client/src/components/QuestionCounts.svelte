<script lang="ts">
  /**
   * How many questions there are, as a sheet from the footer: per round, then per NPC who
   * turns up mid-round, most first. Each question counts once, where a room draws it from.
   */
  import type { QuestionCounts } from '../lib/api'
  import { formatCount, modeRows, npcRows, totalQuestions } from '../lib/questionCounts.svelte'
  import Sheet from './Sheet.svelte'
  import SheetHead from './SheetHead.svelte'

  let { counts, onclose }: { counts: QuestionCounts; onclose: () => void } = $props()

  const id = $props.id()

  const tables = $derived([
    { title: 'Rounds', column: 'Round', rows: modeRows(counts) },
    { title: 'Random events', column: 'NPC', rows: npcRows(counts) },
  ])
</script>

<Sheet labelledby="{id}-title" {onclose}>
  <SheetHead id="{id}-title" {onclose}>{formatCount(totalQuestions(counts))} questions</SheetHead>
  {#each tables as table (table.title)}
    {#if table.rows.length > 0}
      <h3>{table.title}</h3>
      <table class="counts" aria-label={table.title}>
        <thead>
          <tr>
            <th scope="col" class="name">{table.column}</th>
            <th scope="col" class="count">Questions</th>
          </tr>
        </thead>
        <tbody>
          {#each table.rows as row (row.id)}
            <tr>
              <td class="name">{row.label}</td>
              <td class="count">{formatCount(row.questions)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/each}
  <p class="suggest">
    Got an idea for a new question?
    <a class="link" href="/suggest" target="_blank" rel="noopener">Suggest one →</a>
  </p>
  <button type="button" class="primary done" onclick={onclose}>Close</button>
</Sheet>

<style>
  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 1rem;
  }

  :global(.sheet-head) + h3 {
    margin-top: 0;
  }

  .counts {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th {
    padding: 0 0.25rem 0.3rem;
    font-weight: normal;
    color: var(--muted);
    border-bottom: 2px solid var(--line);
  }

  td {
    padding: 0.3rem 0.25rem;
    border-top: 1px solid color-mix(in srgb, var(--line) 40%, transparent);
  }

  tbody tr:first-child td {
    border-top: none;
  }

  .name {
    text-align: left;
    overflow-wrap: anywhere;
  }

  .count {
    width: 6rem;
    text-align: right;
  }

  .suggest {
    margin: 1rem 0 0;
  }

  .done {
    width: 100%;
    margin-top: 1rem;
  }
</style>
