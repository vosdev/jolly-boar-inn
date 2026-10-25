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
   * The host says its greeting and the blurb in its bubble above the scroll (the TV's scroll
   * holds them). The name is there whole; the
   * greeting and the blurb type in once the stage has come over from the screen before,
   * at the questions' pace (`lib/interlude.ts`). The splash has no hold to
   * fit, so nothing waits on the typing. The scroll repeats the blurb, plain, under the name,
   * then which round this is and how many questions it holds, and a price round's date, said
   * here once so the questions need not. Under it, tonight's row of hosts (`lib/tonight.ts`), section 9 of ideas/design.md.
   *
   * The ready check (section 9 of ideas/design.md) is the table panel, Ready over Not ready
   * yet, with the wait or the countdown, large, over the switch; on the TV a grid of pets
   * (`RosterPet`), checked once they tap ready. A tap can be
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
  import { msUntil, serverNow } from '../lib/clock'
  import type { PlayerView, RoomSettings, Segment } from '../lib/protocol'
  import { tonight, type Tonight } from '../lib/tonight'
  import { loadPricesAsOf, pricesAsOf } from '../lib/pricesAsOf.svelte'
  import { playing, readyThreshold } from '../lib/ready'
  import { stageArrival } from '../lib/sharedStage.svelte'
  import { serverOffsetMs } from '../lib/stores'
  import { Seating } from '../lib/tableGroups'
  import { TEAM_IDS } from '../lib/teams'
  import { Typist, lettersOf } from '../lib/typing.svelte'
  import AtTable from './AtTable.svelte'
  import FullScreenSwitch from './FullScreenSwitch.svelte'
  import Switch from './Switch.svelte'
  import Mystery from './Mystery.svelte'
  import RosterPet from './RosterPet.svelte'
  import NpcFace from './NpcFace.svelte'
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
    settings = null,
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
    /** The room's settings, for which rounds' hosts tonight's row may show. */
    settings?: RoomSettings | null
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

  const night = $derived({
    index: segment.index,
    total: segment.total,
    mode: segment.mode,
    modes: settings?.modes,
    modeOrder: settings?.mode_order,
    hidden: settings?.hide_rounds === true,
  })
  /** Ten rounds in a row on a desktop, the nearest twelve past that, five on a phone. */
  const wide = $derived(tonight(night, 12))
  const narrow = $derived(tonight(night, 5))
  const startsIn = $derived(
    endsAt === null ? null : Math.max(0, Math.ceil(msUntil(endsAt, $serverNow) / 1000)),
  )
  const questions = $derived(`${segment.count} ${segment.count === 1 ? 'question' : 'questions'}`)
  // Built here rather than in the markup, where Svelte would trim the space before the dot.
  const length = $derived(`Round ${segment.index + 1} of ${segment.total} · ${questions}`)
  /** The scroll's small line: a lone round has no "of 1" worth saying. */
  const shape = $derived(
    segment.total > 1 ? `Round ${segment.index + 1} of ${segment.total}, ${questions}` : questions,
  )
  const waiting = $derived(
    short === 1 ? 'Waiting for 1 more to be ready' : `Waiting for ${short} more to be ready`,
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
    <p class="waiting surface">{waiting}</p>
  {/if}
{/snippet}

{#snippet row(night: Tonight, which: string)}
  <ol class="stops {which}" aria-label="Tonight's rounds">
    {#if night.before > 0}<li class="more" aria-hidden="true">+{night.before}</li>{/if}
    {#each night.stops as stop (stop.index)}
      <li class="stop {stop.state}" aria-current={stop.state === 'now' ? 'step' : undefined}>
        <span class="face">
          {#if stop.mode !== null}
            <NpcFace npc={hostOf(stop.mode).host.id} />
          {:else}
            <span class="unknown"><Mystery /></span>
          {/if}
        </span>
        <span class="label">
          {stop.state === 'now' ? label : stop.index + 1}
        </span>
      </li>
    {/each}
    {#if night.after > 0}<li class="more" aria-hidden="true">+{night.after}</li>{/if}
  </ol>
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
      {:else}
        {#if mode !== null}
          <p class="blurb">{mode.blurb}</p>
        {/if}
        <p class="asof shape">{shape}</p>
        {#if asOf !== null}
          <p class="asof">{prices} as of {asOfDate(asOf)}.</p>
        {/if}
      {/if}
    {/snippet}

    {#snippet said()}
      <Said name={host.host.name} line={words} />
    {/snippet}

    {#if !tv}
      <section class="panel night" aria-labelledby="tonight">
        <h3 id="tonight">Tonight</h3>
        {@render row(wide, 'wide')}
        {@render row(narrow, 'narrow')}
      </section>
      <AtTable>
        <TablePanel groups={seated} {youId} labels={['Ready', 'Not ready yet']}>
          <div class="starts">
            {#if startsIn !== null}
              <p class="starting" aria-live="polite">
                <span>Starting in</span>
                <strong>{startsIn}</strong>
              </p>
            {:else}
              <p class="waiting-big">{waiting}</p>
            {/if}
          </div>
          <div class="ready">
            <Switch
              label="Ready"
              large
              tone="ok"
              checked={youReady}
              disabled={youReady && undone}
              onclick={press}
            />
            <FullScreenSwitch />
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

  .blurb + .shape {
    margin-top: 0.5rem;
  }

  .shape,
  .shape + .asof {
    margin-bottom: 0;
    color: var(--scroll-muted);
  }

  .shape + .asof {
    margin-top: 0.2rem;
  }

  /* Tonight's row, alone and centred under the sheet. */
  .night {
    margin-bottom: 0;
    text-align: center;
  }

  .night h3 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }

  .stops {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .stop {
    --face: 2.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    width: 3.5rem;
    font-size: 0.75rem;
    color: var(--muted);
    text-align: center;
  }

  .stop .face {
    display: grid;
    place-items: center;
    width: var(--face);
    height: var(--face);
  }

  /* Sized outright: a percentage of a grid cell's height is no height at all. */
  .stop .face :global(img) {
    width: var(--face);
    max-width: none;
    height: var(--face);
    max-height: none;
    object-fit: contain;
    opacity: 0.55;
  }

  .stop.done .face :global(img) {
    opacity: 0.3;
    filter: grayscale(0.7);
  }

  .unknown {
    width: 2.3rem;
    height: 2.5rem;
  }

  .stop.now {
    --face: 4.75rem;
    width: 6.5rem;
    color: var(--ink);
    font-weight: 700;
    font-size: 0.85rem;
  }

  .stop.now .face :global(img) {
    opacity: 1;
  }

  .label {
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .more {
    align-self: center;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .stops.narrow {
    display: none;
  }

  /* Over the ready switch in the table panel, the countdown large. */
  .starts {
    margin: 0 0 0.6rem;
    text-align: center;
  }

  .starting {
    display: flex;
    flex-direction: column;
    margin: 0;
    color: var(--muted);
  }

  .starting strong {
    font-family: var(--font-numeric);
    font-size: 4.5rem;
    line-height: 1;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .waiting-big {
    margin: 0;
    color: var(--muted);
  }

  /* A phone's stage: the nearest five. */
  @container (max-width: 40rem) {
    .stops.wide {
      display: none;
    }

    .stops.narrow {
      display: flex;
    }

    .starting strong {
      font-size: 3rem;
    }
  }

  .ready {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 0.9rem;
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
