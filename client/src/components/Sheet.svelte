<script lang="ts">
  /**
   * A native modal `<dialog>` that rises from the bottom of a phone, or fills it with
   * `full`, and sits in the middle of a wider screen. Shown for as long as it is mounted,
   * like `ConfirmDialog`; Escape asks the caller to close it rather than closing it here.
   */
  import { onMount, type Snippet } from 'svelte'

  let {
    labelledby = undefined,
    label = undefined,
    full = false,
    onclose,
    children,
  }: {
    /** The id of the heading inside that names it, or else `label`. */
    labelledby?: string
    label?: string
    full?: boolean
    onclose: () => void
    children: Snippet
  } = $props()

  let dialog = $state<HTMLDialogElement | null>(null)

  onMount(() => {
    dialog?.showModal()
    return () => dialog?.close()
  })

  function escape(event: Event): void {
    event.preventDefault()
    onclose()
  }
</script>

<dialog bind:this={dialog} class="sheet" class:full aria-labelledby={labelledby} aria-label={label} oncancel={escape}>
  {@render children()}
</dialog>

<style>
  .sheet {
    width: min(30rem, 100% - 2rem);
    max-height: calc(100dvh - 2rem);
    padding: 1.25rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .sheet::backdrop {
    background: var(--scrim);
  }

  @media (max-width: 49.99rem) {
    .sheet {
      width: 100%;
      max-width: none;
      margin: auto 0 0;
      border-width: var(--border-width) 0 0;
      border-radius: 14px 14px 0 0;
      padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
    }

    .sheet.full {
      height: 100dvh;
      max-height: none;
      margin: 0;
      border: none;
      border-radius: 0;
    }
  }
</style>
