<script lang="ts">
  /**
   * The stage that introduces a round's mode before its first question opens.
   *
   * This screen is why the question screens can be as bare as they are: the mode is
   * explained once, here, with time to read it, instead of a sentence above every
   * question that players learn to skip past by question three.
   *
   * It has no clock of its own. The server holds it until enough of the room is ready
   * (`rooms/ready.py`), then counts down: `next_at` is null while it waits and the end of
   * the countdown once one runs, so everybody sees the same number. The host's skip is
   * the override, and ends it for everyone at once.
   *
   * The scroll holds only the mode's name, and the host says its greeting and the blurb in
   * its bubble above it (the TV's scroll holds all three). The name is there whole; the
   * greeting and the blurb type in once the stage has come over from the screen before,
   * at the questions' pace (`lib/interlude.ts`). The splash has no hold to
   * fit, so nothing waits on the typing. The round's count and pace, a price round's date,
   * the ready check and the countdown go in a panel at the room's table, beside the stage
   * (section 8 of ideas/design.md). The date is said here once, so the questions need not.
   *
   * The ready check (section 9 of ideas/design.md) is the table panel, Ready over Not ready
   * yet; on the TV a grid of pets (`RosterPet`), checked once they tap ready. A tap can be
   * taken back once per splash — below the threshold that stops the countdown again —
   * and after that it stays put, so nobody can spam the countdown on and off. The
   * server holds the same limit; this screen only stops offering what it would refuse.
   *
   * On the room's TV (section 16 of ideas/design.md) the stage is wide, with no panel: the
   * count, the grid and the countdown stand at the sheet's foot, and nothing is offered.
   */
  import { untrack } from 'svelte'
  import { get } from 'svelte/store'

  import { asOfDate } from '../lib/dates'
  import { SETTLED, SPLASH_TYPE_FROM_MS, interludeFor, reducedMotion } from '../lib/interlude'
  import { MODES, hostOf } from '../lib/modes'
  import type { PlayerView, Segment } from '../lib/protocol'
  import { loadPricesAsOf, pricesAsOf } from '../lib/pricesAsOf.svelte'
  import { playing, readyThreshold } from '../lib/ready'
  import { stageArrival } from '../lib/sharedStage.svelte'
  import { serverOffsetMs } from '../lib/stores'
  import { Seating } from '../lib/tableGroups'
  import { TEAM_IDS } from '../lib/teams'
  import { Typist, lettersOf } from '../lib/typing.svelte'
  import AtTable from './AtTable.svelte'
  import FullScreenSwitch from './FullScreenSwitch.svelte'
  import RosterPet from './RosterPet.svelte'
  import TablePanel from './TablePanel.svelte'
  import Said from './stage/Said.svelte'
  import Stage from './stage/Stage.svelte'
  import Typed from './stage/Typed.svelte'
  import Timer from './Timer.svelte'

  let {
    segment,
    endsAt,
    players,
    youId,
    onReady,
    tv = false,
  }: {
    segment: Segment
    /** When the countdown ends, from `room.next_at`; null while the splash waits. */
    endsAt: string | null
    players: PlayerView[]
    youId: string | null
    /** Tap ready, or take it back. */
    onReady: (ready: boolean) => void
    /** Drawn on the room's TV. */
    tv?: boolean
  } = $props()

  // A room can play a mode from a newer server than this client was built against. The
  // id is a poor headline, but it is honest, and the round still runs.
  const mode = $derived(MODES[segment.mode] ?? null)
  const label = $derived(mode?.label ?? segment.mode)
  const host = $derived(hostOf(segment.mode))

  // The bubble says who speaks; the TV's sheet has no bubble, so it quotes the host.
  const greeting = $derived(tv ? `“${host.greeting}”` : host.greeting)
  const letters = $derived([greeting, mode?.blurb ?? ''].map(lettersOf))
  const typeFrom = untrack(() =>
    Math.max(SPLASH_TYPE_FROM_MS, stageArrival({ host: host.host.id })),
  )
  const typist = new Typist(
    () => letters,
    untrack(() =>
      reducedMotion() ? SETTLED : interludeFor(Infinity, letters, typeFrom, typeFrom),
    ),
    Date.now(),
  )

  /**
   * Who counts: whoever is connected but the TV, which is who the server counts. A player
   * whose phone has locked is not holding anyone up, so they stay in the row, faded, out of
   * the count.
   */
  const present = $derived(playing(players).filter((player) => player.connected))
  const readyCount = $derived(present.filter((player) => player.ready === true).length)
  const youReady = $derived(players.some((player) => player.id === youId && player.ready === true))
  const summary = $derived(`${readyCount} of ${present.length} ready`)
  const seating = new Seating()
  /** The teams the players play for: a splash has no settings, and the teams are the same. */
  const teams = $derived(TEAM_IDS.filter((team) => players.some((p) => p.team === team)))
  const seated = $derived(
    seating.seat(players, youId, (p) => p.ready === true, segment.index, teams),
  )
  /** Taps still wanted before the countdown starts: a count, never a name. */
  const short = $derived(Math.max(0, readyThreshold(present.length) - readyCount))

  /**
   * What a full timer bar means: however long the countdown had when it last started or
   * moved. There are two lengths (ten seconds, three), and a tap arriving mid-countdown
   * starts the bar again from full at the shorter one rather than from partway down.
   * Only a new `endsAt` sets it: the offset is read without subscribing, because a `pong`
   * that nudges it mid-countdown would otherwise fill the bar up again.
   */
  const span = $derived(
    endsAt === null
      ? 0
      : Math.max(1, (Date.parse(endsAt) - (Date.now() + get(serverOffsetMs))) / 1000),
  )
  /**
   * Whether this player has used the splash's one take-back. Kept here rather than on the
   * wire: the card is mounted fresh for every splash, which is exactly when it resets. A
   * reload mid-splash forgets it, and the server's `bad_state` is the backstop then.
   */
  let undone = $state(false)

  function press(): void {
    if (youReady) undone = true
    onReady(!youReady)
  }
  const asOf = $derived(pricesAsOf.byMode[segment.mode] ?? null)
  // The Price is Right's options are rounded to two figures, which a player should know
  // before guessing; More or Less mixes metrics, and its stem names each one.
  const prices = $derived(
    segment.mode === 'price_is_right' ? 'Grand Exchange prices, rounded,' : 'Prices',
  )

  $effect(() => {
    void loadPricesAsOf()
  })

  // Built here rather than in the markup, where Svelte would trim the space before the dot.
  const length = $derived(
    `Round ${segment.index + 1} of ${segment.total} · ` +
      `${segment.count} ${segment.count === 1 ? 'question' : 'questions'}`,
  )
