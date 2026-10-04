<script lang="ts">
  /**
   * A question about words someone said: the `prompt` asks, and the `quote` is set apart
   * the way Guess the Examine sets its line, as the speaker's voice rather than ours.
   *
   * Know Your Content Creator mixes quotes with plain trivia in one round, and a stem is
   * chosen per mode, so a question without a `quote` is drawn as `TextStem` draws it.
   */
  import type { StemProps } from '../props'
  import TextStem from './TextStem.svelte'

  let props: StemProps = $props()

  const quote = $derived(typeof props.data.quote === 'string' ? props.data.quote : '')
  const prompt = $derived(typeof props.data.prompt === 'string' ? props.data.prompt : '')
</script>

{#if quote !== ''}
  <figure class="quote">
    <figcaption>{prompt}</figcaption>
    <blockquote>{quote}</blockquote>
  </figure>
{:else}
  <TextStem {...props} />
{/if}

<style>
  .quote {
    flex: 1;
    display: flex;
    flex-direction: column;
    margin: 0;
  }

  figcaption {
    margin: 0;
    font-size: max(0.85rem, 0.95rem * var(--scroll-text, 1));
    color: var(--muted);
  }

  blockquote {
    margin: auto 0;
    padding-block: 0.35rem;
    font-size: max(1.05rem, 1.3rem * var(--scroll-text, 1));
    font-style: italic;
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
    overflow-wrap: anywhere;
  }
</style>
