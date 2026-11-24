<script lang="ts">
  /**
   * How many game modes to pick at random, and whether to keep them a surprise. A native
   * modal `<dialog>`, like `ConfirmDialog`, shown for as long as it is mounted.
   */
  import { onMount } from 'svelte'

  import Stepper from './Stepper.svelte'

  let {
    count,
    max,
    surprise,
    canHide,
    onPick,
    onCancel,
  }: {
    count: number
    max: number
    surprise: boolean
    /** The room hides its rounds, so these can be hidden too. */
    canHide: boolean
    onPick: (count: number, surprise: boolean) => void
    onCancel: () => void
  } = $props()

  const id = $props.id()
  let dialog = $state<HTMLDialogElement | null>(null)
  // Seeded once from the props: the dialog edits its own copy until Pick.
  // svelte-ignore state_referenced_locally
  let howMany = $state(Math.min(count, max))
  // svelte-ignore state_referenced_locally
  let secret = $state(surprise)

  onMount(() => {
    dialog?.showModal()
    return () => dialog?.close()
  })

  function escape(event: Event): void {
    event.preventDefault()
    onCancel()
  }
</script>

<dialog bind:this={dialog} class="pick" aria-labelledby={id} oncancel={escape}>
  <h2 {id}>Pick for me</h2>
  <Stepper
    label="How many game modes?"
    noun="game modes"
    value={howMany}
    min={1}
    {max}
    onchange={(value) => (howMany = value)}
  />
  {#if canHide}
    <label class="secret">
      <input type="checkbox" bind:checked={secret} />
      Keep them a surprise
    </label>
    <p class="note">Nobody sees the rounds — not even you — until each one starts.</p>
  {/if}
  <div class="row">
    <button type="button" class="primary" onclick={() => onPick(howMany, canHide && secret)}>
      Pick
    </button>
    <button type="button" onclick={onCancel}>Cancel</button>
  </div>
</dialog>

<style>
  .pick {
    width: min(26rem, 100% - 2rem);
    padding: 1.25rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .pick::backdrop {
    background: var(--scrim);
  }

  .pick h2 {
    margin: 0 0 1rem;
  }

  .secret {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    min-height: 44px;
  }

  .note {
    margin: 0 0 1rem;
  }

  .pick button {
    min-height: 44px;
  }
</style>
