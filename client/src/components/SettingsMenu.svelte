<script lang="ts">
  /**
   * The top bar's one control and its menu (section 5 of ideas/design.md): who you are,
   * the sound switches and the theme, behind a single thumb target.
   *
   * The control shows the pet, the name and the current theme's emblem. The name is the
   * one part that shrinks: on a phone it ellipsises rather than collapsing to the head,
   * because who you are is the one thing the bar is for.
   *
   * **You** means two different things in two places, and both are right:
   *
   * - **Outside a room** (Home, Create, Join) it is the local profile — the name and pet
   *   this browser will bring to the next room — and "Set your name" until there is one.
   * - **Inside a room** it is the live `PlayerView` the server sent, which is who the
   *   room actually sees. A join that had to turn the suffix over (`AFKFisher42` was
   *   taken, so you are `AFKFisher517`) shows here, not in the profile.
   *
   * The section edits whichever one the control is showing. Both the name and the pet
   * are drafts until Save: the picker changes the menu only, and a player
   * who tries a few and closes it keeps the one they had. Outside a room Save writes the
   * profile. Inside one it is a single `set_profile` on the room's socket: the
   * change is the room's to accept, so nothing is saved until the `room_updated` that
   * carries it comes back, and a name somebody else in the room already has is answered
   * under the field, with the old name still in place. What the room accepts becomes the
   * profile too, so the next room starts from it. A change the room never answers is
   * given up on: any `welcome` or `error` after the send, leaving the room, or
   * `PENDING_MS` with no word, which says so. This component stays mounted with the menu
   * shut, so a change the room accepts after it closes still reaches the profile.
   *
   * Names are fixed once the game starts, so in a room past its lobby the You section is
   * disabled. In the lobby, the others see "picking a name…" while the name field has
   * focus: the menu sends `editing` on focus, again every `EDITING_REFRESH_MS` and after a
   * reconnect, since the server lets it lapse, and off on blur. A save the room accepts
   * clears it on the server, and it stays off until the name is typed in again. The room's
   * TV has no You section: nobody plays as it, so it has no name or pet to pick.
   *
   * On a screen wide enough for it, the menu is a sheet under the bar in two halves: the
   * name, the theme and the sound on the left, the pet grid always open on the right, so
   * the inputs for name and pet line up. On a phone, the sections stack and the pets wait
   * behind "Change pet".
   *
   * The menu is a non-modal dialog. Escape, a tap outside, or tabbing out of it closes
   * it; Escape hands focus back to the control, and so does a tap outside that landed on
   * nothing focusable, so a tap on an answer button keeps its focus.
   */
  import { tick } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'

  import { Cooldown } from '../lib/cooldown.svelte'
  import { dismissable, type Dismissed } from '../lib/dismissable'
  import { nameProblem } from '../lib/names'
  import { petOf, randomPet } from '../lib/pets'
  import { profile, saveProfile } from '../lib/profile'
  import type { PlayerView } from '../lib/protocol'
  import { connection, players, profileError, requestsSettled, room, roomSend } from '../lib/stores'
  import { getTheme, setTheme, THEME_LABELS, type Theme } from '../lib/theme'
  import Emblem from './Emblem.svelte'
  import NameField from './NameField.svelte'
  import Pet from './Pet.svelte'
  import PetPicker from './PetPicker.svelte'
  import SoundSettings from './SoundSettings.svelte'
  import ThemeChoices from './ThemeChoices.svelte'

  /** How long a `set_profile` may go unanswered before the popover stops waiting. */
  const PENDING_MS = 5_000
  /** Well inside the server's 60 s, so a menu held open never lapses. */
  const EDITING_REFRESH_MS = 30_000
  /** Where the sheet, the window less 2rem, has room for two halves. */
  const wide = new MediaQuery('(min-width: 46rem)')

  let {
    live = null,
  }: {
    /** You, in the room you are in; null outside one. */
    live?: PlayerView | null
  } = $props()

  let open = $state(false)
  let draft = $state('')
  /** The pet the menu shows: picked here, and nobody else's business until Save. */
  let draftPet = $state<string | null>(null)
  let saved = $state<string | null>(null)
  let control = $state<HTMLButtonElement | null>(null)
  let panel = $state<HTMLElement | null>(null)
  let theme = $state<Theme>(getTheme())
  /** What was sent in `set_profile` and has not come back in a `room_updated` yet. */
  let pending = $state<{ name?: string; pet?: string } | null>(null)
  /** `$requestsSettled` when it was sent: once that moves, the reply is not coming. */
  let sentAt = 0
  const profileHold = new Cooldown()
  let unanswered = $state(false)
  /** Saved and untouched since: nothing to tell the room about. */
  let resting = $state(false)
  let nameFocused = $state(false)
  /** The room was told `editing` is on, and not told it is off again. */
  let editingSent = false

  const inRoom = $derived(live !== null)
  const canRename = $derived(!inRoom || $room?.status === 'lobby')
  const isTV = $derived(live?.role === 'tv')
  const halves = $derived(wide.current && !isTV)
  const editing = $derived(
    open &&
      nameFocused &&
      inRoom &&
      canRename &&
      !resting &&
      $connection === 'open' &&
      $roomSend !== null,
  )
  const shownName = $derived(live?.display_name ?? $profile?.name ?? null)
  const shownPet = $derived(live !== null ? petOf(live) : ($profile?.pet ?? null))
  const currentName = $derived(live?.display_name ?? $profile?.name ?? '')
  const nameChanged = $derived(draft.trim() !== currentName)
  const petChanged = $derived(draftPet !== null && draftPet !== shownPet)
  const ok = $derived(canRename && nameProblem(draft) === null && (nameChanged || petChanged))
  /** The room's refusal, in words for the person holding the phone. */
  const refusal = $derived(
    $profileError === null
      ? null
      : $profileError.code === 'name_taken'
        ? 'Someone in this room already has that name.'
        : $profileError.message,
  )
  /** Everybody else's pet, so Random leans toward one nobody is wearing. */
  const taken = $derived(
    live === null ? [] : $players.filter((p) => p.id !== live.id).map((p) => petOf(p)),
  )

  // The room said yes: the change is on `live` now, so it is the profile's too.
  $effect(() => {
    if (pending === null || live === null) return
    const nameDone = pending.name === undefined || live.display_name === pending.name
    const petDone = pending.pet === undefined || live.avatar === pending.pet
    if (!nameDone || !petDone) return
    saveProfile(live.display_name, live.avatar ?? undefined)
    saved = 'Saved.'
    pending = null
    resting = true
    // The server's cooldown runs from when the change landed, which is now; a refusal
    // landed nothing, so it holds nothing.
    profileHold.start()
  })

  $effect(() => {
    const send = $roomSend
    if (send === null) return
    if (!editing) {
      if (editingSent) send({ t: 'editing', on: false })
      editingSent = false
      return
    }
    editingSent = send({ t: 'editing', on: true })
    const refresh = setInterval(() => send({ t: 'editing', on: true }), EDITING_REFRESH_MS)
    return () => clearInterval(refresh)
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
    draft = currentName
    // Somebody with no profile yet sees the pet their first save will give them, and can
    // change it before it is theirs.
    draftPet = shownPet ?? randomPet()
    saved = null
    unanswered = false
    resting = false
    profileError.set(null)
    await tick()
    panel?.focus()
  }

  function close(): void {
    open = false
    nameFocused = false
  }

  function isNameField(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.id === 'profile-name'
  }

  function pickTheme(picked: Theme): void {
    theme = picked
    setTheme(picked)
  }

  function send(change: { display_name?: string; avatar?: string }): void {
    profileError.set(null)
    saved = null
    unanswered = false
    if ($roomSend?.({ t: 'set_profile', ...change })) {
      sentAt = $requestsSettled
      pending = { name: change.display_name, pet: change.avatar }
    }
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (!ok || pending !== null || profileHold.held) return
    const name = draft.trim()
    if (inRoom) {
      send({
        ...(nameChanged ? { display_name: name } : {}),
        ...(petChanged && draftPet !== null ? { avatar: draftPet } : {}),
      })
    } else {
      saveProfile(name, draftPet ?? undefined)
      draft = name
      // A first save rolls the profile its pet: show it rather than keep a faceless popover.
      draftPet = $profile?.pet ?? null
      saved = 'Saved.'
    }
  }

  function dismissed(by: Dismissed): void {
    close()
    if (by === 'escape') control?.focus()
    // The browser moves focus after pointerdown; once it has, anything focusable the tap
    // landed on keeps it, and a tap on bare page gives it back to the control.
    if (by === 'outside')
      setTimeout(() => {
        if (document.activeElement === null || document.activeElement === document.body) {
          control?.focus()
        }
      })
  }
</script>

{#snippet petPicker(inline: boolean)}
  <PetPicker
    bind:value={() => draftPet ?? '', (pet) => (draftPet = pet)}
    {taken}
    {inline}
    disabled={pending !== null}
    onchange={() => {
      saved = null
      resting = false
    }}
  />
{/snippet}

{#snippet nameForm()}
  <form
    onsubmit={submit}
    oninput={() => (resting = false)}
    onfocusin={(event) => (nameFocused = isNameField(event.target))}
    onfocusout={() => (nameFocused = false)}
  >
    <NameField id="profile-name" bind:value={draft} avoid={$room?.code ?? ''} />
    <div class="row">
      <button
        class="primary small"
        type="submit"
        disabled={!ok || pending !== null || profileHold.held}
      >
        Save
      </button>
      {#if pending !== null}
        <span class="note">Saving…</span>
      {:else if refusal !== null}
        <span class="error">{refusal}</span>
      {:else if unanswered}
        <span class="error">Couldn't save your changes. Please try again.</span>
      {:else if saved !== null}
        <span class="note">{saved}</span>
      {/if}
    </div>
  </form>
{/snippet}

<div class="menu" use:dismissable={{ open, close: dismissed, tab: true }}>
  <button
    type="button"
    class="control chip"
    class:unset={shownName === null}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label="{shownName === null
      ? 'Set your display name'
      : `You are ${shownName}`}, theme {THEME_LABELS[theme].name}. Open settings"
    bind:this={control}
    onclick={() => (open ? close() : openMenu())}
  >
    {#if shownPet === null}
      <!-- Nobody yet: a blank silhouette until the profile has a pet to show. -->
      <svg class="blank" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle class="blank-face" cx="12" cy="12" r="11" />
        <circle cx="12" cy="9.5" r="3.5" fill="currentColor" />
        <path d="M5 21a7 7 0 0 1 14 0z" fill="currentColor" />
      </svg>
    {:else}
      <Pet pet={shownPet} size={32} cut="icon" label="" />
    {/if}
    <span class="chip-name">{shownName ?? 'Set your display name'}</span>
    <span class="bar-emblem" aria-hidden="true"><Emblem {theme} /></span>
    <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2 4l4 4 4-4" />
    </svg>
  </button>

  {#if open}
    <div class="backdrop" aria-hidden="true"></div>
    <div
      class="panel-menu"
      class:halves
      role="dialog"
      aria-label="Settings"
      tabindex="-1"
      bind:this={panel}
    >
      {#if halves}
        <div class="side">
          <section aria-labelledby="menu-you">
            <h2 class="sr" id="menu-you">You</h2>
            <fieldset class="you face" disabled={!canRename}>
              {#if draftPet !== null}
                <Pet pet={draftPet} size={64} label="" />
              {/if}
              {@render nameForm()}
            </fieldset>
            {#if !canRename}
              <p class="note">You can't change your name once the game has started.</p>
            {/if}
          </section>
          <ThemeChoices current={theme} onpick={pickTheme} named />
          <SoundSettings />
        </div>
        <fieldset class="you pets" disabled={!canRename}>
          {#if draftPet !== null}
            {@render petPicker(true)}
          {/if}
        </fieldset>
      {:else}
        {#if !isTV}
          <section aria-labelledby="menu-you">
            <h2 class="section-title" id="menu-you">You</h2>
            <fieldset class="you" disabled={!canRename}>
              {#if draftPet !== null}
                {@render petPicker(false)}
              {/if}
              {@render nameForm()}
              {#if !canRename}
                <p class="note">You can't change your name once the game has started.</p>
              {/if}
            </fieldset>
          </section>
        {/if}
        <SoundSettings />
        <ThemeChoices current={theme} onpick={pickTheme} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .you {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  /* Deliberately not positioned: the sheet places itself against the window, so it is as
     wide as Home's column on every screen, whatever the bar's own column measures. */
  .menu {
    display: flex;
    min-width: 0;
  }

  /* As wide as a 12-character name wants on a desktop; on a phone, as wide as the bar
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

  /* Wins over the 20px every other control glyph gets: the same size the real pets are. */
  .chip .blank {
    width: 32px;
    height: 32px;
  }

  .blank-face {
    fill: var(--panel-raised);
    stroke: currentColor;
  }

  .chevron {
    flex: none;
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    transition: transform 150ms ease-out;
  }

  .control[aria-expanded='true'] .chevron {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }

  .bar-emblem {
    flex: none;
    width: 32px;
    height: 32px;
  }

  /* Dims the page without catching the tap: a tap outside still lands where it was aimed,
     and closes the sheet on its way. */
  .backdrop {
    position: fixed;
    inset: var(--topbar-height) 0 0;
    background: rgb(0 0 0 / 0.35);
    pointer-events: none;
  }

  /* Hangs from the bar, Home's width or the window's less a gutter, and never taller than
     the window: a phone held sideways scrolls the sheet, not the page under it. */
  .panel-menu {
    position: fixed;
    top: calc(var(--topbar-height) + var(--border-width));
    left: 50%;
    translate: -50% 0;
    display: grid;
    align-content: start;
    gap: 1.25rem;
    width: min(var(--page-wide), 100vw - 2rem);
    box-sizing: border-box;
    max-height: calc(100dvh - var(--topbar-height) - 1rem);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--surface-muted) var(--panel-raised);
    overscroll-behavior: contain;
    padding: 1rem;
    /* It opens from the bar, whose inks are the bar's. */
    --ink: var(--surface-ink);
    --muted: var(--surface-muted);
    color: var(--ink);
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
    box-shadow: var(--shadow);
  }

  .panel-menu.halves {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2.25rem;
    padding: 1.5rem 1.75rem 1.75rem;
  }

  .side {
    display: grid;
    align-content: start;
    gap: 1.5rem;
    min-width: 0;
  }

  /* The chathead stands beside the name field, level with its input. */
  .face {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 0.75rem;
  }

  .face > :global(:first-child) {
    margin-top: 0.9rem;
  }

  .pets {
    display: flex;
    flex-direction: column;
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
</style>
