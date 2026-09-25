<script lang="ts">
  /**
   * A typed or picked answer once it is settled: "It was X", then ours beside it.
   *
   * It stands in for the form from the moment we answer, or from the start for somebody
   * who cannot, and it is the whole reveal for a view with no buttons. What it says is
   * worked out by the view — the name of an entry, a number with its unit — so this only
   * has the look, which D-tasks restyle in one place.
   */
  let {
    answer,
    also = [],
    yours,
    yoursLabel = 'Your answer',
    yoursAfter = '',
  }: {
    /** The right answer, written out; null while it is not out. */
    answer: string | null
    /** Other answers that counted, beside `answer`. */
    also?: readonly string[]
    /** Ours, written out; null if we did not answer. */
    yours: string | null
    yoursLabel?: string
    /** Straight after ours, e.g. how far off it was. */
    yoursAfter?: string
  } = $props()
</script>

<div class="settled">
  {#if answer !== null}
    <p class="answer">It was <strong>{answer}</strong>.</p>
    {#if also.length > 0}
      <p class="note">Also accepted: {also.join(', ')}</p>
    {/if}
  {/if}
  {#if yours !== null}
    <p class="picked">{yoursLabel}: <strong>{yours}</strong>{yoursAfter}</p>
  {/if}
</div>

<style>
  .settled p {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  .settled p.note {
    font-size: inherit;
  }

  /* Your answer, held while the room answers and receding beside the real one after:
     the verdict is the points slot's, so this card never turns green or red. */
  .picked {
    color: var(--muted);
  }
</style>
