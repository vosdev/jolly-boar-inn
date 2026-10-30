<script lang="ts">
  /**
   * A small drawing of the screen one stop of the night happens on, for How to play's
   * trail: the theme's tokens and real faces rather than a screenshot, so it follows every
   * theme and cannot go stale pixel by pixel. Sized in `em` from its own width, like
   * `HowToScene`; the words in it are part of the picture.
   */
  import type { StopId } from '../lib/howToPlay'
  import { npcArt } from '../lib/npcs'
  import { avatarArt } from '../lib/pets'

  let { stop, label }: { stop: Exclude<StopId, 'answer'>; label: string } = $props()

  const pet = (id: string): string => avatarArt(id).url
  const host = (id: string): string => npcArt(id).url
</script>

{#snippet pets(ids: string[])}
  <div class="pets">
    {#each ids as id (id)}<img src={pet(id)} alt="" draggable="false" />{/each}
  </div>
{/snippet}

{#snippet ready()}
  <span class="switch"><i></i>Ready</span>
{/snippet}

<div class="mini" role="img" aria-label={label}>
  <div class="inside" class:two={stop !== 'create'}>
    {#if stop === 'create'}
      <div class="paper wide">
        <div class="row">
          <span class="input">ThermonuclearSmokeDevil</span>
          <span class="button primary dim">Join</span>
        </div>
        <p class="small centre">or</p>
        <span class="button lit">Create a room</span>
      </div>
    {:else if stop === 'choose'}
      <div class="panel">
        <span class="heading">Who's hosting tonight?</span>
        <div class="hosts">
          <span class="host on"><img src={host('ali_morrisane')} alt="" />More or Less</span>
          <span class="host on"><img src={host('historian_minas')} alt="" />Sort It Out</span>
          <span class="host"><img src={host('examiner')} alt="" />Guess the Examine</span>
          <span class="host on"><img src={host('nieve')} alt="" />Drop Table</span>
        </div>
      </div>
      <div class="panel">
        <span class="heading">House rules</span>
        <span class="rule">Pace <b>Run</b></span>
        <span class="rule">Teams <b>Off</b></span>
        <span class="rule">Random events <b>On</b></span>
      </div>
    {:else if stop === 'invite'}
      <div class="paper">
        <p class="small centre">Your friends join with this code</p>
        <p class="big code">GhostspeakAmulet</p>
        <span class="button middle">Copy invite link</span>
      </div>
      <div class="panel">
        <span class="heading">At the table</span>
        {@render pets(['olmlet', 'bloodhound', 'giant_squirrel', 'hellpuppy'])}
      </div>
    {:else if stop === 'ready'}
      <div class="panel">
        <span class="heading">Ready 3</span>
        {@render pets(['olmlet', 'bloodhound', 'giant_squirrel'])}
        <span class="heading">Not ready yet 1</span>
        {@render pets(['hellpuppy'])}
      </div>
      <div class="panel middle-all">
        {@render ready()}
        <span class="button primary lit">Start</span>
      </div>
    {:else if stop === 'splash'}
      <div class="paper">
        <p class="big">Sort It Out</p>
        <p class="centre">Are you a skiller or a slacker?</p>
        <p class="small centre">Round 1 of 4, 5 questions</p>
        <div class="tonight">
          <img class="now" src={host('historian_minas')} alt="" />
          <img src={host('ali_morrisane')} alt="" />
          <img src={host('examiner')} alt="" />
          <img src={host('nieve')} alt="" />
        </div>
      </div>
      <div class="panel middle-all">
        {@render ready()}
        <span class="note">Starting in</span>
        <span class="count">4</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .mini {
    position: relative;
    container-type: inline-size;
    aspect-ratio: 46 / 26;
    overflow: hidden;
    background-color: var(--bg);
    background-image: var(--texture-bg);
    border-radius: min(var(--radius), 8px);
  }

  .inside {
    position: absolute;
    inset: 0;
    display: grid;
    gap: 1em;
    padding: 1.4em;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 2.1739cqw;
    line-height: 1.2;
  }

  .inside.two {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }

  p {
    margin: 0;
  }

  img {
    object-fit: contain;
  }

  .paper {
    display: grid;
    align-content: center;
    gap: 0.8em;
    padding: 1.4em;
    color: var(--scroll-ink);
    background: var(--scroll-paper);
    border-radius: 0.3em;
  }

  .paper.wide {
    padding: 2em 4em;
  }

  .panel {
    display: grid;
    align-content: start;
    gap: 0.7em;
    padding: 1.1em;
    background: var(--panel);
    border: 0.14em solid var(--line);
    border-radius: 0.3em;
  }

  .panel.middle-all {
    align-content: center;
    justify-items: center;
  }

  .heading {
    font-size: 1.5em;
    font-weight: 700;
  }

  .big {
    font:
      3.4em/1.1 'RuneScape',
      var(--font-body);
    text-align: center;
  }

  /* Long enough to outrun its half of the drawing at the big size. */
  .big.code {
    font-size: 1.85em;
    white-space: nowrap;
  }

  .centre {
    text-align: center;
  }

  .small {
    color: var(--scroll-muted);
    font-size: 1.3em;
  }

  .note {
    color: var(--muted);
    font-size: 1.3em;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.8em;
  }

  .input {
    flex: 1;
    min-width: 0;
    height: 2.4em;
    padding: 0.4em;
    overflow: hidden;
    color: var(--muted);
    font:
      1.5em/1.5 'RuneScape',
      var(--font-body);
    white-space: nowrap;
    background: var(--panel-raised);
    border: 0.1em solid var(--scroll-edge);
    border-radius: 0.2em;
  }

  .button {
    display: grid;
    place-items: center;
    min-height: 2.6em;
    padding: 0 1.1em;
    color: var(--ink);
    font-size: 1.3em;
    font-weight: 600;
    background: var(--panel-raised);
    border: 0.12em solid var(--line);
    border-radius: 0.25em;
  }

  .button.middle {
    justify-self: center;
  }

  .button.primary {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }

  .button.dim {
    opacity: 0.55;
  }

  .button.lit {
    outline: 0.25em solid var(--accent);
    outline-offset: 0.2em;
  }

  .hosts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6em;
  }

  .host {
    display: grid;
    justify-items: center;
    gap: 0.2em;
    padding: 0.5em 0.2em;
    font-size: 1.1em;
    font-weight: 600;
    text-align: center;
    background: var(--panel-raised);
    border: 0.16em solid var(--line);
    border-radius: 0.3em;
  }

  .host.on {
    border-color: var(--accent);
    outline: 0.14em solid var(--accent);
  }

  .host img {
    width: 3.4em;
    height: 3.4em;
  }

  .rule {
    display: flex;
    justify-content: space-between;
    gap: 0.6em;
    padding: 0.5em 0;
    font-size: 1.25em;
    border-top: 0.08em solid var(--line);
  }

  .rule b {
    color: var(--muted);
  }

  .pets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
  }

  .pets img {
    width: 3.8em;
    height: 3.8em;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 0.6em;
    font-size: 1.5em;
    font-weight: 700;
  }

  .switch i {
    position: relative;
    width: 2.8em;
    height: 1.5em;
    background: var(--ok);
    border-radius: 1em;
  }

  .switch i::after {
    content: '';
    position: absolute;
    top: 0.15em;
    right: 0.15em;
    width: 1.2em;
    height: 1.2em;
    background: var(--ok-ink);
    border-radius: 50%;
  }

  .tonight {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.8em;
  }

  .tonight img {
    width: 3.2em;
    height: 3.2em;
  }

  .tonight img.now {
    width: 5em;
    height: 5em;
  }

  .count {
    font:
      3em/1 'RuneScape',
      var(--font-body);
  }
</style>
