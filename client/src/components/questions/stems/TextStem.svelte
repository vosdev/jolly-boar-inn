<script lang="ts">
  /**
   * A question that is a sentence: the `prompt` every type but `more_less` carries.
   *
   * The plainest stem, and the one a mode falls back on until it has a reason to show
   * more — Bestiary's "What is the combat level of a Black demon?" needs nothing else.
   * It reads `prompt` and ignores the rest of `data`, which belongs to the type view
   * below it.
   *
   * It sets the prompt the way `more_less` sets its own question line, so a game that
   * moves from one round to the next does not change its handwriting between them.
   */
  import type { StemProps } from '../props'

  let { data }: StemProps = $props()

  // A pack from a newer schema could leave it out; an empty line is better than
  // `undefined` printed above the buttons.
  const prompt = $derived(typeof data.prompt === 'string' ? data.prompt : '')
</script>

{#if prompt !== ''}
  <p class="ask">{prompt}</p>
{/if}

<style>
  .ask {
    font-size: 1.35rem;
    font-weight: 600;
    margin: 0 0 1.25rem;
    overflow-wrap: anywhere;
  }
</style>
