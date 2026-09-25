<script lang="ts">
  /**
   * The room's last refusal, in the player's words, until they dismiss it or the next
   * question clears it. Nothing when there is none.
   */
  import { errorText } from '../lib/errors'
  import { lastError } from '../lib/stores'
</script>

{#if $lastError !== null}
  <div class="banner bad">
    {errorText($lastError)}
    <button type="button" class="link" onclick={() => lastError.set(null)}>dismiss</button>
  </div>
{/if}
