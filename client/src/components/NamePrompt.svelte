<script lang="ts">
  /**
   * The question a browser with no profile answers before its first room (section 6 of
   * ideas/design.md): a name and a head, pre-filled so that one tap on the button is a
   * valid answer, and nothing to dismiss it with. Escape is swallowed and there is no
   * cancel, because a player who got past this screen without a name is how the lobby
   * filled with `Cow31337Killer42`.
   *
   * A native modal `<dialog>`, like `ConfirmDialog`, so the page and the top bar behind
   * it are inert and dimmed without a focus trap of our own. Shown for as long as it is
   * mounted; the caller drops it once it has the answer. The name is selected on open,
   * so typing replaces the generated one.
   *
   * `cancel` is not enough to keep it: a browser only lets a page refuse Escape once the
   * visitor has interacted with it, and a visitor who has just tapped a link has not. So
   * a close the prompt did not ask for opens it again.
   */
  import { onMount, untrack } from 'svelte'

  import { randomHead } from '../lib/heads'
  import { generateName, nameProblem } from '../lib/names'
  import Die from './Die.svelte'
  import Head from './Head.svelte'
  import NameField from './NameField.svelte'

  let {
    action,
    avoid = '',
    onConfirm,
  }: {
    /** What the button says: what happens next, not "Save". */
    action: string
    /** The room code, when there is one: a generated name never matches it. */
    avoid?: string
    onConfirm: (name: string, head: number) => void
  } = $props()

  const id = $props.id()
  let dialog = $state<HTMLDialogElement | null>(null)
  // Rolled once: a later change of `avoid` must not swap the name under somebody typing.
  let name = $state(untrack(() => generateName(avoid)))
  let head = $state(randomHead())

  const ok = $derived(nameProblem(name) === null)

  let leaving = false

  function show(): void {
    dialog?.showModal()
    const field = dialog?.querySelector('input')
    field?.focus()
    field?.select()
  }

  onMount(() => {
    show()
    return () => {
      leaving = true
      dialog?.close()
    }
  })

  function reopen(): void {
    if (!leaving && dialog?.isConnected && !dialog.open) show()
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (ok) onConfirm(name.trim(), head)
  }
</script>

<dialog
  bind:this={dialog}
  class="prompt"
  aria-labelledby={id}
  oncancel={(event) => event.preventDefault()}
  onclose={reopen}
>
  <h2 {id}>Pick your name</h2>
  <div class="face">
    <Head {head} size={48} />
    <button type="button" class="small reroll-head" onclick={() => (head = randomHead([], head))}>
      <Die /> New head
    </button>
  </div>
  <form onsubmit={submit}>
    <NameField
      id="{id}-name"
      bind:value={name}
      {avoid}
      hint="The others see this. You can change it any time from the top bar."
    />
    <button class="primary" type="submit" disabled={!ok}>{action}</button>
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

  .prompt::backdrop {
    background: var(--scrim);
  }

  h2 {
    margin: 0 0 1rem;
    font-size: 1.15rem;
  }

  .face {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .reroll-head {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .prompt button[type='submit'] {
    min-height: 44px;
    margin-top: 1rem;
  }
</style>
