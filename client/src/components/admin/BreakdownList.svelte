<script lang="ts">
  /**
   * One breakdown on the admin page: a row per key, its bar split by metric and scaled to
   * the biggest row, its numbers at the end. One metric needs no legend; several get one.
   */
  import type { Breakdown, Tone } from '../../lib/adminCharts'

  let {
    title,
    rows,
    parts,
    label = (key: string) => key,
    note,
  }: {
    title: string
    rows: Breakdown[]
    /** One per metric, in the order the rows' values are. */
    parts: { label: string; tone: Tone }[]
    label?: (key: string) => string
    note?: string
  } = $props()

  const top = $derived(Math.max(1, ...rows.map((r) => r.total)))
</script>

<section class="breakdown">
  <h3>{title}</h3>
  {#if rows.length === 0}
    <p class="note">Nothing in this range.</p>
  {:else}
    <ol>
      {#each rows as row (row.key)}
        <li>
          <span class="label">{label(row.key)}</span>
          <span class="track" aria-hidden="true">
            {#each parts as part, i (part.label)}
              <span class="tone-{part.tone}" style:width="{((row.values[i] ?? 0) / top) * 100}%"
              ></span>
            {/each}
          </span>
          <span class="count">
            {row.total}
            {#if parts.length > 1}
              <small>({row.values.join(' / ')})</small>
            {/if}
          </span>
        </li>
      {/each}
    </ol>
    {#if parts.length > 1}
      <ul class="legend">
        {#each parts as part (part.label)}
          <li><span class="swatch tone-{part.tone}" aria-hidden="true"></span>{part.label}</li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if note !== undefined}
    <p class="note">{note}</p>
  {/if}
</section>

<style>
  .breakdown {
    min-width: 0;
  }

  h3 {
    font-size: 0.9rem;
    font-weight: normal;
    color: var(--muted);
    margin: 0 0 0.4rem;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  ol li {
    display: grid;
    grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    margin: 0.3rem 0;
    font-size: 0.9rem;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track {
    display: flex;
    height: 0.8rem;
    border-radius: 3px;
    overflow: hidden;
    background: var(--panel-raised);
  }

  .count {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  small {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .note {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .swatch {
    display: inline-block;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 2px;
    margin-right: 0.35rem;
  }

  .tone-ok {
    background: var(--ok);
  }

  .tone-bad {
    background: var(--bad);
  }

  .tone-muted {
    background: var(--muted);
  }

  .tone-accent {
    background: var(--accent);
  }

  .tone-warn {
    background: var(--warn);
  }
</style>
