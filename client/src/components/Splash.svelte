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
   * The scroll unrolls here, holding only the mode's name, its host's greeting and the
   * blurb, and stays up into the round's first question. The round's count and pace, the
   * ready check and the countdown go under the line (section 8 of ideas/design.md).
   *
   * The ready check (section 7.1 of ideas/design.md) is a grid of pets with each player's
   * name underneath, dim until their player taps ready. A tap can be
   * taken back once per splash — below the threshold that stops the countdown again —
   * and after that it stays put, so nobody can spam the countdown on and off. The
   * server holds the same limit; this screen only stops offering what it would refuse.
   */
  import { get } from 'svelte/store'

  import { MODES, hostOf } from '../lib/modes'
  import { petOf } from '../lib/pets'
  import type { PlayerView, Segment } from '../lib/protocol'
  import { readyThreshold } from '../lib/ready'
  import { serverOffsetMs } from '../lib/stores'
  import Pet from './Pet.svelte'
  import Stage from './stage/Stage.svelte'
  import Timer from './Timer.svelte'

  let {
    segment,
    endsAt,
    players,
    youId,
    onReady,
    onSkip = null,
  }: {
    segment: Segment
    /** When the countdown ends, from `room.next_at`; null while the splash waits. */
    endsAt: string | null
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
  const host = $derived(hostOf(segment.mode))

  /**
   * The pets to wait on: whoever is connected, which is who the server counts. A player
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
  const length = $derived(
    `Round ${segment.index + 1} of ${segment.total} · ` +
      `${segment.count} ${segment.count === 1 ? 'question' : 'questions'}`,
  )
</script>

<section class="splash">
  <Stage host={host.host.id} opening>
    {#snippet paper()}
      <h2>{label}</h2>
      <p class="greeting">“{host.greeting}”</p>
      {#if mode !== null}
        <p class="blurb">{mode.blurb}</p>
      {/if}
    {/snippet}

    <div class="panel board">
      <p class="count">{length}</p>

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
        <ul class="pets" aria-label={summary}>
          {#each present as player (player.id)}
            <li class:lit={player.ready === true}>
              <Pet pet={petOf(player)} size={48} label="" />
              <span class="pet-name">{player.display_name}</span>
              <span class="sr">{player.ready === true ? 'ready' : 'not ready'}</span>
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
    </div>
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
    font-style: italic;
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

  .pets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The pet dims until the tap. Opacity and not colour, so a pet reads the same in every
     theme and a player who cannot tell the theme's hues apart can still tell lit from not.
     The name is dimmed by ink instead, so it keeps its contrast. */
  .pets li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    width: 4.25rem;
    color: var(--muted);
  }

  .pets li > :global(.pet) {
    opacity: 0.3;
    filter: grayscale(1);
    transition:
      opacity 200ms ease-out,
      filter 200ms ease-out;
  }

  .pets li.lit {
    color: var(--ink);
  }

  .pets li.lit > :global(.pet) {
    opacity: 1;
    filter: none;
  }

  /* Up to 24 characters, so two lines before it is cut off. */
  .pet-name {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    overflow-wrap: anywhere;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-size: 0.75rem;
    line-height: 1.2;
    text-align: center;
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
    .pets li > :global(.pet) {
      transition: none;
    }
  }
</style>
