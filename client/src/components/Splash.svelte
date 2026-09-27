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
   * The scroll unrolls here, holding only the mode's name and blurb, and stays up into the
   * round's first question. The round's count and pace, the ready check and the countdown
   * go under the line (section 8 of ideas/design.md).
   *
   * The ready check (D7, section 7.1 of ideas/design.md) is a row of heads, dim until
   * their player taps ready, and never a list of names: a splash comes round up to
   * thirteen times a game, and naming who is holding things up each time turns an
   * short beat into a negotiation. The lobby is where names are listed. A tap can be
   * taken back once per splash — below the threshold that stops the countdown again —
   * and after that it stays put, so nobody can spam the countdown on and off. The
   * server holds the same limit; this screen only stops offering what it would refuse.
   */
  import { get } from 'svelte/store'

  import { headOf } from '../lib/heads'
  import { MODES } from '../lib/modes'
  import type { PlayerView, Segment } from '../lib/protocol'
  import { readyThreshold } from '../lib/ready'
  import { serverOffsetMs } from '../lib/stores'
  import Head from './Head.svelte'
  import Stage from './stage/Stage.svelte'
  import Timer from './Timer.svelte'

  let {
    segment,
    endsAt,
    questionSeconds,
    players,
    youId,
    onReady,
    onSkip = null,
  }: {
    segment: Segment
    /** When the countdown ends, from `room.next_at`; null while the splash waits. */
    endsAt: string | null
    /** How long each question of the round is open for, or null if the room has no entry. */
    questionSeconds: number | null
    players: PlayerView[]
    youId: string | null
    /** Tap ready, or take it back. */
    onReady: (ready: boolean) => void
    /** The host's skip; null for everyone else. */
    onSkip?: (() => void) | null
  } = $props()

  // A room can play a mode from a newer server than this client was built against. The
  // id is a poor headline, but it is honest, and the round still runs.
  const mode = $derived(MODES[segment.mode] ?? null)
  const label = $derived(mode?.label ?? segment.mode)

  /**
   * The heads to wait on: whoever is connected, which is who the server counts. A player
   * whose phone has locked is not holding anyone up, so they are not in the row either.
   */
  const present = $derived(players.filter((player) => player.connected))
  const readyCount = $derived(present.filter((player) => player.ready === true).length)
  const youReady = $derived(players.some((player) => player.id === youId && player.ready === true))
  const summary = $derived(`${readyCount} of ${present.length} ready`)
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
  // Built here rather than in the markup, where Svelte would trim the space before the dot.
  const pace = $derived(
    `Round ${segment.index + 1} of ${segment.total} · ` +
      `${segment.count} ${segment.count === 1 ? 'question' : 'questions'}` +
      (questionSeconds === null ? '' : ` · ${questionSeconds} seconds each`),
  )
</script>

<section class="splash">
  <Stage opening>
    {#snippet paper()}
      <h2>{label}</h2>
      {#if mode !== null}
        <p class="blurb">{mode.blurb}</p>
      {/if}
    {/snippet}

    <p class="count">{pace}</p>

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
      <ul class="heads" aria-label={summary}>
        {#each present as player (player.id)}
          <li class:lit={player.ready === true}>
            <Head head={headOf(player)} size={32} label="" />
          </li>
        {/each}
      </ul>
      <span class="note tally" aria-hidden="true">{summary}</span>
    </div>

    {#if endsAt !== null}
      <Timer {endsAt} totalSeconds={span} label="until the round starts" />
    {:else}
      <p class="waiting surface" aria-live="polite">
        {short === 1 ? 'Waiting for 1 more to be ready' : `Waiting for ${short} more to be ready`}
      </p>
    {/if}
    {#if onSkip !== null}
      <button type="button" class="small skip" onclick={onSkip}>Start the round now</button>
    {/if}
  </Stage>
</section>

<style>
  /* Under the line: a column, with the countdown and the waiting plaque at full width. */
  .splash :global(.under) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
  }

  .splash :global(.under > .timer) {
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

  .blurb {
    margin: 0;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
  }

  .count {
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

  .heads {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Dim until the tap. Opacity and not colour, so a head reads the same in every theme
     and a player who cannot tell the theme's hues apart can still tell lit from not. */
  .heads li {
    display: flex;
    opacity: 0.3;
    filter: grayscale(1);
    transition:
      opacity 200ms ease-out,
      filter 200ms ease-out;
  }

  .heads li.lit {
    opacity: 1;
    filter: none;
  }

  .tally {
    font-variant-numeric: tabular-nums;
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

  .skip {
    align-self: flex-end;
  }

  @media (prefers-reduced-motion: reduce) {
    .heads li {
      transition: none;
    }
  }
</style>
