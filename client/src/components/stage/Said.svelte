<script lang="ts">
  /**
   * What goes in the stage's speech bubble: the speaker's name, then the line. `later` is
   * what the bubble says at another moment of the same screen, laid out unseen in the
   * same place, so the bubble is the taller one's height from the first frame and nothing
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
    later?: Snippet
    /** The name as a heading: a random event's NPC, who is the screen's subject. */
    heading?: boolean
  } = $props()
</script>

{#if heading}<h2 class="name">{name}</h2>{:else}<p class="name">{name}</p>{/if}
<div class="stack">
  <div class="line">{@render line?.()}</div>
  {#if later}<div class="line later" aria-hidden="true">{@render later()}</div>{/if}
</div>

<style>
  .name {
    margin: 0 0 0.1rem;
    font: inherit;
    color: var(--muted);
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
