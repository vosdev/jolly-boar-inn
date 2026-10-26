<script lang="ts">
  /**
   * What goes in the stage's dialogue box: the speaker's name, centred, then the line. A
   * `chip` sits at the right end of the name's row: your points on the reveal.
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
    tag,
    chip,
  }: {
    name: string
    line?: Snippet
    later?: Snippet | Snippet[]
    /** The name as a heading: a random event's NPC, who is the screen's subject. */
    heading?: boolean
    /** A label beside the name: a random event's, so the box says this is not the round's. */
    tag?: string
    chip?: Snippet
  } = $props()

  const unseen = $derived(later === undefined ? [] : Array.isArray(later) ? later : [later])
</script>

{#snippet label()}
  {#if heading}<h2 class="name">{name}</h2>{:else}<p class="name">{name}</p>{/if}
{/snippet}

{#if tag === undefined && chip === undefined}
  {@render label()}
{:else}
  <div class="title">
    <div class="who">
      {@render label()}
      {#if tag !== undefined}<span class="tag">{tag}</span>{/if}
    </div>
    {#if chip !== undefined}<div class="chip">{@render chip()}</div>{/if}
  </div>
{/if}
<div class="stack">
  <div class="line">{@render line?.()}</div>
  {#each unseen as other, i (i)}
    <div class="line later" aria-hidden="true">{@render other()}</div>
  {/each}
</div>

<style>
  /* The name stays centred over the box while the chip has room; short of it, the name
     gives way to the left. */
  .title {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(max-content, 1fr);
    align-items: center;
    column-gap: 0.6rem;
    margin: 0 0 0.45rem;
  }

  .who {
    grid-column: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 0.2rem 0.6rem;
  }

  .chip {
    grid-column: 3;
    justify-self: end;
    white-space: nowrap;
  }

  .title .name {
    margin: 0;
  }

  .tag {
    padding: 0.05rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--muted);
    font-size: 0.8em;
    font-weight: 650;
  }

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
