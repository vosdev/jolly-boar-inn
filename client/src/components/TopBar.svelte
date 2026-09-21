<script lang="ts">
  /**
   * The app shell's bar (D2, section 4 of ideas/design.md). One of these, above every
   * screen, 56px and sticky:
   *
   *     ┌────────────────────────────────────────────────────────┐
   *     │ [sign] The Jolly Boar Inn             [◍] Name  [♪] [◑] │
   *     └────────────────────────────────────────────────────────┘
   *
   * **No room code up here**, and section 4 says why: a code in this app is a word —
   * `SaradominGodsword`, `ThermonuclearSmokeDevil` — and one of those in 56px beside four
   * controls either truncates to something worse than useless or pushes the controls off
   * a phone. The lobby shows the code big with the link to share it, and Join keeps its
   * own heading. The bar is therefore the same width in every room.
   *
   * **Three named slots**, in the order section 4 puts them: identity (D3, then D4), sound
   * (D6) and theme (D5, `ThemePicker`). Each falls back to a placeholder control, because the shell is
   * what D2 delivers and the controls are other tasks — a placeholder holds the exact
   * space the real one will take, so neither of those tasks has to come back and rework
   * the bar. GitHub is deliberately not a slot here: it is D10's, along with the footer
   * it really belongs to (section 9.3).
   *
   * **The player's name is the bar's priority.** Nothing collapses into a popover: under
   * 26rem the wordmark goes, and whatever width is left belongs to the name, which
   * ellipsises rather than disappearing. Sound, theme and the sign keep their size.
   *
   * The sign links home. The mark is a placeholder shape (section 9.1): D10 swaps it for
   * `PUBLIC_SITE_LOGO` and the wordmark for `PUBLIC_SITE_NAME`, and neither needs a change
   * here to do it.
   */
  import type { Snippet } from 'svelte'

  const SITE_NAME = 'The Jolly Boar Inn'

  /** The letter on the placeholder sign. A leading article is not what an inn is called,
      so the Jolly Boar Inn gets a J and the Dancing Donkey a D. */
  const INITIAL = SITE_NAME.replace(/^(the|a|an)\s+/i, '').trim().charAt(0).toUpperCase()

  let {
    navigate,
    identity,
    sound,
    theme,
  }: {
    navigate: (to: string) => void
    identity?: Snippet
    sound?: Snippet
    theme?: Snippet
  } = $props()

  function goHome(event: MouseEvent): void {
    // A modified click is somebody asking for a new tab; let the browser have it.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate('/')
  }
</script>

