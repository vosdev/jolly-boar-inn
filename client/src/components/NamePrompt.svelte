<script lang="ts">
  /**
   * The blocking popup on Create for a browser with no profile (section 5.1). The host's
   * name is read aloud and anchors the room, so a beat to choose it is well spent. Join
   * used this too until `set_profile` existed; since D4 it is join-first (5.1.1 option B)
   * and the rename happens in the lobby instead.
   *
   * Pre-filled with a generated name and with focus on the button, so the whole question
   * is one tap: a phone that opened a party link should not have its keyboard thrown up
   * over the answer. Anybody who wants their own name taps the field.
   *
   * A native modal `<dialog>`: the rest of the page is inert behind it, which is what
   * "blocking" means, without a focus trap of our own. Escape and Back both go home —
   * the only way past this is to have a name.
   */
  import { onMount } from 'svelte'

  import { generateName, nameProblem } from '../lib/names'
  import { saveProfile } from '../lib/profile'
  import NameField from './NameField.svelte'

  let {
    avoid = '',
    action,
    onBack,
  }: {
    /** The room code on Join, so the name offered is never the room's own. */
    avoid?: string
    /** What the button says the name is for: "Create room", "Join". */
    action: string
    onBack: () => void
  } = $props()

  let dialog = $state<HTMLDialogElement | null>(null)
  let confirm = $state<HTMLButtonElement | null>(null)
  // svelte-ignore state_referenced_locally
  let name = $state(generateName(avoid))

  const ok = $derived(nameProblem(name) === null)

  onMount(() => {
    dialog?.showModal()
    confirm?.focus()
  })

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (!ok) return
    // Saving is the whole of it: the screen under this one is watching the profile and
    // carries on the moment there is one.
    saveProfile(name)
    dialog?.close()
  }

  function cancel(event: Event): void {
    event.preventDefault()
    onBack()
  }
</script>

<dialog bind:this={dialog} class="prompt" aria-labelledby="name-prompt-title" oncancel={cancel}>
  <form onsubmit={submit}>
    <h2 id="name-prompt-title">What do we call you?</h2>
    <p class="note">
      Here's one to be going on with. Keep it, roll another, or type your own — this browser
      remembers it for next time.
    </p>
    <NameField id="prompt-name" bind:value={name} {avoid} />
    <div class="row">
      <button class="primary" type="submit" disabled={!ok} bind:this={confirm}>
        {action} as {name.trim() || '…'}
      </button>
      <button type="button" onclick={onBack}>Back</button>
    </div>
  </form>
</dialog>

<style>
  .prompt {
    width: min(26rem, 100% - 2rem);
    padding: 1.25rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  /* The fallback is for browsers from before ::backdrop inherited custom properties. */
  .prompt::backdrop {
    background: var(--scrim, rgb(0 0 0 / 0.5));
  }

  .prompt .note {
    margin-top: 0;
  }

  /* A long generated name in the button should wrap, not push the dialog sideways. */
  .prompt button.primary {
    overflow-wrap: anywhere;
    text-align: left;
  }
</style>
