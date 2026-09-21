<script lang="ts">
  /**
   * The card that introduces a round's mode, for `splash_seconds` before its first
   * question opens.
   *
   * This screen is why the question screens can be as bare as they are: the mode is
   * explained once, here, with time to read it, instead of a sentence above every
   * question that players learn to skip past by question three.
   *
   * The server drives the timing — `phase` is `splash` and `next_at` is when it ends —
   * so everybody in the room sees the same countdown, and the host's skip button
   * shortens it for everyone at once.
   */
  import { MODES } from '../lib/modes'
  import type { Segment } from '../lib/protocol'
  import Timer from './Timer.svelte'

  let {
    segment,
    endsAt,
    totalSeconds,
  }: {
    segment: Segment
    /** When the splash ends, from `room.next_at`. */
    endsAt: string | null
    totalSeconds: number
  } = $props()

  // A room can play a mode from a newer server than this client was built against. The
  // id is a poor headline, but it is honest, and the round still runs.
  const mode = $derived(MODES[segment.mode] ?? null)
</script>

<section class="splash surface">
  <!-- Artwork for the mode goes here; it wants to be the loudest thing on the card. -->
  <p class="round">
    Round {segment.index + 1} of {segment.total}
  </p>
  <h2>{mode?.label ?? segment.mode}</h2>
  {#if mode !== null}
    <p class="blurb">{mode.blurb}</p>
  {/if}
  <p class="count">
    {segment.count}
    {segment.count === 1 ? 'question' : 'questions'}
  </p>
  {#if endsAt !== null}
    <Timer {endsAt} {totalSeconds} label="until the round starts" />
  {/if}
</section>

<style>
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: calc(3rem - var(--border-give)) calc(1.5rem - var(--border-give));
    text-align: center;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow);
  }

  .round {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  h2 {
    margin: 0;
    font-size: 2.2rem;
    line-height: 1.1;
    color: var(--accent);
  }

  .blurb {
    margin: 0;
    max-width: 32rem;
    font-size: 1.05rem;
  }

  .count {
    margin: 0;
    color: var(--muted);
  }

  @media (max-width: 30rem) {
    .splash {
      padding: calc(2rem - var(--border-give)) calc(1rem - var(--border-give));
    }

    h2 {
      font-size: 1.7rem;
    }
  }
</style>
