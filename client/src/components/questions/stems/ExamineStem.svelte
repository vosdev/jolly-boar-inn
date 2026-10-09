<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  const ASK = 'What is this the examine of?'

  /** What the stem types, line by line: what to do with it, then the examine. */
  export function lines(data: Record<string, unknown>): Line[] {
    const examine = typeof data.prompt === 'string' ? data.prompt : ''
    return examine === '' ? [] : [ASK, examine]
  }
</script>

<script lang="ts">
  /**
   * Guess the Examine's question: one examine line, the way the game prints it.
   *
   * The `prompt` of a `guess_examine` question *is* the examine text (architecture
   * section 2), so this stem is `TextStem` with one difference. It sets the line as a
   * quotation from the game — the words the chatbox shows when you examine the thing —
   * rather than as a question of ours, because it is not one: "Future web developers."
   * is a clue, and a player should read it as the game's voice, not the host's.
   * The line above it says what to do with it, which the examine itself never does, and
 * the examine sits centred in whatever height of the scroll is left.
   *
   * It reads `prompt` and nothing else. What the answer was is the list's to show at the
   * reveal: the stem stays the same clue before and after, so the eye has one place to
   * look for the verdict.
   */
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'

  let { data, shown }: StemProps = $props()

  const typed = $derived(lines(data))
</script>

{#if typed.length > 0}
  <figure class="examine">
    <figcaption><Typed line={ASK} shown={shown?.[0]} /></figcaption>
    <blockquote><Typed line={typed[1] ?? ''} shown={shown?.[1]} /></blockquote>
  </figure>
{/if}

<style>
  .examine {
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
