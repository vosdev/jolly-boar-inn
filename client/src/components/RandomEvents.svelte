<script lang="ts">
  /**
   * Create's random events: who might turn up, how often, and what that comes to in this
   * game. Each event is a slot, and the host's own questions fill slots before the room
   * draws the rest, so the strip shows the host's askers first and a silhouette for every
   * surprise left.
   *
   * A silhouette that stood still would promise that NPC, so they keep changing to others
   * from the roster: any of them could turn up. With reduced motion they stand still.
   */
  import type { CustomQuestion } from '../lib/customQuestions'
  import { npcArt } from '../lib/npcs'
  import { reducedMotion } from '../lib/interlude'
  import { EVENT_EVERY, type EventFrequency } from '../lib/protocol'
  import { RANDOM_EVENTS } from '../lib/randomEvents'
  import NpcFace from './NpcFace.svelte'

  /** Slots drawn one by one; past this the strip counts the rest. */
  const SHOWN_SLOTS = 8
  /** How long each silhouette stands before the next NPC takes its place. */
  const SWAP_MS = 2500

  const OPTIONS: { value: EventFrequency; label: string }[] = [
    { value: 'less', label: 'Less' },
    { value: 'default', label: 'Default' },
    { value: 'more', label: 'More' },
  ]

  let {
    frequency = $bindable(),
    slots,
    atLeast = false,
    own,
  }: {
    frequency: EventFrequency
    /** Random events this game makes room for at `frequency`. */
    slots: number
    /** The rounds are a surprise, so `slots` is the fewest there will be. */
    atLeast?: boolean
    own: CustomQuestion[]
  } = $props()

  const id = $props.id()
  const roster = [...RANDOM_EVENTS]
    .sort(() => Math.random() - 0.5)
    .map((npc) => ({ id: npc.id, art: npcArt(npc.id) }))

  const mine = $derived(Math.min(own.length, slots))
  const surprises = $derived(slots - mine)
  const shown = $derived(Math.min(slots, SHOWN_SLOTS))

  let turn = $state(0)

  /** Each turn deals the shown surprises the next NPCs along, so no two show the same one. */
  function shadow(index: number) {
    return roster[(turn * (shown - mine) + index - mine) % roster.length]!
  }

  $effect(() => {
    if (reducedMotion()) return
    const timer = setInterval(() => turn++, SWAP_MS)
    return () => clearInterval(timer)
  })
</script>

<section class="panel events" aria-labelledby="{id}-title">
  <h2 id="{id}-title">Random events</h2>
  <p class="note lead">They barge into a round with a question of their own.</p>

  <fieldset class="often">
    <legend class="sr">Random events frequency</legend>
    {#each OPTIONS as option (option.value)}
      <label class="option">
        <input type="radio" name="{id}-often" value={option.value} bind:group={frequency} />
        <b>{option.label}</b>
        <span>1 per {EVENT_EVERY[option.value]}</span>
      </label>
    {/each}
  </fieldset>

  <div class="slots">
    {#if slots > 0}
      <ol class="pips" aria-hidden="true">
        {#each { length: shown } as _, index (index)}
          {#if index < mine}
            <li class="mine"><NpcFace npc={own[index]?.random_event} /></li>
          {:else}
            {@const npc = shadow(index)}
            <li class="surprise">
              {#key npc.id}
                <span class="shadow {npc.art.cut}" style:--art="url({npc.art.url})"></span>
              {/key}
            </li>
          {/if}
        {/each}
        {#if slots > shown}<li class="more">+{slots - shown}</li>{/if}
      </ol>
    {/if}
    <p>
      <b>{atLeast ? 'At least ' : ''}{slots} in this game</b><br />
      <span class="note">
        {#if slots === 0}
          Add round questions or pick More to make room for one.
        {:else if mine === 0}
          Each one a surprise.
        {:else}
          {mine} written by you, {surprises} surprise{surprises === 1 ? '' : 's'}
        {/if}
      </span>
    </p>
  </div>
</section>

<style>
  .events h2 {
    margin: 0;
  }

  .lead {
    margin: 0.2rem 0 0.75rem;
  }

  .often {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0 0 0.75rem;
    padding: 0;
    border: none;
    min-width: 0;
  }

  .option {
    min-height: 3.5rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.05rem;
    padding: 0.3rem;
    color: var(--ink);
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    cursor: pointer;
  }

  .option span {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .option:has(:checked) {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }

  .option:has(:checked) span {
    color: inherit;
  }

  .option:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .slots {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: calc(0.5rem - var(--border-give)) calc(0.75rem - var(--border-give));
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
  }

  .slots p {
    margin: 0;
    line-height: 1.35;
  }

  .pips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pips li {
    width: 2.6rem;
    height: 2.85rem;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: var(--border-width) dashed var(--line);
    border-radius: min(var(--radius), 6px);
    color: var(--muted);
    font-weight: 800;
    font-size: 1.2rem;
  }

  .pips li.mine {
    place-items: end center;
    border-style: solid;
    border-color: var(--accent);
  }

  /* The picture is only a mask, so the silhouette takes the theme's muted ink. */
  .shadow {
    width: 90%;
    height: 92%;
    align-self: end;
    background: var(--muted);
    mask: var(--art) bottom / contain no-repeat;
    animation: appear 0.4s ease-out;
  }

  .shadow.render {
    aspect-ratio: 1;
    height: auto;
    align-self: start;
    mask-position: top;
    mask-size: cover;
  }

  /* A random event comes in from the stage's other side, so it faces the other way. The
     wiki's renders already face left. */
  .shadow:is(.chathead, .drawing),
  .mine :global(:is(.chathead, .drawing)) {
    transform: scaleX(-1);
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shadow {
      animation: none;
    }
  }

  .pips li.more {
    border: none;
    font-size: 0.9rem;
  }
</style>
