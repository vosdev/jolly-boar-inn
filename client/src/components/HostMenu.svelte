<script lang="ts">
  /**
   * The admin's Host menu in the room's top bar (section 5 of ideas/design.md): what the
   * phase lets the host do, behind one control beside the player's own. The room decides
   * the list (`lib/hostMenu.ts`); an action that asks first opens the room's own dialog.
   *
   * It closes as the settings menu does: Escape, a tap outside or tabbing out, and focus
   * goes back to the control unless the tap gave it elsewhere. Picking an action closes
   * it too, so a dialog the action opens is the one thing on top.
   */
  import { tick } from 'svelte'

  import type { HostAction } from '../lib/hostMenu'

  let { actions }: { actions: HostAction[] } = $props()

  let open = $state(false)
  let root = $state<HTMLElement | null>(null)
  let control = $state<HTMLButtonElement | null>(null)
  let panel = $state<HTMLElement | null>(null)

  async function openMenu(): Promise<void> {
    open = true
    await tick()
    panel?.querySelector('button')?.focus()
  }

  function pick(action: HostAction): void {
    open = false
    control?.focus()
    action.run()
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (!open) return
    const target = event.target
    if (target instanceof Node && root?.contains(target)) return
    open = false
    setTimeout(() => {
      if (document.activeElement === null || document.activeElement === document.body) {
        control?.focus()
      }
    })
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open) return
    open = false
    control?.focus()
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget
    if (open && next instanceof Node && !root?.contains(next)) open = false
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

<div class="menu" bind:this={root} onfocusout={onFocusOut}>
  <button
    type="button"
    class="control host"
    aria-expanded={open}
    aria-controls="host-menu"
    bind:this={control}
    onclick={() => (open ? (open = false) : openMenu())}
  >
    Host
    <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2 4l4 4 4-4" />
    </svg>
  </button>
  {#if open}
    <div class="panel" id="host-menu" role="group" aria-label="Host" bind:this={panel}>
      {#each actions as action (action.label)}
        <button type="button" onclick={() => pick(action)}>{action.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Opens under its own control on a wide bar; on a phone it anchors to the bar's column
     (TopBar's `.inner`) like the settings menu, so it has the whole width to open in. */
  .menu {
    position: relative;
    display: flex;
    flex: none;
  }

  @media (max-width: 40rem) {
    .menu {
      position: static;
    }
  }

  /* Outlined, unlike the bar's other controls: TopBar's rule for those would win a tie. */
  .menu .control.host {
    padding-inline: calc(0.65rem - var(--border-give));
    border-color: currentColor;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .menu .chevron {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .panel {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    z-index: 1;
    display: grid;
    gap: 0.5rem;
    width: max-content;
    max-width: calc(100vw - 2rem);
    padding: 0.75rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    color: var(--ink);
  }

  .panel button {
    text-align: left;
  }
</style>
