<script lang="ts">
  /**
   * A finished game, drawn from this browser's history with no server involved: the
   * room behind it has most likely been deleted, and its code may be someone else's.
   */
  import FinalStandings from '../components/FinalStandings.svelte'
  import { finishedTime } from '../lib/dates'
  import { findPastGame } from '../lib/history'

  let {
    code,
    stamp,
    navigate,
  }: { code: string; stamp: string; navigate: (to: string) => void } = $props()

  const game = $derived(findPastGame(code, stamp))
</script>

{#if game === null}
  <h1>Room {code}</h1>
  <section class="panel">
    <p>This browser kept no result for that game.</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else}
  <FinalStandings standings={game.standings} youId={game.youId}>
    <p class="note">Room {game.code}, finished {finishedTime(game.finishedAt)}. The room has closed.</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </FinalStandings>
{/if}
