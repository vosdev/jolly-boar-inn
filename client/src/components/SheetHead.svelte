<script lang="ts">
  /**
   * A sheet's title with a close X at its right. The X is the sheet's first control, so
   * opening the modal focuses it and a long sheet starts at its top, closable from there.
   */
  import type { Snippet } from 'svelte'

  import Icon from './Icon.svelte'

  let { id, onclose, children }: { id: string; onclose: () => void; children: Snippet } = $props()
</script>

<div class="sheet-head">
  <h2 {id}>{@render children()}</h2>
  <button type="button" class="glyph" aria-label="Close" onclick={onclose}>
    <Icon name="close" />
  </button>
</div>

<style>
  .sheet-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0 0 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .glyph {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    margin: -0.5rem -0.5rem 0 0;
    padding: 0;
    background: none;
    border-color: transparent;
  }
</style>
