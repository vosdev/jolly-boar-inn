<script lang="ts">
  /**
   * Under a reveal's buttons: how many of the room got it right, and, if the host turned
   * it on, who got it wrong (D8).
   *
   * Everything here comes from `question_closed.results`, which already carries every
   * player's row; nothing new crosses the wire. "Right" is `correct`, full credit. Partial
   * credit gets a line per band under it, so a closest-number question, where almost
   * nobody is exact, does not read as "0 of 6". "Wrong" is under the lowest band: a guess
   * that earned its 200 for having a go is still wrong, one that came within 70% is not
   * called out. A player who did not answer is neither: sitting a question out is not
   * getting it wrong (the points slot makes the same distinction).
   *
   * The names are the room's taste, so they are `settings.name_wrong_answers`, off unless
   * the host asks. The count is always there: it is the answer to "was that a hard one?",
   * which is what people ask each other across the table while the reveal runs.
   */
  import type { PlayerResult } from '../lib/protocol'

  let {
    results,
    nameOf,
    youId,
    showNames,
  }: {
    results: Record<string, PlayerResult>
    /** A player's name by id; null for somebody the room no longer knows. */
    nameOf: (id: string) => string | null
    youId: string | null
    showNames: boolean
  } = $props()

  // Highest first: a player counts once, in the first band their credit reaches.
  const BANDS = [0.9, 0.8, 0.7]
  const LOWEST = BANDS[BANDS.length - 1]

  const rows = $derived(Object.entries(results))
  const right = $derived(rows.filter(([, result]) => result.correct).length)
  const bands = $derived(
    BANDS.map((least, index) => ({
      percent: Math.round(least * 100),
      count: rows.filter(
        ([, { correct, credit }]) =>
          !correct && credit >= least && (index === 0 || credit < BANDS[index - 1]),
      ).length,
    })).filter((band) => band.count > 0),
  )
  const wrong = $derived(
    rows
      .filter(([, result]) => !result.correct && result.credit < LOWEST)
      .map(([id]) => ({ id, name: nameOf(id) ?? 'Someone who left', you: id === youId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
</script>

<div class="tally">
  {#if rows.length === 0}
    <p class="count">Nobody answered this one.</p>
  {:else}
    <p class="count">
      <strong class="number">{right} of {rows.length}</strong> got it right
    </p>
    {#each bands as band (band.percent)}
      <p class="count band">
        <strong class="number">{band.count} of {rows.length}</strong>
        {band.count === 1 ? 'was' : 'were'} at least {band.percent}% right
      </p>
    {/each}
    {#if showNames && wrong.length > 0}
      <p class="wrong">
        <span class="label">Got it wrong:</span>
        {#each wrong as player, index (player.id)}
          <span class="who" class:you={player.you}>{player.name}{player.you ? ' (you)' : ''}</span
          >{index < wrong.length - 1 ? ', ' : ''}
        {/each}
      </p>
    {/if}
  {/if}
</div>

<style>
  .tally {
    margin: 1rem 0 0;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
    font-size: 0.95rem;
  }

  p {
    margin: 0;
  }

  .count {
    color: var(--muted);
  }

  .band {
    margin-top: 0.2rem;
  }

  .number {
    color: var(--ink);
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
  }

  .wrong {
    margin-top: 0.35rem;
    overflow-wrap: anywhere;
  }

  .label {
    color: var(--muted);
  }

  .who.you {
    font-weight: 600;
  }
</style>
