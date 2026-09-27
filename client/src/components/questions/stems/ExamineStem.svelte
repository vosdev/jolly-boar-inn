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
  import type { StemProps } from '../props'

  let { data }: StemProps = $props()

  const examine = $derived(typeof data.prompt === 'string' ? data.prompt : '')
</script>

{#if examine !== ''}
  <figure class="examine">
    <figcaption>What is this the examine of?</figcaption>
    <blockquote>{examine}</blockquote>
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
