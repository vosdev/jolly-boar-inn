<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  import { lines as subjectLines } from './AssetStem.svelte'

  const ASK = 'What does it go for on the Grand Exchange?'

  /** What the stem types, line by line: the item's name, then the question. */
  export function lines(data: Record<string, unknown>): Line[] {
    return [...subjectLines(data), ASK]
  }
</script>

<script lang="ts">
  /**
   * The Price is Right's question: the item, as `AssetStem` draws it, what to guess about
   * it, and the item's icon under both. All are on the scroll; the four prices are the
   * buttons under the line.
   */
  import { itemIcon } from '../../../lib/items'
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'
  import ItemIcon from '../ItemIcon.svelte'
  import AssetStem from './AssetStem.svelte'

  let props: StemProps = $props()

  const named = $derived(subjectLines(props.data).length)
  const asset = $derived((props.data.subject as { asset?: unknown } | undefined)?.asset)
</script>

<AssetStem {...props} />
<p class="ask"><Typed line={ASK} shown={props.shown?.[named]} /></p>
{#if itemIcon(asset) !== null}
  <div class="icon"><ItemIcon {asset} /></div>
{/if}

<style>
  .icon {
    display: flex;
    justify-content: center;
    margin: 0.5rem 0 0;
  }

  .ask {
    margin: 0;
    font-size: max(0.95rem, 1.05rem * var(--scroll-text, 1));
    color: var(--muted);
  }
</style>
