<script lang="ts">
  /**
   * The words of one line of the clue scroll, typed in up to `shown` letters
   * (`lib/typing.svelte.ts`). The line's element is its stem's, so the stem's styles reach it.
   *
   * The typing is a mask, not a mutation: the whole line is in the DOM from the first
   * frame, laid out at its full height with the untyped letters invisible, so the scroll
   * never grows as it types and a screen reader reads the line once, whole.
   */
  import { partsOf, type Line, type Part } from '../../lib/typing.svelte'

  let {
    line,
    shown = undefined,
  }: {
    line: Line
    /** Letters typed so far; undefined, or all of them, shows the line whole. */
    shown?: number
  } = $props()

  const parts = $derived(partsOf(line))
  const letters = $derived(parts.map((part) => [...part.text]))
  const total = $derived(letters.reduce((sum, part) => sum + part.length, 0))

  /** The runs typed so far and the runs still to come, split `shown` letters in. */
  const split = $derived.by(() => {
    const typed: Part[] = []
    const untyped: Part[] = []
    let left = shown ?? total
    parts.forEach((part, i) => {
      const chars = letters[i] ?? []
      const here = Math.max(0, Math.min(chars.length, left))
      left -= here
      if (here > 0) typed.push({ ...part, text: chars.slice(0, here).join('') })
      if (here < chars.length) untyped.push({ ...part, text: chars.slice(here).join('') })
    })
    return { typed, untyped }
  })
</script>

{#snippet runs(list: Part[])}{#each list as part, i (i)}{#if part.class}<span class={part.class}
        >{part.text}</span
      >{:else}{part.text}{/if}{/each}{/snippet}

{#if shown !== undefined && shown < total}<span class="sr">{@render runs(parts)}</span><span
    aria-hidden="true"
    >{@render runs(split.typed)}<span class="untyped">{@render runs(split.untyped)}</span></span
  >{:else}{@render runs(parts)}{/if}

<style>
  /* Laid out and invisible: the line holds its full height while it types. */
  .untyped {
    visibility: hidden;
  }
</style>
