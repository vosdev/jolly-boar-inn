<script lang="ts">
  /**
   * The item a player holds this round, in a small round slot on their pet's shoulder.
   * Items are in the open, so every screen shows everyone's.
   */
  import type { HeldItem } from '../lib/protocol'
  import ItemIcon from './ItemIcon.svelte'

  let { held, size = 18 }: { held: HeldItem; size?: number } = $props()
</script>

<span class="worn" style:--size="{size + 6}px">
  <ItemIcon id={held.id} charges={held.charges} {size} />
</span>

<style>
  .worn {
    position: absolute;
    top: -0.2rem;
    right: -0.45rem;
    display: grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border: 2px solid var(--line);
    border-radius: 50%;
    background: var(--panel-raised);
  }
</style>
