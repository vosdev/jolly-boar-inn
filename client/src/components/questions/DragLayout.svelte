<script lang="ts">
  /**
   * A drag answer's parts: what to do, the list, and Start over and Submit. On a phone they
   * stack in that order; on a stage wide enough (the desktop frame's) the list takes the
   * left and the rest stand in a column on its right, the buttons at its foot.
   */
  import type { Snippet } from 'svelte'

  let { ask, list, actions }: { ask: Snippet; list: Snippet; actions?: Snippet } = $props()
</script>

<div class="drag">
  <div class="ask">{@render ask()}</div>
  <div class="list">{@render list()}</div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
  @container (min-width: 40rem) {
    .drag {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 230px;
      grid-template-rows: auto 1fr;
      column-gap: 1.5rem;
    }

    .ask {
      grid-column: 2;
      grid-row: 1;
    }

    .list {
      grid-column: 1;
      grid-row: 1 / 3;
    }

    .actions {
      grid-column: 2;
      grid-row: 2;
      align-self: end;
    }
  }
</style>
