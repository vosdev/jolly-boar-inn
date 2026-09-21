<script lang="ts">
  /**
   * Guess the Examine's question: one examine line, the way the game prints it.
   *
   * The `prompt` of a `guess_examine` question *is* the examine text (architecture
   * section 2), so this stem is `TextStem` with one difference. It sets the line as a
   * quotation from the game — the words the chatbox shows when you examine the thing —
   * rather than as a question of ours, because it is not one: "Future web developers."
   * is a clue, and a player should read it as the game's voice, not the host's.
   * The line under it says what to do with it, which the examine itself never does.
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
    <blockquote>{examine}</blockquote>
    <figcaption>What is this the examine of?</figcaption>
  </figure>
{/if}

<style>
  .examine {
    margin: 0 0 1.25rem;
  }

  blockquote {
    margin: 0;
    padding: calc(0.8rem - var(--border-give)) calc(1rem - var(--border-give));
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-raised);
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  figcaption {
    margin: 0.5rem 0 0;
    color: var(--muted);
  }
</style>
