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
   * The Price is Right's question: the item, as `AssetStem` draws it, and what to guess
   * about it. Both are on the scroll; the four prices are the buttons under the line.
   */
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'
  import AssetStem from './AssetStem.svelte'

  let props: StemProps = $props()

  const named = $derived(subjectLines(props.data).length)
</script>

<AssetStem {...props} />
<p class="ask"><Typed line={ASK} shown={props.shown?.[named]} /></p>

<style>
  .ask {
    margin: 0;
    font-size: max(0.95rem, 1.05rem * var(--scroll-text, 1));
    color: var(--muted);
  }
</style>
