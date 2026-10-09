<script lang="ts">
  /**
   * The top of the Wise Old Man's sheet: a title and his line, beside him and as tall as
   * his chathead, so what follows on the sheet starts below him.
   */
  import type { Snippet } from 'svelte'

  let { title, children }: { title: string; children: Snippet } = $props()
</script>

<div class="head">
  <h2>{title}</h2>
  <p class="says">{@render children()}</p>
</div>

<style>
  .head {
    margin-left: var(--host-clear);
    min-height: calc(var(--npc-w) * 1.9 - 0.25rem);
  }

  h2 {
    margin: 0 0 0.25rem;
    font-size: max(1.15rem, 1.5rem * var(--scroll-text, 1));
    line-height: 1.15;
  }

  .says {
    margin: 0 0 0.5rem;
    font-size: max(0.9rem, 1.05rem * var(--scroll-text, 1));
    font-style: italic;
    line-height: 1.3;
  }
</style>
