<script lang="ts" module>
  /** The page's overview, the random events, or a game mode's id. */
  export type HowToView = 'overview' | 'events' | (string & {})
</script>

<script lang="ts">
  /**
   * Home's How to play page, under Home's dialogue box, which speaks for it: the overview
   * (a night in four steps, the game modes, every way of answering, teams and the TV), or
   * one mode's view, or the random events'. Picking a mode swaps the whole page, as
   * Suggest's editor does; which view shows is the address's (`/how-to-play/<mode>`).
   *
   * Which modes there are is the slideshow's list; which types each is answered in is
   * `/api/modes`, so a mode's view shows only what its round asks.
   */
  import { onMount } from 'svelte'

  import type { ModePacing } from '../lib/api'
  import {
    NIGHT_STEPS,
    SCORING_LINE,
    TEAMS_PARAGRAPH,
    TEAMS_SETUP,
    TEAMS_STANDINGS,
    TV_PARAGRAPHS,
    allTypes,
    loadModes,
    modeTypes,
    rowsFor,
  } from '../lib/howToPlay'
  import { MODES } from '../lib/modes'
  import { npcArt } from '../lib/npcs'
  import { RANDOM_EVENTS, STRANGER } from '../lib/randomEvents'
  import AnswerRows from './AnswerRows.svelte'
  import { SHOWN } from './ModeShowcase.svelte'

  let {
    view,
    onopen,
    onall,
    onback,
  }: {
    view: HowToView
    /** Open a mode's view, or the random events'. */
    onopen: (view: HowToView) => void
    /** Back to the overview from a mode's view. */
    onall: () => void
    /** Leave the page for Home. */
    onback: () => void
  } = $props()

  let modes = $state<ModePacing[] | null>(null)
  let heading = $state<HTMLElement | null>(null)

  onMount(() => {
    loadModes().then(
      (loaded) => (modes = loaded),
      () => (modes = []),
    )
    heading?.focus()
  })

  const mode = $derived(MODES[view] ?? null)
  const types = $derived(
    modes === null || mode === null ? null : (modeTypes(mode.id, modes) ?? new Set<string>()),
  )
  const strangerArt = npcArt(STRANGER)
</script>

{#snippet face(id: string)}
  {@const art = npcArt(id)}
  <img class="face {art.cut}" src={art.url} alt="" draggable="false" />
{/snippet}

{#if view === 'overview'}
  <div>
    <section class="panel">
      <p class="back">
        <button type="button" class="link" onclick={onback}>← Back</button>
      </p>
      <h1 tabindex="-1" bind:this={heading}>How to play</h1>
      <h2>A night at the inn</h2>
      <ol class="steps">
        {#each NIGHT_STEPS as step (step.title)}
          <li>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        {/each}
      </ol>
    </section>

    <section class="panel" aria-labelledby="how-modes">
      <h2 id="how-modes">Game modes</h2>
      <ul class="tiles">
        {#each SHOWN as shown (shown.id)}
          <li>
            <button type="button" class="tile" onclick={() => onopen(shown.id)}>
              {@render face(shown.host.id)}
              <span>
                <strong>{shown.label}</strong>
                <span class="note">{shown.hint}</span>
              </span>
            </button>
          </li>
        {/each}
        <li>
          <button type="button" class="tile" onclick={() => onopen('events')}>
            <img class="face {strangerArt.cut}" src={strangerArt.url} alt="" draggable="false" />
            <span>
              <strong>Random events</strong>
              <span class="note">Visitors who barge in with a question of their own.</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <section class="panel" aria-labelledby="how-answer">
      <h2 id="how-answer">Ways to answer</h2>
      {#if modes === null}
        <p class="note">Loading…</p>
      {:else}
        <AnswerRows rows={rowsFor(allTypes(modes))} />
        <p class="scoring">{SCORING_LINE}</p>
      {/if}
    </section>

    <section class="panel" aria-labelledby="how-teams">
      <h2 id="how-teams">Teams</h2>
      <p>{TEAMS_SETUP}</p>
      <p>{TEAMS_PARAGRAPH}</p>
      <p>{TEAMS_STANDINGS}</p>
    </section>

    <section class="panel" aria-labelledby="how-tv">
      <h2 id="how-tv">On the TV</h2>
      {#each TV_PARAGRAPHS as paragraph, i (i)}
        <p>{paragraph}</p>
      {/each}
    </section>
  </div>
{:else if view === 'events'}
  <section class="panel">
    <p class="back">
      <button type="button" class="link" onclick={onall}>← All game modes</button>
    </p>
    <h1 tabindex="-1" bind:this={heading}>Random events</h1>
    <p>
      Whoever creates a room picks who may visit, on Create's Random events step. Only a game too
      short for them has none.
    </p>
    <ul class="visitors">
      {#each RANDOM_EVENTS as npc (npc.id)}
        <li>
          {@render face(npc.id)}
          <span>
            <strong>{npc.name}</strong>
            <span class="note">{npc.theme}</span>
          </span>
        </li>
      {/each}
    </ul>
  </section>
{:else if mode !== null}
  <section class="panel">
    <p class="back">
      <button type="button" class="link" onclick={onall}>← All game modes</button>
    </p>
    <h1 tabindex="-1" bind:this={heading}>{mode.label}</h1>
    <p class="note">Hosted by {mode.host.name}</p>
    <p>{mode.hint}</p>
    <h2>How you answer</h2>
    {#if types === null}
      <p class="note">Loading…</p>
    {:else}
      <AnswerRows rows={rowsFor(types)} />
    {/if}
  </section>
{/if}

<style>
  h1 {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
  }

  h1:focus {
    outline: none;
  }

  h2 {
    margin: 1.25rem 0 0.75rem;
    font-size: 1.15rem;
  }

  .panel > h2:first-child {
    margin-top: 0;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .back {
    margin: 0 0 0.75rem;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }

  .steps li {
    counter-increment: step;
  }

  .steps li::before {
    content: counter(step);
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    margin-bottom: 0.4rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
  }

  .steps p {
    margin: 0.2rem 0 0;
  }

  /* As many columns as keep a hint readable: one on a phone, where tiles become rows. */
  .tiles,
  .visitors {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    text-align: left;
    background: var(--panel-raised);
  }

  .visitors li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .face {
    flex: none;
    width: 48px;
    height: 48px;
    object-fit: contain;
  }

  /* Faces turn to the words beside them; a render faces the other way (lib/npcs.ts). */
  .face.render {
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  strong {
    display: block;
  }

  .scoring {
    margin: 1rem 0 0;
    font-weight: 700;
  }
</style>
