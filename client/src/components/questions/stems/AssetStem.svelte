<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  interface Subject {
    name?: unknown
    asset?: unknown
  }

  function subjectOf(data: Record<string, unknown>): Subject {
    return (data.subject ?? {}) as Subject
  }

  /** What the stem types, line by line: the subject's name. */
  export function lines(data: Record<string, unknown>): Line[] {
    // As in `TextStem`: a payload from a newer schema could leave it out, and nothing is
    // better than `undefined` in a heading.
    const name = subjectOf(data).name
    return typeof name === 'string' && name !== '' ? [name] : []
  }
</script>

<script lang="ts">
  /**
   * A question about one thing: an item or an NPC, named, with its picture once there
   * are pictures.
   *
   * The Price is Right is its first mode, and Drop Table will be the second: both ask
   * about a single subject and let the view below do the asking. It reads `subject` —
   * `{name, asset?}`, the schema's `$defs/subject` — and ignores the rest of `data`.
   *
   * `asset` is `item:<id>` or `npc:<id>`, never a URL (architecture section 2), and there
   * is nothing to resolve it against until the Images milestone ships the renders. Until then
   * the name is the whole stem, which is the rule's own fallback for a missing image rather than a
   * placeholder: the question is answerable from the name, and a grey box would say it is
   * not. The ref still rides on the element so the render has somewhere to go.
   */
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'

  let { data, shown }: StemProps = $props()

  const name = $derived(lines(data)[0])
  const asset = $derived.by(() => {
    const asset = subjectOf(data).asset
    return typeof asset === 'string' ? asset : undefined
  })
</script>

{#if name !== undefined}
  <p class="subject" data-asset={asset}><Typed line={name} shown={shown?.[0]} /></p>
{/if}

<style>
  .subject {
    margin: 0 0 0.3rem;
    font-size: max(1.15rem, 1.45rem * var(--scroll-text, 1));
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
</style>
