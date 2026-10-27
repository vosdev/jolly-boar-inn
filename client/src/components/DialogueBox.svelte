<script lang="ts">
  /**
   * The game's dialogue box on its own, with no sheet under it (section 8 of
   * ideas/design.md): an NPC's chathead, its name pinned centred to the top, and what it
   * says beside it. On the `right` the chathead is mirrored, so it still faces the words.
   * The stage draws its own box, which moves with the stage; this one stands still.
   */
  import type { Snippet } from 'svelte'

  import { npcArt } from '../lib/npcs'

  let {
    npc,
    name,
    side = 'left',
    children,
  }: {
    /** The NPC id whose chathead it shows. */
    npc: string
    name: string
    side?: 'left' | 'right'
    children: Snippet
  } = $props()

  const art = $derived(npcArt(npc))
</script>

<div class="box surface" class:right={side === 'right'}>
  <img class="face {art.cut}" src={art.url} alt="" draggable="false" />
  <div class="speech">
    <p class="name">{name}</p>
    {@render children()}
  </div>
</div>

<style>
  /* The stage's dialogue box (`StageView`'s bubble), its look kept in step by hand. */
  .box {
    --head: 92px;
    container-type: inline-size;
    display: grid;
    grid-template-columns: var(--head) minmax(0, 1fr);
    align-items: center;
    column-gap: 1rem;
    padding: 0.6rem 1.1rem 0.7rem 0.7rem;
    background: var(--panel-raised);
    color: var(--ink);
    border: 2px solid var(--line);
    border-radius: calc(var(--radius) + 8px);
    box-shadow: var(--shadow);
    font-family: 'RuneScape', var(--font-body);
    font-size: 1rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .box.right {
    grid-template-columns: minmax(0, 1fr) var(--head);
    padding: 0.6rem 0.7rem 0.7rem 1.1rem;
  }

  .face {
    display: block;
    width: var(--head);
    height: auto;
    filter: drop-shadow(0 3px 0 rgb(0 0 0 / 0.25));
  }

  /* A wiki render is the whole NPC: only its head, cut square, as the stage cuts it. */
  .face.render {
    aspect-ratio: 1;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  .right .face {
    grid-column: 2;
    grid-row: 1;
  }

  /* A chathead faces right, toward words on its left side; on the right it turns round. */
  .right .face:is(.chathead, .drawing) {
    transform: scaleX(-1);
  }

  .right .face.render {
    transform: none;
  }

  /* The name stays pinned at the top however tall the chathead is. */
  .speech {
    align-self: start;
  }

  .right .speech {
    grid-column: 1;
    grid-row: 1;
  }

  .name {
    margin: 0 0 0.45rem;
    color: var(--speaker);
    text-align: center;
  }

  .speech > :global(p:not(.name)) {
    margin: 0;
  }

  @media (max-width: 26rem) {
    .box {
      --head: 56px;
      column-gap: 0.6rem;
      padding: 0.45rem 0.8rem 0.5rem 0.5rem;
    }

    .box.right {
      padding: 0.45rem 0.5rem 0.5rem 0.8rem;
    }
  }
</style>
