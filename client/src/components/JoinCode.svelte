<script lang="ts">
  /**
   * What a lobby's sheet holds: a line, the room's code in the large face, and what the code
   * can do beside it, which is reroll with the doors shut and invite once they are open.
   */
  import type { Snippet } from 'svelte'

  let { code, lead, children }: { code: string; lead: string; children: Snippet } = $props()
</script>

<h1 class="sr">Lobby</h1>
<p class="lead">{lead}</p>
<div class="code-row">
  <span class="code" style:--chars={code.length}>{code}</span>
  <span class="actions">{@render children()}</span>
</div>

<style>
  .lead {
    margin: 0;
    font-size: max(0.9rem, 1rem * var(--scroll-text, 1));
    color: var(--scroll-muted);
  }

  /* The code on its own line with the action under it, or in the row's top-right corner
     where the scroll is wide enough not to crowd the code. */
  .code-row {
    position: relative;
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  /* A code is words run together, up to 34 letters. The display face is
     about 1em a letter, so the size shrinks to keep the code on one line, and only a code
     too long even at the floor breaks. It is read aloud across the room, so it is the
     sheet's ink in the large face. */
  .code {
    color: var(--scroll-ink);
    font-family: var(--font-display);
    font-size: clamp(
      0.95rem,
      (100cqi - 4rem) / var(--chars, 12),
      max(1.4rem, 1.8rem * var(--scroll-text, 1))
    );
    letter-spacing: 0.06em;
    overflow-wrap: anywhere;
  }

  @container (min-width: 34rem) {
    .code-row {
      min-height: 44px;
      justify-content: center;
    }

    .code {
      font-size: clamp(
        0.95rem,
        (100cqi - 36rem) / var(--chars, 12),
        max(1.4rem, 1.8rem * var(--scroll-text, 1))
      );
    }

    .code-row .actions {
      position: absolute;
      top: 0;
      right: 0;
    }
  }

  .actions {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.25rem 0.5rem;
  }

  /* On the sheet, so in its inks rather than a panel's. */
  .actions :global(button) {
    --ink: var(--scroll-ink);
    min-height: 44px;
    border-color: var(--scroll-muted);
    background: transparent;
    color: var(--ink);
  }

  .actions :global(.icon) {
    font-size: 1rem;
  }
</style>
