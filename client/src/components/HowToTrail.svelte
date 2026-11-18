<script lang="ts">
  /**
   * How to play's walk through a night, drawn on the sheet as a clue scroll's map: a dashed
   * trail across the top with a stamp for each stop and an X on the last, and the stop you
   * are on opened large under it. Every stop can be picked, so nobody has to click through;
   * "Click here to continue" is there for whoever would rather be walked.
   *
   * The last stop is every way of answering, which also lives here so a new player meets
   * it at the moment it matters, then Create a room and Try a question.
   */
  import { onMount, tick } from 'svelte'

  import type { ModePacing } from '../lib/api'
  import {
    NIGHT_STOPS,
    ITEMS_LINE,
    SCORING_LINE,
    allTypes,
    loadModes,
    rowsFor,
    type NightStop,
  } from '../lib/howToPlay'
  import { itemIcon } from '../lib/items'
  import { npcArt } from '../lib/npcs'
  import AnswerRows from './AnswerRows.svelte'
  import HowToStep from './HowToStep.svelte'

  let {
    ontry,
    oncreate,
    createDisabled = false,
  }: {
    /** Play a sample question. */
    ontry: () => void
    /** Go and create a room. */
    oncreate: () => void
    /** At the room limit, where Home refuses Create too. */
    createDisabled?: boolean
  } = $props()

  let index = $state(0)
  let modes = $state<ModePacing[] | null>(null)
  let heading = $state<HTMLElement | null>(null)

  const stop = $derived(NIGHT_STOPS[index] as NightStop)
  const last = $derived(index === NIGHT_STOPS.length - 1)

  onMount(() => {
    loadModes().then(
      (loaded) => (modes = loaded),
      () => (modes = []),
    )
  })

  /** The stamp's picture, or null for the X, or for an item whose file is missing. */
  function stampOf(entry: NightStop): string | null {
    if (entry.stamp.kind === 'npc') return npcArt(entry.stamp.id).url
    return entry.stamp.kind === 'item' ? itemIcon(`item:${entry.stamp.id}`) : null
  }

  /** Continue's button is gone on the last stop, so focus moves on with the words. */
  async function step(by: number): Promise<void> {
    index += by
    await tick()
    if (last) heading?.focus()
  }
</script>

