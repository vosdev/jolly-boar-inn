<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  import { lines as textLines } from './TextStem.svelte'

  function quoteOf(data: Record<string, unknown>): string {
    return typeof data.quote === 'string' ? data.quote : ''
  }

  /**
   * What the stem types: the quote, or as `TextStem`. Its prompt is the mode's standing
   * "Who said this?", which the host's ask line already says.
   */
  export function lines(data: Record<string, unknown>): Line[] {
    const quote = quoteOf(data)
    return quote === '' ? textLines(data) : [quote]
  }
</script>

<script lang="ts">
  /**
   * A question about words someone said: the `quote` is set apart the way Guess the
   * Examine sets its line, as the speaker's voice rather than ours. The `prompt` is not
   * drawn; the host's ask line asks.
   *
   * Know Your Content Creator mixes quotes with plain trivia in one round, and a stem is
   * chosen per mode, so a question without a `quote` is drawn as `TextStem` draws it.
   */
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'
  import TextStem from './TextStem.svelte'

  let props: StemProps = $props()

  const quote = $derived(quoteOf(props.data))
</script>

{#if quote !== ''}
  <figure class="quote">
    <blockquote><Typed line={quote} shown={props.shown?.[0]} /></blockquote>
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
