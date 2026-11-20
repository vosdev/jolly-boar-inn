<script lang="ts" module>
  /** The page's overview, the random events, or a game mode's id. */
  export type HowToView = 'overview' | 'events' | (string & {})
</script>

<script lang="ts">
  /**
   * Home's How to play page, under Home's dialogue box, which speaks for it: the overview
   * (the three ways to play, the trail through a night and the game modes), or one mode's
   * view, or the random events'. Picking a mode swaps the whole page, as Suggest's editor
   * does; which view shows is the address's (`/how-to-play/<mode>`).
   *
   * Which modes there are is the slideshow's list; which types each is answered in is
   * `/api/modes`, so a mode's view shows only what its round asks.
   */
  import { onMount } from 'svelte'

  import type { ModePacing } from '../lib/api'
  import { WAYS_TO_PLAY, loadModes, modeTypes, rowsFor } from '../lib/howToPlay'
  import { MODES } from '../lib/modes'
  import { npcArt } from '../lib/npcs'
  import { RANDOM_EVENTS, STRANGER } from '../lib/randomEvents'
  import { SAMPLES } from '../lib/samples'
  import { sheetFor } from '../lib/sheet'
  import { watchTheme } from '../lib/theme'
  import AnswerRows from './AnswerRows.svelte'
  import HowToScene from './HowToScene.svelte'
  import HowToTrail from './HowToTrail.svelte'
  import { SHOWN } from './ModeShowcase.svelte'
  import ClueScroll from './stage/ClueScroll.svelte'

  let {
    view,
    onopen,
    onall,
    onback,
    ontry,
    oncreate,
    createDisabled = false,
  }: {
    view: HowToView
    /** Open a mode's view, or the random events'. */
    onopen: (view: HowToView) => void
    /** Back to the overview from a mode's view. */
    onall: () => void
    /** Leave the page for Home. */
    onback: () => void
    /** Play a mode's sample question in the dialogue box's place. */
    ontry: (mode: string) => void
    /** Go and create a room. */
    oncreate: () => void
    /** At the room limit, where Home refuses Create too. */
    createDisabled?: boolean
  } = $props()

  let modes = $state<ModePacing[] | null>(null)
  let heading = $state<HTMLElement | null>(null)
  let theme = $state('')

  onMount(() => watchTheme((now) => (theme = now)))
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
    <section class="panel" aria-labelledby="how-title">
      <p class="back">
        <button type="button" class="link" onclick={onback}>← Back</button>
      </p>
      <h1 id="how-title" tabindex="-1" bind:this={heading}>How to play</h1>
      <h2>Ways to play</h2>
      <ul class="ways">
        {#each WAYS_TO_PLAY as way (way.id)}
          <li>
            <HowToScene way={way.id} label={way.drawing} />
            <h3>{way.title}</h3>
            <p>{way.text}</p>
          </li>
        {/each}
      </ul>
    </section>

    <section class="night" aria-label="A night at the inn">
      <ClueScroll sheet={sheetFor(theme)} {theme}>
        <HowToTrail ontry={() => ontry('more_less')} {oncreate} {createDisabled} />
      </ClueScroll>
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
              <span class="note">NPCs who drop in mid-round with a bonus question.</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
{:else if view === 'events'}
  <section class="panel">
    <p class="back">
      <button type="button" class="link" onclick={onall}>← All game modes</button>
    </p>
    <h1 tabindex="-1" bind:this={heading}>Random events</h1>
    <p>
      When creating a room, the host chooses how often random events appear, and can even write
      custom questions for specific NPCs to ask.
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
    {#if mode.id in SAMPLES}
      <p>
        <button type="button" class="primary" onclick={() => ontry(mode.id)}>Try a question</button>
      </p>
    {/if}
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

  .ways {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ways p {
    margin: 0.2rem 0 0;
    color: var(--muted);
  }

  .ways h3 {
    margin-top: 0.6rem;
  }

  .night {
    margin-block: 1.5rem;
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
</style>
