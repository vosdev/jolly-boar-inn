<script lang="ts">
  /**
   * The chathead of the NPC asking one of the host's questions, or a "?" for one left to
   * the room's draw, which picks the NPC when the question comes up.
   */
  import { npcArt } from '../lib/npcs'

  let { npc }: { npc: string | undefined } = $props()

  const art = $derived(npc === undefined ? null : npcArt(npc))
</script>

{#if art === null}
  <span class="anyone" aria-hidden="true">?</span>
{:else}
  <img class={art.cut} src={art.url} alt="" draggable="false" />
{/if}

<style>
  img {
    display: block;
    max-width: 90%;
    max-height: 92%;
  }

  .render {
    aspect-ratio: 1;
    object-fit: cover;
    object-position: top;
  }

  .anyone {
    color: var(--muted);
    font-weight: 800;
    font-size: 1.2rem;
  }
</style>
