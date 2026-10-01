<script lang="ts">
  /**
   * The final screen's heading, headline and podium: the live room's last screen, and a
   * past game opened from this browser's history.
   */
  import type { Snippet } from 'svelte'

  import type { Standing } from '../lib/protocol'
  import Scoreboard from './Scoreboard.svelte'

  let {
    standings,
    youId,
    children,
  }: {
    standings: Standing[]
    youId: string | null
    /** What the panel under the table offers: a note, the way home. */
    children: Snippet
  } = $props()

  const winners = $derived(standings.filter((standing) => standing.rank === 1))
  const topScore = $derived(winners[0]?.points ?? 0)
  /** Same grouping as the scoreboard, so the headline and the table agree. */
  const numbers = new Intl.NumberFormat()
</script>

<h1>Final standings</h1>
{#if winners.length > 0}
  <p class="tagline">
    {winners.map((w) => w.display_name).join(' and ')}
    {winners.length === 1 ? 'wins' : 'tie for first'} with {numbers.format(topScore)}
    points.
  </p>
{:else}
  <p class="tagline">Nobody scored. A quiet night at the inn.</p>
{/if}
<Scoreboard {standings} {youId} final />
<section class="panel">
  <!-- Rank is dense (section 6), so level scores genuinely share a place; what the
       sort settles is the order they are listed in, not the rank. -->
  <p class="note">
    Level scores share a place. Between them, more correct answers comes first, and
    after that the earliest to join.
  </p>
  {@render children()}
</section>
