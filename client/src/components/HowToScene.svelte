<script lang="ts">
  /**
   * A drawing of one way to play, for How to play: a laptop, two gods side by side, or a
   * sofa under a TV. It is made of the theme's tokens and real pets rather than a
   * screenshot, so it follows every theme. Everything inside is sized in `em`, set from the
   * drawing's own width, so it holds at any size; the words in it are part of the picture.
   */
  import type { WayId } from '../lib/howToPlay'
  import { avatarArt } from '../lib/pets'
  import type { TeamId } from '../lib/teams'
  import TeamLogo from './TeamLogo.svelte'

  let { way, label }: { way: WayId; label: string } = $props()

  const QUESTION = 'Which god does Commander Zilyana serve?'
  const ANSWERS = ['Saradomin', 'Zamorak', 'Bandos', 'Armadyl']
  const GODS: { team: TeamId; name: string; score: number; pets: string[] }[] = [
    {
      team: 'saradomin',
      name: 'Saradomin',
      score: 742,
      pets: ['olmlet', 'bloodhound', 'chompy_chick'],
    },
    {
      team: 'zamorak',
      name: 'Zamorak',
      score: 690,
      pets: ['hellpuppy', 'giant_squirrel', 'baby_mole'],
    },
  ]
  const SEATED = ['olmlet', 'giant_squirrel', 'bloodhound', 'hellpuppy']

  const art = (pet: string): string => avatarArt(pet).url
</script>

