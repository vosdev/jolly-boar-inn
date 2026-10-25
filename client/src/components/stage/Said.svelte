<script lang="ts">
  /**
   * What goes in the stage's dialogue box: the speaker's name, centred, then the line.
   * `later` is what the box says at other moments of the same screen, laid out unseen in
   * the same place, so the box is the tallest one's height from the first frame and nothing
   * under it moves when the words change.
   */
  import type { Snippet } from 'svelte'

  let {
    name,
    line,
    later,
    heading = false,
  }: {
    name: string
    line?: Snippet
    later?: Snippet | Snippet[]
    /** The name as a heading: a random event's NPC, who is the screen's subject. */
    heading?: boolean
  } = $props()

  const unseen = $derived(later === undefined ? [] : Array.isArray(later) ? later : [later])
</script>

{#if heading}<h2 class="name">{name}</h2>{:else}<p class="name">{name}</p>{/if}
<div class="stack">
  <div class="line">{@render line?.()}</div>
  {#each unseen as other, i (i)}
    <div class="line later" aria-hidden="true">{@render other()}</div>
  {/each}
</div>

<style>
  .name {
    margin: 0 0 0.45rem;
    font: inherit;
    color: var(--speaker);
    text-align: center;
  }

  .stack {
    display: grid;
  }

  .line {
    grid-area: 1 / 1;
  }

  .line > :global(p) {
    margin: 0;
  }

  .line > :global(p + p) {
    margin-top: 0.3rem;
  }

  .later {
    visibility: hidden;
  }
</style>
