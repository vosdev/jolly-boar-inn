<script lang="ts">
  /**
   * A typed answer's form: a label, the box beside Submit, and an optional line under them.
   *
   * The box is the caller's, passed as `children`, because what it takes is the question's
   * — a spelling, a number the way the game writes one — and so are its attributes. What
   * is shared is the shape around it: the row, the 56px thumb targets (D8), and a Submit
   * that only the form's own `onsubmit` answers through, so Enter and a tap do the same.
   */
  import type { Snippet } from 'svelte'

  let {
    id,
    label,
    ready,
    onsubmit,
    children,
    after,
  }: {
    /** The box's id, which the label names. */
    id: string
    label: string
    /** Whether Submit is live: the box holds something that could be sent. */
    ready: boolean
    onsubmit: () => void
    /** The box. */
    children: Snippet
    /** Under the row: a word about what was typed. */
    after?: Snippet
  } = $props()
</script>

<form
  class="answer"
  onsubmit={(event) => {
    event.preventDefault()
    onsubmit()
  }}
>
  <label for={id} class="label">{label}</label>
  <div class="row">
    {@render children()}
    <button type="submit" class="primary" disabled={!ready}>Submit</button>
  </div>
  {@render after?.()}
</form>

<style>
  .answer {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .label {
    color: var(--muted);
  }

  .row {
    display: flex;
    gap: 0.6rem;
  }

  /* The box comes from the caller's markup, so it carries the caller's scope, not ours. */
  .row > :global(input) {
    flex: 1;
    min-width: 0;
    font-size: 1.1rem;
  }

  /* Thumb targets (D8): the box and its button are as tall as an answer button. */
  .row > :global(input),
  .row button {
    min-height: 56px;
  }
</style>
