<script lang="ts">
  /**
   * The app shell's bar (section 5 of ideas/design.md). One of these, above every screen,
   * 56px and sticky:
   *
   *     ┌────────────────────────────────────────────────────────────┐
   *     │ [sign] The Jolly Boar Inn           [⌥]  [◍ Name ✦] │
   *     └────────────────────────────────────────────────────────────┘
   *
   * **No room code up here**: a code in this app is a word — `SaradominGodsword`,
   * `ThermonuclearSmokeDevil` — and one of those in 56px beside the controls either
   * truncates to something worse than useless or pushes the controls off a phone. The
   * lobby shows the code big with the link to share it, and Join keeps its own heading.
   *
   * **One slot** after GitHub, for the menu: head, name and theme emblem in one control,
   * which opens who you are, sound and theme. It falls back to a placeholder that holds
   * the space the real control takes. GitHub is `--muted`, the one control not about the
   * game, and it is a link rather than a slot because it is the same on every screen.
   *
   * **The player's name is the bar's priority.** Under 26rem the wordmark and GitHub go,
   * and whatever width is left belongs to the name, which ellipsises rather than
   * disappearing. The sign keeps its size.
   *
   * The sign links home. It is the selfhoster's `PUBLIC_SITE_LOGO` when there is one, and
   * the bundled sign when there is not or when the file will not load. The version is in
   * the footer, not here.
   */
  import type { Snippet } from 'svelte'
  import { initial, logo, siteName } from 'virtual:branding'

  import { REPO_URL } from '../lib/links'

  let logoBroken = $state(false)

  let {
    navigate,
    menu,
    wide = false,
  }: {
    navigate: (to: string) => void
    menu?: Snippet
    /** The screen under the bar uses the wide page, so the bar's ends follow it. */
    wide?: boolean
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

{#snippet menuPlaceholder()}
  <!-- Not a control: App passes the real menu in. -->
  <span class="control chip" aria-label="You">
    <svg class="head" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle class="head-face" cx="12" cy="12" r="11" />
      <circle cx="12" cy="9.5" r="3.5" fill="currentColor" />
      <path d="M5 21a7 7 0 0 1 14 0z" fill="currentColor" />
    </svg>
    <span class="chip-name">Guest</span>
    <span class="emblem-space"></span>
  </span>
{/snippet}

<header class="bar">
  <div class="inner" class:wide>
    <a class="skip" href="#content">Skip to the game</a>

    <div class="mark">
      <!-- The sign is the way home, and never hides however narrow the screen gets. The
           room is not lost by following it: the session stays in this browser, and the
           room's link brings you straight back in. -->
      <a class="home" href="/" aria-label="{siteName}, home" onclick={goHome}>
        {#if logo !== null && !logoBroken}
          <img class="sign" src={logo} alt="" onerror={() => (logoBroken = true)} />
        {:else}
          <!-- Drawn in tokens, so it follows the theme as a file could not. -->
          <svg class="sign" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path class="sign-hanger" d="M16 2v5" />
            <rect class="sign-board" x="3" y="7" width="26" height="20" rx="4" />
            <text
              class="sign-letter"
              x="16"
              y="18"
              text-anchor="middle"
              dominant-baseline="central"
            >
              {initial}
            </text>
          </svg>
        {/if}
      </a>
      <!-- Not a heading: the screen below owns the page title. -->
      <p class="wordmark" aria-hidden="true">{siteName}</p>
    </div>

    <div class="controls">
      <a
        class="control github"
        href={REPO_URL}
        target="_blank"
        rel="noopener"
        aria-label="Source code on GitHub"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.06-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
      </a>
      <div class="menu-slot">{@render (menu ?? menuPlaceholder)()}</div>
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
  .inner.wide {
    width: min(var(--page-wide), 100% - 2rem);
  }

  .inner {
    width: min(var(--page-width), 100% - 2rem);
    height: 100%;
    margin-inline: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* The menu's anchor, so it opens flush with the column's right edge wherever the
       control itself sits. */
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
    object-fit: contain;
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
     sideways. */
  .controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
    flex: 1 1 auto;
    min-width: 0;
  }

  .menu-slot {
    display: flex;
    min-width: 0;
  }

  .controls > :global(.control) {
    flex: none;
  }

  /* One size for every control, so the placeholder and the real menu are the same bar. */
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

  .controls .github {
    color: var(--muted);
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

  .emblem-space {
    flex: none;
    width: 24px;
  }

  .head-face {
    fill: var(--panel-raised);
    stroke: currentColor;
  }

  /* The wordmark and GitHub give way under 26rem; the sign never does. */
  @media (max-width: 26rem) {
    .wordmark,
    .controls .github {
      display: none;
    }
  }

  /* The bar puts its controls in front of the screen for anyone on a keyboard, on every
     screen. This jumps them. */
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
