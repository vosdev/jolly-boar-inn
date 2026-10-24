<script lang="ts">
  /**
   * The standings between two rounds (section 11 of ideas/design.md): the Wise Old Man's
   * hiscores on the stage, his line in his bubble, and "Next up" in the table panel.
   *
   * The rows start where they stood before the round, with the totals then. Once his line
   * has typed the gains count up, then the rows move to their new places with an arrow
   * for each move, and last your row may pin to the foot of the screen. It all starts once
   * the stage has come over to him and fits well inside the phase's ten seconds; reduced
   * motion starts at the end.
   *
   * A team game ranks its teams the same way, each with its members under it.
   *
   * On the room's TV the sheet takes the whole stage with his line on it, a long table
   * scrolls (`crawl`), and nothing says what is next.
   */
  import { untrack } from 'svelte'

  import {
    HISCORES_HOST,
    HISCORES_HOST_NAME,
    previousOrder,
    previousTeamOrder,
    roundLine,
    SHUFFLE,
    shuffleTimes,
  } from '../lib/hiscores'
  import { reducedMotion } from '../lib/interlude'
  import type { Segment, Standing, TeamStanding } from '../lib/protocol'
  import { stageArrival, type Bubble } from '../lib/sharedStage.svelte'
  import { players } from '../lib/stores'
  import { teamsOf } from '../lib/teams'
  import { crawl } from '../lib/tv'
  import { lettersOf } from '../lib/typing.svelte'
  import AtTable from './AtTable.svelte'
  import Hiscores from './Hiscores.svelte'
  import HiscoresHead from './HiscoresHead.svelte'
  import NextUp from './NextUp.svelte'
  import Said from './stage/Said.svelte'
  import Stage from './stage/Stage.svelte'
  import TypeIn from './stage/TypeIn.svelte'
  import TeamHiscores from './TeamHiscores.svelte'

  let {
    standings,
    teamStandings = null,
    segment,
    next = null,
    endsAt = null,
    youId = null,
    stacked = false,
    tv = false,
  }: {
    standings: Standing[]
    /** A team game's teams; null outside one. */
    teamStandings?: TeamStanding[] | null
    /** The round just played. */
    segment: Segment | null
    /** The round after it, `room.next_segment`. */
    next?: Segment | null
    /** When the standings end, `room.next_at`. */
    endsAt?: string | null
    youId?: string | null
    /** Laid out for a phone: two lines a row, and "Next up" a strip at the foot. */
    stacked?: boolean
    /** Drawn on the room's TV. */
    tv?: boolean
  } = $props()

  const line = $derived(roundLine((segment?.index ?? 0) + 1))
  const instant = reducedMotion()
  const bubble = $derived<Bubble | null>(tv ? null : 'on')
  const open = untrack(() =>
    Math.max(SHUFFLE.open, stageArrival({ host: HISCORES_HOST, tall: tv, tv, wide: tv, bubble })),
  )
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

  const teamsBefore = untrack(() =>
    teamStandings === null ? [] : previousTeamOrder(teamStandings).map((row) => row.team),
  )
  const teamRows = $derived(
    teamStandings === null
      ? null
      : moved
        ? teamStandings
        : teamsBefore.flatMap((god) => teamStandings.filter((row) => row.team === god)),
  )
  const teamOf = $derived(teamsOf($players))

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

<Stage host={HISCORES_HOST} tall={tv} {tv} wide={tv} {bubble}>
  {#snippet paper()}
    {#if tv}
      <HiscoresHead title="Hiscores"><TypeIn {line} from={open} /></HiscoresHead>
    {/if}
    <div use:crawl={tv}>
      {#if teamRows !== null}
        <TeamHiscores
          teams={teamRows}
          {standings}
          {teamOf}
          {youId}
          {settled}
          {instant}
          columns={!stacked && !tv}
        />
      {:else}
        <Hiscores {rows} {youId} {settled} {pinned} {instant} columns={!stacked && !tv} />
      {/if}
    </div>
  {/snippet}

  {#snippet said()}
    <Said name={HISCORES_HOST_NAME} line={words} />
  {/snippet}
</Stage>

{#snippet words()}
  <p><TypeIn {line} from={open} /></p>
{/snippet}

{#if !tv && next !== null}
  <AtTable>
    <NextUp segment={next} {endsAt} {stacked} />
  </AtTable>
{/if}
