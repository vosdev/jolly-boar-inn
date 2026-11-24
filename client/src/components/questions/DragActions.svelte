<script lang="ts">
  /**
   * Under a drag answer: start over, and Submit once every place is filled. On a phone
   * Start over is its arrow beside Submit; on a wide stage the two stack, in words.
   */
  let {
    moved,
    ready,
    onrestart,
    onsubmit,
  }: {
    /** Anything moved since the start, so there is something to undo. */
    moved: boolean
    ready: boolean
    onrestart: () => void
    onsubmit: () => void
  } = $props()
</script>

<div class="actions">
  <button
    type="button"
    class="rewind"
    aria-label="Start over"
    title="Start over"
    disabled={!moved}
    onclick={onrestart}
  >
    <span class="arrow" aria-hidden="true">↺</span><span class="word">Start over</span>
  </button>
  <button type="button" class="primary submit" disabled={!ready} onclick={onsubmit}>
    Submit
  </button>
</div>

<style>
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .rewind {
    flex: none;
    width: 56px;
    min-height: 56px;
    font-size: 1.5rem;
  }

  .submit {
    flex: 1;
    min-height: 56px;
  }

  .word {
    display: none;
  }

  @container (min-width: 40rem) {
    .actions {
      flex-direction: column;
      margin-top: 0;
    }

    .rewind {
      width: 100%;
      font-size: 1rem;
    }

    .arrow {
      display: none;
    }

    .word {
      display: inline;
    }
  }
</style>
