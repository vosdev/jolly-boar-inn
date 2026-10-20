<script lang="ts">
  /**
   * The standings between two rounds (section 11 of ideas/design.md): the Wise Old Man's
   * hiscores on the stage.
   *
   * The rows start where they stood before the round, with the totals then. Once his line
   * has typed the gains count up, then the rows move to their new places with an arrow
   * for each move, and last your row may pin to the foot of the screen. It all starts once
   * the stage has come over to him and fits well inside the phase's ten seconds; reduced
   * motion starts at the end.
   */
  import { untrack } from 'svelte'

  import { HISCORES_HOST, previousOrder, roundLine, SHUFFLE, shuffleTimes } from '../lib/hiscores'
  import { reducedMotion } from '../lib/interlude'
  import type { Segment, Standing } from '../lib/protocol'
  import { stageArrival } from '../lib/sharedStage.svelte'
  import { players } from '../lib/stores'
  import { lettersOf } from '../lib/typing.svelte'
  import Hiscores from './Hiscores.svelte'
  import HiscoresHead from './HiscoresHead.svelte'
  import Stage from './stage/Stage.svelte'
  import TypeIn from './stage/TypeIn.svelte'

  let {
    standings,
    segment,
    youId = null,
  }: {
    standings: Standing[]
    /** The round just played. */
    segment: Segment | null
    youId?: string | null
  } = $props()

  const line = $derived(roundLine((segment?.index ?? 0) + 1))
  const instant = reducedMotion()
  const open = Math.max(SHUFFLE.open, stageArrival({ host: HISCORES_HOST, tall: true }))
  let settled = $state(instant)
  let moved = $state(instant)
  let pinned = $state(instant)

  // The order before the round is fixed as the screen opens; a kick mid-phase only drops a row.
  const before = untrack(() =>
    previousOrder(
      standings,
      $players.map((player) => player.id),
    ).map((standing) => standing.player_id),
  )
  const rows = $derived(
    moved
      ? standings
      : before.flatMap((id) => standings.filter((standing) => standing.player_id === id)),
  )

  $effect(() => {
    if (instant) return
    const times = untrack(() => shuffleTimes(lettersOf(line), open))
    const timers = [
      setTimeout(() => (settled = true), times.settle),
      setTimeout(() => (moved = true), times.move),
      setTimeout(() => (pinned = true), times.pin),
    ]
    return () => timers.forEach(clearTimeout)
  })
</script>

<Stage host={HISCORES_HOST} tall>
  {#snippet paper()}
    <HiscoresHead title="Hiscores"><TypeIn {line} from={open} /></HiscoresHead>
    <Hiscores {rows} {youId} {settled} {pinned} {instant} />
  {/snippet}
</Stage>