<div class="walk">
  <nav aria-label="The stops of a night">
    <ol class="trail">
      <svg class="path" viewBox="0 0 600 92" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M50 32C100 32 100 60 150 60S200 32 250 32 300 60 350 60 400 32 450 32 500 60 550 60"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      {#each NIGHT_STOPS as entry, i (entry.id)}
        {@const stamp = stampOf(entry)}
        <li class:low={i % 2 === 1}>
          <button
            type="button"
            class="stop"
            class:on={i === index}
            class:past={i < index}
            aria-current={i === index ? 'step' : undefined}
            onclick={() => (index = i)}
          >
            <span class="node">
              {#if entry.stamp.kind === 'x'}
                <svg class="x" viewBox="0 0 32 32" aria-hidden="true">
                  <path d="M6 7 26 25M25 6 7 26" />
                </svg>
              {:else if stamp !== null}
                <img src={stamp} alt="" draggable="false" />
              {/if}
              <span class="number">{i + 1}</span>
            </span>
            <span class="label">{entry.label}</span>
          </button>
        </li>
      {/each}
    </ol>
  </nav>

  {#if stop.id === 'answer'}
    <div class="wide">
      <h3 tabindex="-1" bind:this={heading}>{stop.title}</h3>
      <p>{stop.text}</p>
      {#if modes === null}
        <p class="note">Loading…</p>
      {:else}
        <AnswerRows rows={rowsFor(allTypes(modes))} columns />
      {/if}
      <p class="items">{ITEMS_LINE}</p>
      <p class="scoring">{SCORING_LINE}</p>
      <div class="closing">
        <button type="button" class="primary" disabled={createDisabled} onclick={oncreate}>
          Create a room
        </button>
        <button type="button" onclick={ontry}>Try a question</button>
      </div>
      <button type="button" class="move" onclick={() => step(-1)}>Back</button>
    </div>
  {:else}
    <div class="open">
      <HowToStep stop={stop.id} label={stop.drawing} />
      <div class="words">
        <h3 tabindex="-1" bind:this={heading}>{stop.title}</h3>
        <p>{stop.text}</p>
        <p class="moves">
          {#if index > 0}
            <button type="button" class="move" onclick={() => step(-1)}>Back</button>
          {/if}
          <button type="button" class="move" onclick={() => step(1)}>
            Click here to continue
          </button>
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .walk {
    display: grid;
    gap: 1rem;
    width: 100%;
    font-family: var(--font-body);
    text-align: start;
  }

  .trail {
    --stamp: 64px;
    --drop: 28px;
    position: relative;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* As tall as the stamps' middles reach, and stretched, so the path meets every stamp. */
  .path {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: calc(var(--stamp) + var(--drop));
    overflow: visible;
    pointer-events: none;
  }

  .path path {
    fill: none;
    stroke: var(--scroll-edge);
    stroke-width: 3;
    stroke-dasharray: 8 8;
    stroke-linecap: round;
  }

  li {
    position: relative;
    display: grid;
    justify-items: center;
  }

  li.low {
    padding-top: var(--drop);
  }

  .stop {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 0.3rem;
    width: 100%;
    min-height: 44px;
    padding: 0;
    color: var(--scroll-ink);
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.2;
    background: none;
    border: 0;
    box-shadow: none;
  }

  .node {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--stamp);
    height: var(--stamp);
    background: var(--panel-raised);
    border: 3px solid var(--scroll-edge);
    border-radius: 50%;
    transition: border-color 150ms ease;
  }

  .node img {
    width: 74%;
    height: 74%;
    object-fit: contain;
  }

  .x {
    width: 70%;
    height: 70%;
  }

  .x path {
    fill: none;
    stroke: var(--bad);
    stroke-width: 5;
    stroke-linecap: round;
  }

  .number {
    position: absolute;
    right: -6px;
    bottom: -4px;
    display: grid;
    place-items: center;
    min-width: 1.4rem;
    height: 1.4rem;
    color: var(--scroll-paper);
    font-size: 0.75rem;
    font-weight: 700;
    background: var(--scroll-edge);
    border-radius: 50%;
  }

  /* The ring, not the button, which is far wider and would box the trail running under it. */
  .stop:focus-visible {
    outline: none;
  }

  .stop:focus-visible .node {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .stop:hover .node {
    border-color: var(--ink);
  }

  .past .number {
    color: var(--ok-ink);
    background: var(--ok);
  }

  .on .node,
  .stop.on:hover .node {
    border-color: var(--accent);
    border-width: 5px;
  }

  .on .number {
    color: var(--accent-ink);
    background: var(--accent);
  }

  .on .label {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .open {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 1.5rem;
    align-items: center;
  }

  h3 {
    margin: 0 0 0.35rem;
    font-family: 'RuneScape', var(--font-body);
    font-size: 1.5rem;
    font-weight: 400;
    line-height: 1.15;
  }

  h3:focus {
    outline: none;
  }

  .words p,
  .wide p {
    margin: 0;
  }

  .moves {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 0.5rem !important;
  }

  .move {
    min-height: 44px;
    padding: 0;
    color: var(--scroll-ink);
    font-family: 'RuneScape', var(--font-body);
    text-decoration: underline;
    text-underline-offset: 0.2em;
    background: none;
    border: 0;
    box-shadow: none;
  }

  .wide {
    display: grid;
    gap: 0.75rem;
  }

  .scoring {
    font-weight: 700;
  }

  .closing {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  @media (max-width: 47.98rem) {
    .trail {
      --stamp: 44px;
      --drop: 18px;
    }

    .label {
      display: none;
    }

    .number {
      display: none;
    }

    .open {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .node {
      transition: none;
    }
  }
</style>