{#snippet screen(count: string, pets: string[])}
  <div class="screen">
    <div class="question">
      <p>{QUESTION}</p>
      <div class="answers">
        {#each ANSWERS as answer (answer)}<span>{answer}</span>{/each}
      </div>
    </div>
    <div class="table">
      <span>{count}</span>
      <span class="heads">
        {#each pets as pet (pet)}<img src={art(pet)} alt="" draggable="false" />{/each}
      </span>
    </div>
  </div>
{/snippet}

<div class="scene" role="img" aria-label={label}>
  <div class="inside">
    {#if way === 'free'}
      <div class="laptop">
        <div class="lid">
          {@render screen('3 of 5', ['baby_mole', 'bloodhound', 'chompy_chick'])}
        </div>
        <div class="base"></div>
      </div>
      <img class="you" src={art('olmlet')} alt="" draggable="false" />
      <span class="points">+820</span>
    {:else if way === 'teams'}
      <div class="gods">
        {#each GODS as god, i (god.team)}
          {#if i === 1}<span class="versus">vs</span>{/if}
          <div class="god" data-team={god.team}>
            <span class="symbol"><TeamLogo team={god.team} /></span>
            <b>{god.name}</b>
            <span class="heads">
              {#each god.pets as pet (pet)}<img src={art(pet)} alt="" draggable="false" />{/each}
            </span>
            <span class="score">{god.score}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="tv">{@render screen('3 of 4', ['giant_squirrel'])}</div>
      <div class="sofa"></div>
      {#each SEATED as pet (pet)}
        <span class="seat">
          <img src={art(pet)} alt="" draggable="false" />
          <span class="phone"><i></i><i></i><i></i><i></i></span>
        </span>
      {/each}
    {/if}
  </div>
</div>

<style>
  .scene {
    position: relative;
    container-type: inline-size;
    aspect-ratio: 8 / 5;
    overflow: hidden;
    border-radius: calc(var(--radius) + 2px);
    background-color: var(--bg);
    background-image: var(--texture-bg);
  }

  .inside {
    position: absolute;
    inset: 0;
    font-family: var(--font-body);
    font-size: 3.3333cqw;
    line-height: 1.2;
  }

  img {
    object-fit: contain;
  }

  .heads {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.2em;
  }

  .screen {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 4.8em;
    gap: 0.4em;
    aspect-ratio: 16 / 10;
    padding: 0.45em;
    background: var(--bg);
    border-radius: 0.15em;
  }

  .question {
    display: grid;
    align-content: center;
    gap: 0.45em;
    padding: 0.6em;
    color: var(--scroll-ink);
    background: var(--scroll-paper);
    border-radius: 0.2em;
  }

  .question p {
    margin: 0;
    font-family: 'RuneScape', var(--font-body);
    font-size: 1.15em;
    line-height: 1.15;
    text-align: center;
  }

  .answers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3em;
  }

  .answers span {
    padding: 0.3em 0.2em;
    overflow: hidden;
    color: var(--ink);
    font-size: 0.8em;
    text-align: center;
    white-space: nowrap;
    background: var(--panel-raised);
    border-radius: 0.15em;
  }

  .table {
    display: grid;
    align-content: start;
    justify-items: center;
    gap: 0.3em;
    padding: 0.4em 0.3em;
    color: var(--ink);
    font-size: 0.9em;
    font-weight: 600;
    background: var(--panel);
    border-radius: 0.2em;
  }

  .table img {
    width: 1.7em;
    height: 1.7em;
  }

  .laptop {
    position: absolute;
    top: 1.2em;
    left: 2.4em;
    width: 20em;
  }

  .lid,
  .tv {
    background: var(--line);
  }

  .lid {
    padding: 0.5em;
    border-radius: 0.7em 0.7em 0 0;
  }

  .base {
    height: 0.9em;
    margin: 0 -1.4em;
    background: var(--muted);
    border-radius: 0 0 0.9em 0.9em;
  }

  .you {
    position: absolute;
    right: 0.8em;
    bottom: 0.5em;
    width: 7.6em;
    height: 9.8em;
  }

  .points {
    position: absolute;
    top: 2.4em;
    right: 1em;
    padding: 0.2em 0.55em;
    color: var(--ok-ink);
    font:
      1.9em/1.1 'RuneScape',
      var(--font-body);
    background: var(--ok);
    border-radius: 0.3em;
  }

  .gods {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 3em minmax(0, 1fr);
    align-items: center;
    height: 100%;
    padding: 1em;
  }

  .versus {
    color: var(--bg-ink);
    font:
      2em/1 'RuneScape',
      var(--font-body);
    text-align: center;
  }

  .god {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.5em;
    height: 100%;
    padding: 0.8em 0.4em;
    color: var(--ink);
    background: var(--panel);
    border: 0.25em solid var(--team);
    border-radius: 0.4em;
  }

  .god b {
    font-size: 1.25em;
    line-height: 1;
  }

  .symbol {
    display: grid;
    place-items: center;
    width: 4.4em;
    height: 3.8em;
  }

  .symbol :global(.logo) {
    max-width: 100%;
    max-height: 100%;
  }

  .god .heads img {
    width: 2.6em;
    height: 2.6em;
  }

  .score {
    padding: 0.1em 0.6em;
    color: var(--team-ink);
    font:
      1.7em/1.2 'RuneScape',
      var(--font-body);
    background: var(--team);
    border-radius: 0.25em;
  }

  .tv {
    position: absolute;
    top: 0.7em;
    left: 5.2em;
    width: 19.6em;
    padding: 0.4em;
    border-radius: 0.3em;
  }

  .tv .screen {
    grid-template-columns: minmax(0, 1fr) 5em;
    aspect-ratio: 16 / 8;
  }

  .sofa {
    position: absolute;
    right: 2em;
    bottom: 0.8em;
    left: 2em;
    height: 4.6em;
    background: var(--bad);
    border: 0.2em solid color-mix(in srgb, var(--bad) 70%, var(--bg));
    border-radius: 1em 1em 0.4em 0.4em;
  }

  .sofa::after {
    content: '';
    position: absolute;
    right: 1.4em;
    bottom: 0;
    left: 1.4em;
    height: 1.9em;
    background: color-mix(in srgb, var(--bad) 80%, var(--panel));
    border-radius: 0.5em 0.5em 0 0;
  }

  .seat {
    position: absolute;
    bottom: 3.1em;
    display: grid;
    justify-items: center;
    width: 5.4em;
  }

  .seat:nth-of-type(1) {
    left: 3.4em;
  }

  .seat:nth-of-type(2) {
    left: 9.2em;
  }

  .seat:nth-of-type(3) {
    left: 15.4em;
  }

  .seat:nth-of-type(4) {
    left: 21.2em;
  }

  .seat img {
    width: 4em;
    height: 4.2em;
  }

  .phone {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 1fr;
    gap: 0.12em;
    width: 1.9em;
    height: 2.7em;
    margin-top: -1em;
    padding: 0.22em 0.18em;
    background: var(--scroll-paper);
    border: 0.16em solid var(--line);
    border-radius: 0.3em;
  }

  .phone i {
    background: var(--panel-raised);
    border-radius: 0.08em;
  }
</style>
