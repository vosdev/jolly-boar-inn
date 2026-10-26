<script lang="ts">
  /**
   * A finished game, drawn from this browser's history with no server involved: the
   * room behind it has most likely been deleted, and its code may be someone else's.
   *
   * It is drawn as the room's final screen, in the room's frame, without the ceremony; the
   * top bar names the game and when it ended.
   */
  import { onMount, untrack } from 'svelte'

  import FinalStandings from '../components/FinalStandings.svelte'
  import RoomFrame from '../components/RoomFrame.svelte'
  import Said from '../components/stage/Said.svelte'
  import Stage from '../components/stage/Stage.svelte'
  import { barPast } from '../lib/barWhere'
  import { findPastGame } from '../lib/history'
  import { HISCORES_HOST, HISCORES_HOST_NAME } from '../lib/hiscores'
  import { measureRoom, watchRoomSize } from '../lib/roomFit'
  import { resetRoom } from '../lib/stores'

  let { code, stamp, navigate }: { code: string; stamp: string; navigate: (to: string) => void } =
    $props()

  const NO_RECORD = "I've no record of that game. This browser kept no hiscores for it."

  // The hiscores name players from the room's stores first, and a room left earlier may
  // still be in them.
  untrack(resetRoom)

  const game = $derived(findPastGame(code, stamp))
  let fit = $state(measureRoom())

  onMount(() => {
    const stop = watchRoomSize(() => (fit = measureRoom()))
    return () => {
      stop()
      barPast.set(null)
    }
  })

  $effect(() => {
    barPast.set(
      game === null ? { code, finishedAt: null } : { code: game.code, finishedAt: game.finishedAt },
    )
  })
</script>

{#snippet noRecord()}{NO_RECORD}{/snippet}

<RoomFrame {fit} final>
  {#if game === null}
    <Stage host={HISCORES_HOST} bubble="on">
      {#snippet said()}
        <Said name={HISCORES_HOST_NAME} line={noRecord} />
      {/snippet}
      {#snippet paper()}
        <h1 class="room">Room {code}</h1>
      {/snippet}
      <div class="panel after">
        <button type="button" onclick={() => navigate('/')}>Home</button>
      </div>
    </Stage>
  {:else}
    <FinalStandings
      standings={game.standings}
      teamStandings={game.teamStandings ?? null}
      teamOf={game.teams ?? {}}
      youId={game.youId}
      stacked={fit === null}
      past
    >
      <button type="button" onclick={() => navigate('/')}>Home</button>
    </FinalStandings>
  {/if}
</RoomFrame>

<style>
  .room {
    margin: 0;
    text-align: center;
  }

  .after {
    margin-top: 1rem;
  }
</style>
