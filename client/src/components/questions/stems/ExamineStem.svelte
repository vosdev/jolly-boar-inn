<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  /** What the stem types: the examine. What to do with it is the host's ask line. */
  export function lines(data: Record<string, unknown>): Line[] {
    const examine = typeof data.prompt === 'string' ? data.prompt : ''
    return examine === '' ? [] : [examine]
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
   * What to do with it, which the examine itself never says, is the host's ask line in the
   * bubble; the examine sits alone, centred in the scroll's height.
   *
   * It reads `prompt` and nothing else. What the answer was is the buttons' to show at the
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
    <blockquote><Typed line={typed[0] ?? ''} shown={shown?.[0]} /></blockquote>
  </figure>
{/if}

<style>
  .examine {
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
