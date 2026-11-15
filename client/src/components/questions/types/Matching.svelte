<script lang="ts">
  /**
   * `matching`: an option onto each field (`MatchingPairs`), or with `bins` each entry
   * sorted into its bin (`MatchingBins`). Both read the shapes
   * `questions/types/matching.py` sends; only the view differs.
   */
  import type { TypeViewProps } from '../props'
  import MatchingBins from './MatchingBins.svelte'
  import MatchingPairs from './MatchingPairs.svelte'

  let props: TypeViewProps = $props()
</script>

{#if props.data.bins === true}
  <MatchingBins {...props} />
{:else}
  <MatchingPairs {...props} />
{/if}
