<script lang="ts">
  /**
   * The top bar's one control and its menu (section 5 of ideas/design.md): who you are,
   * the sound switches and the theme, behind a single thumb target.
   *
   * The control shows the head, the name and the current theme's emblem. The name is the
   * one part that shrinks: on a phone it ellipsises rather than collapsing to the head,
   * because who you are is the one thing the bar is for.
   *
   * **You** means two different things in two places, and both are right:
   *
   * - **Outside a room** (Home, Create, Join) it is the local profile — the name and head
   *   this browser will bring to the next room — and "Set your name" until there is one.
   * - **Inside a room** it is the live `PlayerView` the server sent, which is who the
   *   room actually sees. A join that had to turn the suffix over (`AFKFisher42` was
   *   taken, so you are `AFKFisher517`) shows here, not in the profile.
   *
   * The section edits whichever one the control is showing. Both the name and the head
   * are drafts until Save: the die rolls a new face into the menu only, and a player
   * who rolls a few and closes it keeps the one they had. Outside a room Save writes the
   * profile. Inside one it is a single `set_profile` on the room's socket: the
   * change is the room's to accept, so nothing is saved until the `room_updated` that
   * carries it comes back, and a name somebody else in the room already has is answered
   * under the field, with the old name still in place. What the room accepts becomes the
   * profile too, so the next room starts from it. A change the room never answers is
   * given up on: any `welcome` or `error` after the send, leaving the room, or
   * `PENDING_MS` with no word, which says so. This component stays mounted with the menu
   * shut, so a change the room accepts after it closes still reaches the profile.
   *
   * A player who joined first and never chose a name (section 6) is nudged here, once:
   * the control pulses and says who they are and that a tap changes it. It stays for as
   * long as the lobby does, until they open the menu or dismiss it.
   *
   * The menu is a non-modal dialog. Escape, a tap outside, or tabbing out of it closes
   * it; Escape hands focus back to the control, and so does a tap outside that landed on
   * nothing focusable, so a tap on an answer button keeps its focus.
   */
  import { tick } from 'svelte'

  import { headOf, randomHead } from '../lib/heads'
  import { nameProblem } from '../lib/names'
  import { nudge, profile, saveProfile } from '../lib/profile'
  import type { PlayerView } from '../lib/protocol'
  import { players, profileError, requestsSettled, room, roomSend } from '../lib/stores'
  import { getTheme, setTheme, THEME_LABELS, type Theme } from '../lib/theme'
  import Die from './Die.svelte'
  import Emblem from './Emblem.svelte'
  import Head from './Head.svelte'
  import NameField from './NameField.svelte'
  import SoundSettings from './SoundSettings.svelte'
  import ThemeChoices from './ThemeChoices.svelte'

  /** How long a `set_profile` may go unanswered before the popover stops waiting. */
  const PENDING_MS = 5_000

  let {
    live = null,
  }: {
    /** You, in the room you are in; null outside one. */
    live?: PlayerView | null
  } = $props()

  let open = $state(false)
  let draft = $state('')
  /** The head the menu shows: rolled here, and nobody else's business until Save. */
  let draftHead = $state<number | null>(null)
  let saved = $state<string | null>(null)
  let root = $state<HTMLElement | null>(null)
  let control = $state<HTMLButtonElement | null>(null)
  let panel = $state<HTMLElement | null>(null)
  let theme = $state<Theme>(getTheme())
  /** What was sent in `set_profile` and has not come back in a `room_updated` yet. */
  let pending = $state<{ name?: string; head?: number } | null>(null)
  /** `$requestsSettled` when it was sent: once that moves, the reply is not coming. */
  let sentAt = 0
  let unanswered = $state(false)

  const inRoom = $derived(live !== null)
  const shownName = $derived(live?.display_name ?? $profile?.name ?? null)
  const shownHead = $derived(live !== null ? headOf(live) : ($profile?.head ?? null))
  const currentName = $derived(live?.display_name ?? $profile?.name ?? '')
  const nameChanged = $derived(draft.trim() !== currentName)
  const headChanged = $derived(draftHead !== null && draftHead !== shownHead)
  const ok = $derived(nameProblem(draft) === null && (nameChanged || headChanged))
  const nudging = $derived(
    live !== null && $nudge !== null && $nudge === $room?.code && $room?.status === 'lobby',
  )
  /** The room's refusal, in words for the person holding the phone. */
  const refusal = $derived(
    $profileError === null
      ? null
      : $profileError.code === 'name_taken'
        ? 'Somebody in this room already has that name.'
        : $profileError.message,
  )
  /** Everybody else's face, so a re-roll leans toward one nobody is wearing. */
  const taken = $derived(
    live === null ? [] : $players.filter((p) => p.id !== live.id).map((p) => headOf(p)),
  )

  // The room said yes: the change is on `live` now, so it is the profile's too.
  $effect(() => {
    if (pending === null || live === null) return
    const nameDone = pending.name === undefined || live.display_name === pending.name
    const headDone = pending.head === undefined || live.avatar === pending.head
    if (!nameDone || !headDone) return
    saveProfile(live.display_name, headOf(live))
    saved = 'Saved.'
    pending = null
  })

  // The room said no. The error is the menu's to show; what was pending is not coming.
  $effect(() => {
    if ($profileError !== null) pending = null
  })

  // A fresh snapshot, an error about anything, or leaving the room: the change is either
  // on `live` already or lost, and waiting longer would only lock the menu.
  $effect(() => {
    if (pending !== null && (live === null || $requestsSettled !== sentAt)) pending = null
  })

  $effect(() => {
    if (pending === null) return
    const timer = setTimeout(() => {
      pending = null
      unanswered = true
    }, PENDING_MS)
    return () => clearTimeout(timer)
  })

  async function openMenu(): Promise<void> {
    open = true
    nudge.set(null)
    draft = currentName
    draftHead = shownHead
    saved = null
    unanswered = false
    profileError.set(null)
    await tick()
    panel?.focus()
  }

  function close(): void {
    open = false
  }

  function pickTheme(picked: Theme): void {
    theme = picked
    setTheme(picked)
  }

  function send(change: { display_name?: string; avatar?: number }): void {
    profileError.set(null)
    saved = null
    unanswered = false
    if ($roomSend?.({ t: 'set_profile', ...change })) {
      sentAt = $requestsSettled
      pending = { name: change.display_name, head: change.avatar }
    }
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (!ok || pending !== null) return
    const name = draft.trim()
    if (inRoom) {
      send({
        ...(nameChanged ? { display_name: name } : {}),
        ...(headChanged && draftHead !== null ? { avatar: draftHead } : {}),
      })
    } else {
      saveProfile(name, draftHead ?? undefined)
      draft = name
      // A first save rolls the profile its head: show it rather than keep a faceless popover.
      draftHead = $profile?.head ?? null
      saved = 'Saved.'
    }
  }

  /** A new face in the menu. It goes anywhere only with Save. */
  function rerollHead(): void {
    if (pending !== null) return
    draftHead = randomHead(taken, draftHead ?? shownHead)
    saved = null
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (!open) return
    const target = event.target
    if (target instanceof Node && root?.contains(target)) return
    close()
    // The browser moves focus after pointerdown; once it has, anything focusable the tap
    // landed on keeps it, and a tap on bare page gives it back to the control.
    setTimeout(() => {
      if (document.activeElement === null || document.activeElement === document.body) {
        control?.focus()
      }
    })
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open) return
    close()
    control?.focus()
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget
    if (open && next instanceof Node && !root?.contains(next)) close()
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