{#snippet soundPlaceholder()}
  <!-- Placeholders, not controls: D6 and D5 pass the real ones in as slots. Disabled
       rather than dead, so nobody taps one expecting it to do something. -->
  <button type="button" class="control" disabled aria-label="Sound">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 9h4l5-4v14l-5-4H4z"
        fill="currentColor"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path
        d="M16.5 8.5a5 5 0 0 1 0 7"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  </button>
{/snippet}

{#snippet themePlaceholder()}
  <button type="button" class="control" disabled aria-label="Theme">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  </button>
{/snippet}

{#snippet identityPlaceholder()}
  <span class="control chip" aria-label="You">
    <svg class="head" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle class="head-face" cx="12" cy="12" r="11" />
      <circle cx="12" cy="9.5" r="3.5" fill="currentColor" />
      <path d="M5 21a7 7 0 0 1 14 0z" fill="currentColor" />
    </svg>
    <span class="chip-name">Guest</span>
  </span>
{/snippet}

<header class="bar">
  <div class="inner">
    <a class="skip" href="#content">Skip to the game</a>

    <div class="mark">
      <!-- The sign is the way home, and never hides however narrow the screen gets. The
           room is not lost by following it: the session stays in this browser, and the
           room's link brings you straight back in. -->
      <a class="home" href="/" aria-label="{SITE_NAME}, home" onclick={goHome}>
        <!-- The placeholder sign (section 9.1): a shape, drawn in tokens, sized for the
             file that replaces it. -->
        <svg class="sign" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path class="sign-hanger" d="M16 2v5" />
          <rect class="sign-board" x="3" y="7" width="26" height="20" rx="4" />
          <text class="sign-letter" x="16" y="18" text-anchor="middle" dominant-baseline="central">
            {INITIAL}
          </text>
        </svg>
      </a>
      <!-- Not a heading: the screen below owns the page title. -->
      <p class="wordmark" aria-hidden="true">{SITE_NAME}</p>
    </div>

    <div class="controls">
      <div class="identity-slot">{@render (identity ?? identityPlaceholder)()}</div>
      {@render (sound ?? soundPlaceholder)()}
      {@render (theme ?? themePlaceholder)()}
    </div>
  </div>
</header>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 20;
    height: var(--topbar-height);
    background: var(--panel);
    /* Drawn as a shadow rather than a border, so a theme with a thicker edge thickens
       the line without taking height from the controls: they sit at the same y in every
       theme, and a switch mid-question does not nudge them. */
    box-shadow: 0 var(--border-width) 0 var(--line);
  }

  /* The same column the screens use, so the bar's ends line up with the panels under it
     rather than with the window. */
  .inner {
    width: min(42rem, 100% - 2rem);
    height: 100%;
    margin-inline: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* The identity popover's anchor, so it opens flush with the column's right edge
       wherever the chip itself sits. */
    position: relative;
  }

  .mark {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* The wordmark gives way before the name does: the huge shrink factor means the
       mark gives up its width first, down to the sign, which never gives way. */
    flex: 0 1000 auto;
    min-width: 32px;
  }

  .home {
    display: flex;
    flex: none;
    border-radius: var(--radius);
  }

  .sign {
    width: 32px;
    height: 32px;
    flex: none;
  }

  .sign-hanger {
    fill: none;
    stroke: var(--line);
    stroke-width: 2;
  }

  .sign-board {
    fill: var(--accent);
    stroke: var(--accent-hover);
    stroke-width: 2;
  }

  /* Section 9.1's placeholder mark, literally: the wordmark's first letter in whatever
     face is loaded, on a plain sign. It follows PUBLIC_SITE_NAME when D10 wires it up,
     and it is a file's worth of art away from being the real sign. */
  .sign-letter {
    fill: var(--accent-ink);
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
  }

  .wordmark {
    margin: 0;
    min-width: 0;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Takes whatever the mark leaves, right-aligned. min-width lets the name inside be the
     one thing here that shrinks, which is what keeps a 320px screen from scrolling
     sideways; sound and theme never do. */
  .controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
    flex: 1 1 auto;
    min-width: 0;
  }

  .identity-slot {
    display: flex;
    min-width: 0;
  }

  .controls > :global(.control) {
    flex: none;
  }

  /* One size for every control the slots pass in, so a bar of placeholders and a bar of
     real controls are the same bar. */
  .controls :global(.control) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    height: 36px;
    min-width: 36px;
    padding: 0 calc(0.4rem - var(--border-give));
    border: var(--border-width) solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--ink);
  }

  .controls :global(.control:disabled) {
    /* A placeholder is not a broken button: it reads as quiet furniture rather than as
       something that failed to load. D5 and D6 replace these outright. */
    opacity: 0.55;
    cursor: default;
  }

  .controls :global(.control svg) {
    width: 20px;
    height: 20px;
    flex: none;
  }

  .chip {
    min-width: 0;
    max-width: 100%;
  }

  .chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  /* Wins over the 20px every other control glyph gets: the placeholder face is the size
     of the real heads (32px, section 5.2) so the bar is the same bar either way. */
  .controls .chip .head {
    width: 32px;
    height: 32px;
  }

  .head-face {
    fill: var(--panel-raised);
    stroke: currentColor;
  }

  /* Section 4: the wordmark gives way under 26rem, the sign never does. */
  @media (max-width: 26rem) {
    .wordmark {
      display: none;
    }
  }

  /* The bar puts four controls in front of the screen for anyone on a keyboard,
     on every screen. This jumps them. */
  .skip {
    position: absolute;
    left: -9999px;
    top: 0;
    padding: 0.4rem 0.7rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    color: var(--ink);
  }

  .skip:focus-visible {
    left: 0;
    z-index: 1;
  }
</style>