</script>

{#snippet words()}
  <p class="greeting"><Typed line={greeting} shown={typist.shown[0]} /></p>
  {#if mode !== null}
    <p class="blurb"><Typed line={mode.blurb} shown={typist.shown[1]} /></p>
  {/if}
{/snippet}

{#snippet count()}
  <p class="count">{length}</p>
  {#if asOf !== null}
    <p class="note asof">{prices} as of {asOfDate(asOf)}.</p>
  {/if}
{/snippet}

{#snippet pets()}
  <ul class="pets" aria-label={summary}>
    {#each players as player (player.id)}
      <li><RosterPet {player} status={player.connected ? '' : 'away'} /></li>
    {/each}
  </ul>
{/snippet}

{#snippet countdown()}
  {#if endsAt !== null}
    <Timer {endsAt} totalSeconds={span} label="until the round starts" />
  {:else}
    <p class="waiting surface">
      {short === 1 ? 'Waiting for 1 more to be ready' : `Waiting for ${short} more to be ready`}
    </p>
  {/if}
{/snippet}

<section class="splash">
  <Stage host={host.host.id} {tv} wide={tv} bubble={tv ? null : 'on'}>
    {#snippet paper()}
      <h2>{label}</h2>
      {#if tv}
        {@render words()}
        <div class="tv-foot board">
          {@render count()}
          {@render pets()}
          {@render countdown()}
        </div>
      {/if}
    {/snippet}

    {#snippet said()}
      <Said name={host.host.name} line={words} />
    {/snippet}

    {#if !tv}
      <AtTable>
        <TablePanel groups={seated} {youId} labels={['Ready', 'Not ready yet']}>
          <div class="board">
            {@render count()}
            <div class="ready">
              <button
                type="button"
                class:primary={!youReady}
                aria-pressed={youReady}
                disabled={youReady && undone}
                onclick={press}
              >
                {youReady ? (undone ? '✓ Ready' : '✓ Ready — tap to undo') : "✓ I'm ready"}
              </button>
              <FullScreenSwitch />
            </div>
            {@render countdown()}
          </div>
        </TablePanel>
      </AtTable>
    {/if}
  </Stage>
</section>

<style>
  /* Under the scroll: a column, with the countdown and the waiting plaque at full width. */
  .board {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
    margin-bottom: 0;
  }

  /* At the sheet's foot, under a rule, below whatever the words leave free, and clear of
     the host standing there. */
  .tv-foot {
    margin-top: auto;
    padding: 0.75rem 0 0 calc(var(--npc-w) - 1rem);
    border-top: var(--border-width) solid var(--line);
  }

  .board > :global(.timer) {
    align-self: stretch;
    margin-bottom: 0;
  }

  h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: max(1.15rem, 1.5rem * var(--scroll-text, 1));
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .greeting {
    margin: 0 0 0.4rem;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
  }

  /* On the TV's sheet, where the quotes and the slant say it is the host's. */
  :global(.content) .greeting {
    font-style: italic;
  }

  .blurb {
    margin: 0;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
  }

  .count,
  .asof {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .ready {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 0.9rem;
  }

  .ready button {
    min-height: 44px;
  }

  .pets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pets li {
    width: 4.25rem;
  }

  /* Where the timer will be once one runs, the same plaque, so nothing below moves. */
  .waiting {
    align-self: stretch;
    margin: 0;
    padding: calc(0.4rem - var(--border-give)) calc(0.65rem - var(--border-give));
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--muted);
    text-align: right;
  }
</style>
