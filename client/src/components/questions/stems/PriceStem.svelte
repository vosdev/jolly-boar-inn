<script lang="ts">
  /**
   * The Price is Right's question: the item, as `AssetStem` draws it, and what to guess
   * about it. Both are on the scroll; the four prices are the buttons under the line.
   */
  import type { StemProps } from '../props'
  import AssetStem from './AssetStem.svelte'

  let props: StemProps = $props()
</script>

<AssetStem {...props} />
<p class="ask">What does it go for on the Grand Exchange?</p>

<style>
  .ask {
    margin: 0;
    font-size: max(0.95rem, 1.05rem * var(--scroll-text, 1));
    color: var(--muted);
  }
</style>
