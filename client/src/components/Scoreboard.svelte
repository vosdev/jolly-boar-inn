<script lang="ts">
  /**
   * The standings, as the server ranks them.
   *
   * Order and `rank` are the server's (section 6: points desc, then correct answers
   * desc, then `joined_at` asc, dense rank). Nothing is sorted or re-ranked here — two
   * clients disagreeing about who is second is exactly the bug this avoids.
   *
   * `results` is the just-closed question's per-player rows, when there is a reveal on
   * screen. Present and correct shows what the answer earned, present and wrong shows a
   * zero, and absent means that player did not answer at all.
   */
  import type { PlayerResult, Standing } from '../lib/protocol'

  let {
    standings,
    youId = null,
    results = null,
    title = 'Standings',
  }: {
    standings: Standing[]
    youId?: string | null
    results?: Record<string, PlayerResult> | null
    title?: string
  } = $props()

  /** Ranks are dense, so a tie for first gives both players the same medal. That is
   * the honest picture: the tie-break below the table is what separates them. */
  const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

  const points = new Intl.NumberFormat()
</script>

<section class="panel">
  <h2>{title}</h2>
  {#if standings.length === 0}
    <p class="note">No scores yet.</p>
  {:else}
    <ol class="board">
      {#each standings as standing (standing.player_id)}
        {@const delta = results?.[standing.player_id] ?? null}
        <li class:you={standing.player_id === youId}>
          <span class="rank">{MEDALS[standing.rank] ?? standing.rank}</span>
          <span class="name">
            {standing.display_name}{#if standing.player_id === youId}<span class="note"> (you)</span
              >{/if}
          </span>
          {#if results !== null}
            <span class="delta" class:good={delta?.correct} class:none={delta === null}>
              {#if delta === null}—{:else if delta.correct}+{points.format(delta.points)}{:else}0{/if}
            </span>
          {/if}
          <span class="points">{points.format(standing.points)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .board {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .board li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0;
    border-top: 1px solid var(--line);
  }

  .board li:first-child {
    border-top: none;
  }

  .board li.you {
    font-weight: 600;
  }

  .rank {
    flex: none;
    width: 1.75rem;
    text-align: center;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .name {
    flex: 1;
    min-width: 4rem;
    overflow-wrap: anywhere;
  }

  .delta {
    flex: none;
    font-variant-numeric: tabular-nums;
    font-size: 0.9rem;
    color: var(--bad);
  }

  .delta.good {
    color: var(--ok);
  }

  .delta.none {
    color: var(--muted);
  }

  .points {
    flex: none;
    min-width: 3.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }
</style>
