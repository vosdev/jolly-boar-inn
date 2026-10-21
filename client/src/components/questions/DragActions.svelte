<script lang="ts">
  /** Under a drag answer: start over, and Submit once every place is filled. */
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
    onclick={onrestart}>↺</button
  >
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
</style>
