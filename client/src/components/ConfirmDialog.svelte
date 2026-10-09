<script lang="ts">
  /**
   * Asks before something that cannot be taken back, in place of `window.confirm`: some
   * in-app browsers, the ones a link tapped in a chat app opens, suppress `confirm` and
   * answer no, and the button behind it then silently does nothing.
   *
   * A native modal `<dialog>`, so the page behind it is inert without a focus trap of our
   * own. Shown for as long as it is mounted: the caller renders it while a question is
   * pending and drops it on either answer. Focus starts on Cancel, so a stray Enter or a
   * second tap in the same spot keeps things as they were.
   */
  import { onMount } from 'svelte'

  let {
    message,
    confirmLabel,
    onConfirm,
    onCancel,
    also = null,
  }: {
    message: string
    /** What the yes button says: the action, not "OK". */
    confirmLabel: string
    onConfirm: () => void
    onCancel: () => void
    /** A second way to say yes, as a plain button after the first. */
    also?: { label: string; act: () => void } | null
  } = $props()

  const id = $props.id()
  let dialog = $state<HTMLDialogElement | null>(null)
  let cancel = $state<HTMLButtonElement | null>(null)

  onMount(() => {
    dialog?.showModal()
    cancel?.focus()
    return () => dialog?.close()
  })

  function escape(event: Event): void {
    event.preventDefault()
    onCancel()
  }
</script>

<dialog bind:this={dialog} class="confirm" aria-labelledby={id} oncancel={escape}>
  <p {id}>{message}</p>
  <div class="row">
    <button type="button" class="primary" onclick={onConfirm}>{confirmLabel}</button>
    {#if also !== null}
      <button type="button" onclick={also.act}>{also.label}</button>
    {/if}
    <button type="button" bind:this={cancel} onclick={onCancel}>Cancel</button>
  </div>
</dialog>

<style>
  .confirm {
    width: min(26rem, 100% - 2rem);
    padding: 1.25rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .confirm::backdrop {
    background: var(--scrim);
  }

  .confirm p {
    margin: 0 0 1rem;
    overflow-wrap: anywhere;
  }

  .confirm button {
    min-height: 44px;
  }
</style>
