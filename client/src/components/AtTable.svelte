<script lang="ts">
  /**
   * What a screen puts in the room's table column (`lib/roomTable.svelte.ts`), drawn in
   * place where there is no room around it.
   */
  import type { Snippet } from 'svelte'

  import { roomTable } from '../lib/roomTable.svelte'

  let { children }: { children: Snippet } = $props()

  const table = roomTable()
  let part = $state<HTMLElement | null>(null)

  // The part leaves the wrapper Svelte removes, so it is taken out here as the screen ends.
  $effect(() => {
    const node = part
    const target = table?.target ?? null
    if (node === null || target === null) return
    target.append(node)
    return () => node.remove()
  })
</script>

{#if table === null}
  {@render children()}
{:else}
  <div hidden>
    <div class="part" bind:this={part}>{@render children()}</div>
  </div>
{/if}

<style>
  .part {
    display: contents;
  }
</style>
