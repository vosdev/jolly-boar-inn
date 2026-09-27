<script lang="ts">
  /**
   * `more_less`'s question: "Which costs MORE on the Grand Exchange?", on the scroll. The
   * two names it asks about are the buttons under the line.
   *
   * The direction is the word that flips the answer, so it is set apart by shape: capitals
   * and weight in the scroll's own ink. `--more` and `--less` are measured against the
   * panel, not parchment, and so stay off the sheet.
   */
  import type { StemProps } from '../props'
  import { phrasingFor } from '../types/moreLess'

  let { data }: StemProps = $props()

  const direction = $derived(data.direction === 'less' ? 'less' : 'more')
  const phrasing = $derived(phrasingFor(typeof data.metric === 'string' ? data.metric : ''))
  // Built here rather than in the markup, where Svelte would trim the space before it.
  const source = $derived(phrasing.source ? ` ${phrasing.source}` : '')
</script>

<p class="ask">
  Which {phrasing.verb} <span class="word {direction}">{direction}</span>{source}?
</p>

<style>
  .ask {
    margin: 0;
    font-size: max(1rem, 1.2rem * var(--scroll-text, 1));
    font-weight: 600;
    line-height: 1.3;
  }

  .word {
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