<div class="menu" bind:this={root} onfocusout={onFocusOut}>
  <button
    type="button"
    class="control chip"
    class:unset={shownName === null}
    class:nudging
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label="{shownName === null
      ? 'Set your display name'
      : `You are ${shownName}`}, theme {THEME_LABELS[theme].name}. Open settings"
    bind:this={control}
    onclick={() => (open ? close() : openMenu())}
  >
    {#if shownHead === null}
      <!-- Nobody yet: a blank silhouette until the profile has a head to show. -->
      <svg class="blank" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle class="blank-face" cx="12" cy="12" r="11" />
        <circle cx="12" cy="9.5" r="3.5" fill="currentColor" />
        <path d="M5 21a7 7 0 0 1 14 0z" fill="currentColor" />
      </svg>
    {:else}
      <Head head={shownHead} size={32} label="" />
    {/if}
    <span class="chip-name">{shownName ?? 'Set your display name'}</span>
    <span class="bar-emblem" aria-hidden="true"><Emblem {theme} /></span>
  </button>

  {#if nudging && !open}
    <p class="nudge" role="status">
      <span>You're <strong>{shownName}</strong> — tap to change.</span>
      <button type="button" class="link" aria-label="Dismiss" onclick={() => nudge.set(null)}>
        ✕
      </button>
    </p>
  {/if}

  {#if open}
    <div class="panel-menu" role="dialog" aria-label="Settings" tabindex="-1" bind:this={panel}>
      <section aria-labelledby="menu-you">
        <h2 class="section-title" id="menu-you">You</h2>
        {#if draftHead !== null}
          <div class="face">
            <Head head={draftHead} size={48} />
            <button
              type="button"
              class="small reroll-head"
              disabled={pending !== null}
              onclick={rerollHead}
            >
              <Die /> New head
            </button>
          </div>
        {/if}
        <form onsubmit={submit}>
          <NameField
            id="profile-name"
            bind:value={draft}
            avoid={$room?.code ?? ''}
            hint={inRoom
              ? 'Everyone in the room sees the change, and the next room gets it too.'
              : 'Filled in whenever you create or join a room.'}
          />
          <div class="row">
            <button class="primary small" type="submit" disabled={!ok || pending !== null}>
              Save
            </button>
            {#if pending !== null}
              <span class="note" role="status">Asking the room…</span>
            {:else if refusal !== null}
              <span class="error" role="alert">{refusal}</span>
            {:else if unanswered}
              <span class="error" role="alert">The room didn't answer. Try again.</span>
            {:else if saved !== null}
              <span class="note" role="status">{saved}</span>
            {/if}
          </div>
        </form>
      </section>
      <SoundSettings />
      <ThemeChoices current={theme} onpick={pickTheme} />
    </div>
  {/if}
</div>

<style>
  /* Deliberately not positioned: the menu anchors to the top bar's column instead
     (TopBar's `.inner`) and opens flush with its right edge, so at 320px it has the whole
     width less the gutter however wide the name is. */
  .menu {
    display: flex;
    min-width: 0;
  }

  /* As wide as a 24-character name wants on a desktop; on a phone, as wide as the bar
     leaves once the sign has its share. The head is 32px, which a 36px control holds with
     the padding it already has. */
  .chip {
    min-width: 0;
    max-width: 100%;
    padding-left: calc(0.15rem - var(--border-give));
  }

  .chip.unset .chip-name {
    color: var(--muted);
  }

  .chip-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  /* Wins over the 20px every other control glyph gets: the same size the real heads are. */
  .chip .blank {
    width: 32px;
    height: 32px;
  }

  .blank-face {
    fill: var(--panel-raised);
    stroke: currentColor;
  }

  .bar-emblem {
    flex: none;
    width: 24px;
    height: 24px;
  }

  /* Once, and only for somebody who has not said they mind (D11 owns motion as a whole). */
  .chip.nudging {
    border-color: var(--accent);
  }

  @media (prefers-reduced-motion: no-preference) {
    .chip.nudging {
      animation: nudge 0.9s ease-in-out 2;
    }
  }

  @keyframes nudge {
    50% {
      transform: scale(1.06);
    }
  }

  .nudge {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: max-content;
    max-width: min(20rem, 100vw - 2rem);
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--accent);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow-wrap: anywhere;
  }

  /* Never wider than the screen it opens on, and never taller: a phone held sideways
     scrolls the menu, not the page under it. */
  .panel-menu {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    display: grid;
    gap: 1.25rem;
    width: min(20rem, 100vw - 2rem);
    max-height: calc(100dvh - var(--topbar-height) - 1rem);
    overflow-y: auto;
    padding: 1rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .panel-menu:focus {
    outline: none;
  }

  /* Shared with the Sound and Theme sections, which sit inside this panel. */
  .panel-menu :global(.section-title) {
    padding: 0;
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
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
</style>
