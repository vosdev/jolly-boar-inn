<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  /** What the stem types: the answer, one line per entry of a list. */
  export function lines(data: Record<string, unknown>): Line[] {
    const prompt = typeof data.prompt === 'string' ? data.prompt : ''
    return prompt === '' ? [] : prompt.split('\n')
  }
</script>

<script lang="ts">
  /**
   * ScapeRune's answer on the board: the `prompt` is the answer and the buttons hold the
   * questions.
   *
   * One line is set like any question. Several are a list whose order is the answer, so
   * they are numbered, and a screen reader says so.
   */
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'

  let { data, shown }: StemProps = $props()

  const typed = $derived(lines(data))
</script>

{#if typed.length === 1}
  <p class="board"><Typed line={typed[0] ?? ''} shown={shown?.[0]} /></p>
{:else if typed.length > 1}
  <ol class="board">
    {#each typed as line, index (index)}
      <li><Typed {line} shown={shown?.[index]} /></li>
    {/each}
  </ol>
{/if}

<style>
  .board {
    margin: 0 0 1.25rem;
    font-size: 1.35rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  :global(.paper) .board {
    margin: 0;
    font-size: max(1rem, 1.2rem * var(--scroll-text, 1));
    line-height: 1.3;
  }

  ol.board {
    display: inline-block;
    padding-inline-start: 1.5em;
    text-align: start;
  }
</style>
