<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  import { phrasingFor } from '../types/moreLess'

  /** What the stem types: its one question, the direction a word of its own. */
  export function lines(data: Record<string, unknown>): Line[] {
    const direction = data.direction === 'less' ? 'less' : 'more'
    const phrasing = phrasingFor(typeof data.metric === 'string' ? data.metric : '')
    const source = phrasing.source ? ` ${phrasing.source}` : ''
    return [
      [
        { text: `Which ${phrasing.verb} ` },
        { text: direction, class: `word ${direction}` },
        { text: `${source}?` },
      ],
    ]
  }
</script>

<script lang="ts">
  /**
   * `more_less`'s question: "Which costs MORE on the Grand Exchange?", on the scroll. The
   * two names it asks about are the buttons under the line.
   *
   * The direction is the word that flips the answer, so it is set apart by shape: capitals
   * and weight in the scroll's own ink. `--more` and `--less` are measured against the
   * panel, not parchment, and so stay off the sheet.
   */
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'

  let { data, shown }: StemProps = $props()

  const ask = $derived(lines(data)[0] ?? '')
</script>

<p class="ask"><Typed line={ask} shown={shown?.[0]} /></p>

<style>
  .ask {
    margin: 0;
    font-size: max(1rem, 1.2rem * var(--scroll-text, 1));
    font-weight: 600;
    line-height: 1.3;
  }

  /* A run of `Typed`'s, so outside this component's scope. */
  .ask :global(.word) {
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
