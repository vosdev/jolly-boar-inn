<script lang="ts">
  /**
   * Under a reveal's buttons: how many of the room got it right, and, if the host turned
   * it on, who got it wrong (D8).
   *
   * Everything here comes from `question_closed.results`, which already carries every
   * player's row; nothing new crosses the wire. "Right" is `correct`, full credit. "Wrong"
   * is an answer that scored nothing, so a closest-number guess that earned its 200 for
   * having a go is not called out, and a player who did not answer is neither: sitting a
   * question out is not getting it wrong (the points slot makes the same distinction).
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

  const rows = $derived(Object.entries(results))
  const right = $derived(rows.filter(([, result]) => result.correct).length)
  const wrong = $derived(
    rows
      .filter(([, result]) => !result.correct && result.points === 0)
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
