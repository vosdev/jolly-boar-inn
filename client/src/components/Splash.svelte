<script lang="ts">
  /**
   * The card that introduces a round's mode, for up to `splash_seconds` before its first
   * question opens.
   *
   * This screen is why the question screens can be as bare as they are: the mode is
   * explained once, here, with time to read it, instead of a sentence above every
   * question that players learn to skip past by question three.
   *
   * The server drives the timing — `phase` is `splash` and `next_at` is when it ends —
   * so everybody in the room sees the same countdown, and the host's skip button
   * shortens it for everyone at once.
   *
   * The ready check (D7, section 7.1 of ideas/design.md) is a row of heads, dim until
   * their player taps ready, and never a list of names: a splash comes round up to
   * thirteen times a game, and naming who is holding things up each time turns an
   * eight-second beat into a negotiation. The lobby is where names are listed. Enough
   * taps pull `next_at` earlier on the server, and the countdown here follows it; they
   * can never push it later.
   */
  import { headOf } from '../lib/heads'
  import { MODES, splashArt } from '../lib/modes'
  import type { PlayerView, Segment } from '../lib/protocol'
  import Head from './Head.svelte'
  import Timer from './Timer.svelte'

  let {
    segment,
    endsAt,
    totalSeconds,
    questionSeconds,
    players,
    youId,
    onReady,
    onSkip = null,
  }: {
    segment: Segment
    /** When the splash ends, from `room.next_at`. */
    endsAt: string | null
    totalSeconds: number
    /** How long each question of the round is open for, or null if the room has no entry. */
    questionSeconds: number | null
    players: PlayerView[]
    youId: string | null
    onReady: () => void
    /** The host's skip; null for everyone else. */
    onSkip?: (() => void) | null
  } = $props()

  // A room can play a mode from a newer server than this client was built against. The
  // id is a poor headline, but it is honest, and the round still runs.
  const mode = $derived(MODES[segment.mode] ?? null)
  const label = $derived(mode?.label ?? segment.mode)
  const art = $derived(splashArt(segment.mode))

  /**
   * The heads to wait on: whoever is connected, which is who the server counts. A player
   * whose phone has locked is not holding anyone up, so they are not in the row either.
   */
  const present = $derived(players.filter((player) => player.connected))
  const readyCount = $derived(present.filter((player) => player.ready === true).length)
  const youReady = $derived(players.some((player) => player.id === youId && player.ready === true))
  const summary = $derived(`${readyCount} of ${present.length} ready`)
  // Built here rather than in the markup, where Svelte would trim the space before the dot.
  const pace = $derived(
    `${segment.count} ${segment.count === 1 ? 'question' : 'questions'}` +
      (questionSeconds === null ? '' : ` · ${questionSeconds} seconds each`),
  )
</script>

<section class="splash surface">
  <div class="scene" class:placeholder={art.sceneUrl === null} data-scene={art.scene}>
    {#if art.sceneUrl !== null}
      <img class="art" src={art.sceneUrl} alt="" draggable="false" />
    {:else}
      <!-- Not a broken image: a sign for the pub the picture will show, until it does. -->
      <div class="sign" aria-hidden="true">
        <span class="sign-mode">{label}</span>
        <span class="sign-scene">{art.sceneName}</span>
      </div>
    {/if}
    {#if art.markUrl !== null}
      <img class="mark" src={art.markUrl} alt="" draggable="false" />
    {/if}
  </div>

  <div class="body">
    <p class="round">Round {segment.index + 1} of {segment.total}</p>
    <h2>{label}</h2>
    {#if mode !== null}
      <p class="blurb">{mode.blurb}</p>
    {/if}
    <p class="count">{pace}</p>

    <div class="ready">
      <button
        type="button"
        class="primary"
        aria-pressed={youReady}
        disabled={youReady}
        onclick={onReady}
      >
        {youReady ? '✓ Ready' : "✓ I'm ready"}
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
      <Timer {endsAt} {totalSeconds} label="until the round starts" />
    {/if}
    {#if onSkip !== null}
      <button type="button" class="small skip" onclick={onSkip}>Start the round now</button>
    {/if}
  </div>
</section>

<style>
  .splash {
    overflow: hidden;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow);
    /* The one transition the splash has (section 7.1): it fades in. The countdown is
       the rest of the animation. */
    animation: splash-in 200ms ease-out;
  }

  /* Full-bleed, 16:9, and the same box whether the art has arrived or not: the slot is
     the deliverable, and dropping a picture into it must not move anything below. */
  .scene {
    position: relative;
    aspect-ratio: 16 / 9;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }

  .art {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Real art fades into the card at its bottom edge. A placeholder is already the card's
     colour, so the same fade is invisible on it, which is the point: one rule for both. */
  .scene::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 70%, var(--panel));
    pointer-events: none;
  }

  .placeholder {
    display: grid;
    place-items: center;
    padding: 1.25rem;
  }

  /* A frame drawn inside the slot, so an empty scene reads as a sign hung on purpose
     rather than a picture that failed to load. */
  .sign {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
    height: 100%;
    border: 1px dashed var(--line);
    border-radius: min(var(--radius), 8px);
    text-align: center;
  }

  .sign-mode {
    font-family: var(--font-display);
    font-size: clamp(1.3rem, 6vw, 2rem);
    line-height: 1.1;
    color: var(--muted);
  }

  .sign-scene {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  .mark {
    position: absolute;
    right: 1rem;
    bottom: 0.75rem;
    width: 22%;
    max-width: 8rem;
    aspect-ratio: 1;
    object-fit: contain;
    z-index: 1;
  }

  .body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
    padding: calc(1.5rem - var(--border-give));
  }

  .body > :global(.timer) {
    align-self: stretch;
    margin-bottom: 0;
  }

  .round {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 2.2rem;
    line-height: 1.1;
    color: var(--accent);
    overflow-wrap: anywhere;
  }

  .blurb {
    margin: 0;
    max-width: 32rem;
    font-size: 1.05rem;
  }

  .count {
    margin: 0 0 0.4rem;
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

  .skip {
    align-self: flex-end;
  }

  @keyframes splash-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .splash {
      animation: none;
    }

    .heads li {
      transition: none;
    }
  }

  @media (max-width: 30rem) {
    .body {
      padding: calc(1rem - var(--border-give));
    }

    h2 {
      font-size: 1.7rem;
    }
  }
</style>
