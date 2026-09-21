<script lang="ts">
  /**
   * The identity chip and its popover, in the top bar's identity slot (section 4).
   *
   * The chip means two different things in two places, and both are right:
   *
   * - **Outside a room** (Home, Create, Join) it is the local profile — the name this
   *   browser will bring to the next room — and "Set your name" until there is one.
   * - **Inside a room** it is the live `PlayerView` the server sent, which is who the
   *   room actually sees. A join that had to turn the suffix over (`AFKFisher42` was
   *   taken, so you are `AFKFisher517`) shows here, not in the profile.
   *
   * The popover edits the profile in both. Changing the live player's name needs a
   * websocket message that does not exist yet — `set_profile`, which is D4's — so inside
   * a room it says who you are there and what you will be next time, rather than
   * offering a rename it cannot send.
   */
  import { nameProblem } from '../lib/names'
  import { profile, saveProfile } from '../lib/profile'
  import NameField from './NameField.svelte'

  let {
    liveName = null,
  }: {
    /** Your name in the room you are in, or null outside one. */
    liveName?: string | null
  } = $props()

  let open = $state(false)
  let draft = $state('')
  let saved = $state(false)
  let root = $state<HTMLElement | null>(null)

  const shown = $derived(liveName ?? $profile?.name ?? null)
  const ok = $derived(nameProblem(draft) === null && draft.trim() !== $profile?.name)

  function toggle(): void {
    open = !open
    if (open) {
      draft = $profile?.name ?? ''
      saved = false
    }
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (!ok) return
    saveProfile(draft)
    draft = draft.trim()
    saved = true
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (!open) return
    const target = event.target
    if (target instanceof Node && root?.contains(target)) return
    open = false
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') open = false
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

<div class="identity" bind:this={root}>
  <button
    type="button"
    class="control chip"
    class:unset={shown === null}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={shown === null ? 'Set your name' : `You are ${shown}. Change your name`}
    onclick={toggle}
  >
    <!-- The placeholder head: D4 swaps in the real ones, drawn at this size. -->
    <svg class="head" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle class="head-face" cx="12" cy="12" r="11" />
      <circle cx="12" cy="9.5" r="3.5" fill="currentColor" />
      <path d="M5 21a7 7 0 0 1 14 0z" fill="currentColor" />
    </svg>
    <!-- Always shown, at every width (section 4): on a phone it ellipsises rather than
         collapsing to the head, because who you are is the one thing the bar is for. -->
    <span class="chip-name">{shown ?? 'Set your name'}</span>
  </button>

  {#if open}
    <div class="popover" role="dialog" aria-label="Your name">
      {#if liveName !== null}
        <p class="here">In this room you are <strong>{liveName}</strong>.</p>
      {/if}
      <form onsubmit={submit}>
        <NameField
          id="profile-name"
          bind:value={draft}
          label={liveName === null ? 'Your name' : 'Your name in the next room'}
          hint={liveName === null
            ? 'Filled in whenever you create or join a room.'
            : 'Renaming inside a room is coming. This is the name you bring next time.'}
        />
        <div class="row">
          <button class="primary small" type="submit" disabled={!ok}>Save</button>
          {#if saved}<span class="note" role="status">Saved.</span>{/if}
        </div>
      </form>
    </div>
  {/if}
</div>

<style>
  /* Deliberately not positioned: the popover anchors to the top bar's column instead
     (TopBar's `.inner`), because the chip is no longer the rightmost control and a
     20rem popover pinned to its edge would run off the left of a phone. */
  .identity {
    display: flex;
    min-width: 0;
  }

  /* As wide as a 24-character name wants on a desktop; on a phone, as wide as the bar
     leaves once the sign, sound and theme have theirs. */
  .chip {
    min-width: 0;
    max-width: 100%;
  }

  .chip.unset .chip-name {
    color: var(--muted);
  }

  .chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  /* Wins over the 20px every other control glyph gets: a face wants the extra pixels,
     and D4's real heads are drawn at this size. */
  .chip .head {
    width: 24px;
    height: 24px;
  }

  .head-face {
    fill: var(--panel-raised);
    stroke: currentColor;
  }

  .popover {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    /* Pinned to the bar column's right edge, and never wider than the screen it opens
       on: at 320px that is the whole width less the page gutter. */
    width: min(20rem, 100vw - 2rem);
    padding: 1rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .here {
    margin: 0 0 0.75rem;
    overflow-wrap: anywhere;
  }
</style>
