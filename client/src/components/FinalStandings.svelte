<script lang="ts">
  /**
   * The final standings (section 11 of ideas/design.md): the live room's last screen, and a
   * past game opened from this browser's history.
   *
   * With `ceremony`, the game having ended while this client watched, the Wise Old Man
   * first presents fifth place to first, each with its trophy beside the scroll and first
   * with confetti. Then the place fades, the sheet unrolls to the full hiscores with the
   * rows arriving top to bottom, and he congratulates the winners. Skip goes straight to
   * that last step. Without `ceremony`, a reload or a past game, and under reduced motion,
   * the hiscores are simply there.
   *
   * A team game's table ranks its teams, each with its members under it, and he names the
   * winning team instead.
   *
   * On the room's TV the sheet takes the whole stage, a long table scrolls (`crawl`), and
   * nothing is offered: no Skip, and no panel under the table.
   */
  import type { Snippet } from 'svelte'
  import { untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'

  import {
    CEREMONY,
    ceremonyPlaces,
    ceremonyTimes,
    FINAL_INTRO,
    HISCORES_HOST,
    listNames,
    placeLine,
    teamCeremonyPlaces,
    teamWinnersLine,
    unrollMs,
    winnersLine,
    type Place,
    type TeamPlace,
  } from '../lib/hiscores'
  import { reducedMotion } from '../lib/interlude'
  import { petOf } from '../lib/pets'
  import type { Standing, TeamStanding } from '../lib/protocol'
  import { stageArrival } from '../lib/sharedStage.svelte'
  import { players } from '../lib/stores'
  import { team, type TeamId } from '../lib/teams'
  import { tierName, trophyArt } from '../lib/trophies'
  import { crawl } from '../lib/tv'
  import { lettersOf } from '../lib/typing.svelte'
  import Hiscores from './Hiscores.svelte'
  import HiscoresHead from './HiscoresHead.svelte'
  import Pet from './Pet.svelte'
  import Confetti from './stage/Confetti.svelte'
  import Stage from './stage/Stage.svelte'
  import TypeIn from './stage/TypeIn.svelte'
  import TeamHiscores from './TeamHiscores.svelte'
  import TeamLogo from './TeamLogo.svelte'

  let {
    standings,
    teamStandings = null,
    teamOf = {},
    youId,
    ceremony = false,
    past = false,
    tv = false,
    children,
  }: {
    standings: Standing[]
    /** A team game's teams; null outside one. */
    teamStandings?: TeamStanding[] | null
    /** Each player's team by id, in a team game. */
    teamOf?: Record<string, TeamId>
    youId: string | null
    /** Present the top five before the table. */
    ceremony?: boolean
    /** A game from this browser's history: the totals, without the last round's changes. */
    past?: boolean
    /** Drawn on the room's TV. */
    tv?: boolean
    /** What the panel under the table offers: a note, the way home. */
    children: Snippet
  } = $props()

  const numbers = new Intl.NumberFormat()
  const instant = reducedMotion()
  // Fixed as the screen opens: a ceremony does not rearrange itself halfway through.
  const places = untrack(() => ceremonyPlaces(standings))
  // A team game presents its teams, so the players' places and their trophies stay out of it.
  const teamPlaces = untrack(() =>
    teamStandings === null ? null : teamCeremonyPlaces(teamStandings),
  )
  const steps = teamPlaces ?? places
  const lines = [
    FINAL_INTRO,
    ...(teamPlaces ?? places).map((step) =>
      placeLine(step.rank, 'teams' in step ? step.teams.length : step.standings.length),
    ),
  ]
  const playing = untrack(() => ceremony) && !instant && steps.length > 0
  const open = Math.max(CEREMONY.open, stageArrival({ host: HISCORES_HOST, tall: true }))

  let phase = $state<'ceremony' | 'leaving' | 'table'>(playing ? 'ceremony' : 'table')
  let line = $state(0)
  /** The place on the sheet, by index into `places`. */
  let shown = $state<number | null>(null)
  let boardHeight = $state(0)
  /** The board's height as the place left, which the table unrolls from. */
  let unrollFrom = $state(0)

  let timers: ReturnType<typeof setTimeout>[] = []

  function leave(): void {
    if (phase !== 'ceremony') return
    timers.forEach(clearTimeout)
    unrollFrom = boardHeight
    phase = 'leaving'
    timers = [setTimeout(() => (phase = 'table'), CEREMONY.leave)]
  }

  $effect(() => {
    if (!playing) return
    const times = ceremonyTimes(lines.map(lettersOf), open)
    timers = [
      ...steps.flatMap((_, i) => [
        setTimeout(
          () => {
            line = i + 1
            shown = null
          },
          times.lines[i + 1],
        ),
        setTimeout(() => (shown = i), times.shows[i]),
      ]),
      setTimeout(leave, times.end),
    ]
    return () => timers.forEach(clearTimeout)
  })

  function nameOf(standing: Standing): string {
    return $players.find((p) => p.id === standing.player_id)?.display_name ?? standing.display_name
  }

  function petFor(standing: Standing): string {
    const player = $players.find((p) => p.id === standing.player_id)
    return petOf(player ?? { id: standing.player_id, avatar: standing.avatar })
  }

  const winners = $derived(
    teamStandings !== null
      ? teamWinnersLine(teamStandings)
      : winnersLine(
          standings.filter((standing) => standing.rank === 1 && standing.points > 0).map(nameOf),
        ),
  )
  const place = $derived<Place | null>(
    shown === null || teamPlaces !== null ? null : (places[shown] ?? null),
  )
  const teamPlace = $derived<TeamPlace | null>(
    shown === null || teamPlaces === null ? null : (teamPlaces[shown] ?? null),
  )

  /** The sheet growing from the place's height to the table's. */
  function unroll(node: HTMLElement, { from, duration }: { from: number; duration: number }) {
    const to = node.offsetHeight
    return {
      duration,
      easing: cubicOut,
      css: (t: number) => `height: ${from + (to - from) * t}px; overflow: hidden`,
    }
  }
</script>

<h1 class="sr">Final standings</h1>
<Stage host={HISCORES_HOST} tall {tv} wide={tv}>
  {#snippet paper()}
    <HiscoresHead title="Final hiscores">
      {#if phase === 'table'}
        {#if playing}<TypeIn line={winners} />{:else}{winners}{/if}
      {:else}
        {#key line}<TypeIn line={lines[line] ?? ''} from={line === 0 ? open : 0} />{/key}
      {/if}
    </HiscoresHead>
    <div class="board" bind:clientHeight={boardHeight}>
      {#if phase === 'table'}
        <div
          use:crawl={tv}
          in:unroll={{
            from: unrollFrom,
            duration: unrollMs(standings.length + (teamStandings?.length ?? 0) + 1),
          }}
        >
          {#if teamStandings !== null}
            <TeamHiscores
              teams={teamStandings}
              {standings}
              {teamOf}
              {youId}
              arriving={playing}
              {instant}
              changes={!past}
            />
          {:else}
            <Hiscores rows={standings} {youId} arriving={playing} {instant} changes={!past} />
          {/if}
        </div>
      {:else}
        <div class="place" class:leaving={phase === 'leaving'}>
          {#if place !== null}
            {#key place.rank}
              <div class="placed">
                <span class="pets">
                  {#each place.shown as standing (standing.player_id)}
                    <Pet pet={petFor(standing)} size={64} label="" />
                  {/each}
                </span>
                {#if place.more > 0}<span class="more">+{place.more}</span>{/if}
                <div class="who">
                  <!-- No whitespace between the tags, so no space slips in before a comma. -->
                  <p class="names">
                    {#each place.standings as standing, i (standing.player_id)}{i > 0
                        ? ', '
                        : ''}{nameOf(standing)}{#if standing.player_id === youId}{' '}<span
                          class="note">(you)</span
                        >{/if}{/each}
                  </p>
                  <p class="points">
                    {numbers.format(place.standings[0]?.points ?? 0)} points
                    <span class="tier">{tierName(place.tier)} trophy</span>
                  </p>
                </div>
              </div>
            {/key}
          {:else if teamPlace !== null}
            {#key teamPlace.rank}
              <div class="placed">
                <span class="logos">
                  {#each teamPlace.teams as row (row.team)}
                    <span class="logo" data-team={row.team}><TeamLogo team={row.team} /></span>
                  {/each}
                </span>
                <div class="who">
                  <p class="names">
                    {listNames(teamPlace.teams.map((row) => team(row.team).name))}
                  </p>
                  <p class="points">
                    {numbers.format(teamPlace.teams[0]?.points ?? 0)} points
                    <span class="tier">team average</span>
                  </p>
                </div>
              </div>
            {/key}
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet beside()}
    {#if teamPlace !== null && phase !== 'table'}
      {#if teamPlace.rank === 1}
        {#key teamPlace.rank}
          <span class="trophy" class:leaving={phase === 'leaving'}><Confetti /></span>
        {/key}
      {/if}
    {:else if place !== null && phase !== 'table'}
      {#key place.rank}
        <span class="trophy" class:leaving={phase === 'leaving'}>
          <img src={trophyArt(place.tier).url} alt="" draggable="false" />
          {#if place.rank === 1}<Confetti />{/if}
        </span>
      {/key}
    {/if}
  {/snippet}

  {#if tv}
    <!-- The TV offers nothing. -->
  {:else if phase === 'table'}
    <div class="panel after" class:arriving={playing}>
      <!-- Rank is dense (section 6), so level scores genuinely share a place; what the
           sort settles is the order they are listed in, not the rank. -->
      <p class="note">
        Level scores share a place. Between them, more correct answers comes first, and after that
        the earliest to join.
      </p>
      {@render children()}
    </div>
  {:else}
    <div class="row">
      <button type="button" onclick={leave}>Skip to the hiscores</button>
    </div>
  {/if}
</Stage>

<style>
  /* One place at a time, kept clear of the trophy beside the scroll. */
  .place {
    min-height: 7.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-right: calc(var(--beside-w) - var(--roll-w));
  }

  .placed {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    animation: rise 300ms ease-out both;
  }

  .pets {
    display: flex;
    flex: none;
  }

  .pets > :global(* + *) {
    margin-left: -1.4rem;
  }

  .logos {
    display: flex;
    flex: none;
    gap: 0.4rem;
  }

  .logo {
    display: block;
    width: 3.5rem;
    height: 3.5rem;
    padding: 0.3rem;
    border: 3px solid var(--team-trim);
    border-radius: 6px;
    background: var(--team);
  }

  .more {
    align-self: flex-end;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .who {
    min-width: 0;
  }

  .names {
    margin: 0;
    font-size: max(1.15rem, 1.4rem * var(--scroll-text, 1));
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .names .note {
    white-space: nowrap;
    color: var(--muted);
  }

  .points {
    margin: 0.15rem 0 0;
    font-size: max(1rem, 1.15rem * var(--scroll-text, 1));
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .tier {
    display: block;
    font-size: 0.85rem;
  }

  .trophy {
    position: relative;
    display: block;
  }

  .trophy img {
    display: block;
    width: 100%;
    height: auto;
    filter: drop-shadow(0 3px 0 rgb(0 0 0 / 0.3));
    transform-origin: 50% 80%;
    animation: pop 350ms cubic-bezier(0.3, 1.5, 0.5, 1) both;
  }

  .leaving {
    animation: leave 300ms ease-in forwards;
  }

  .after {
    margin-top: 1rem;
  }

  .after.arriving {
    animation: rise 300ms ease-out 1.2s both;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.3) rotate(-10deg);
    }
  }

  @keyframes leave {
    to {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
</style>
