<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  import { lines as subjectLines } from './AssetStem.svelte'

  /** What the stem types: the item's name. The question is the host's, in the bubble. */
  export function lines(data: Record<string, unknown>): Line[] {
    return subjectLines(data)
  }
</script>

<script lang="ts">
  /**
   * The Price is Right's question: the item, as `AssetStem` draws it, and its icon under
   * it. What to guess about it is the host's ask line; the slider is under the line.
   */
  import { itemIcon } from '../../../lib/items'
  import type { StemProps } from '../props'
  import ItemIcon from '../ItemIcon.svelte'
  import AssetStem from './AssetStem.svelte'

  let props: StemProps = $props()

  const asset = $derived((props.data.subject as { asset?: unknown } | undefined)?.asset)
</script>

<AssetStem {...props} />
{#if itemIcon(asset) !== null}
  <div class="icon"><ItemIcon {asset} /></div>
{/if}

<style>
  .icon {
    display: flex;
    justify-content: center;
    margin: 0.5rem 0 0;
  }
</style>
