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
   * A past game (`past`) is the exception, since the code is all that names it: there the
   * middle says "FireCape, finished Sun 25 Oct at 21:14", and on a narrow screen "FireCape,
   * 25 Oct", where the code gives way before the date or the name.
   *
   * **One slot** after GitHub, for the menu: head, name and theme emblem in one control,
   * which opens who you are, sound and theme. It falls back to a placeholder that holds
   * the space the real control takes. GitHub is `--muted`, the one control not about the
   * game, and it is a link rather than a slot because it is the same on every screen.
   *
   * **The player's name is the bar's priority.** Under 37.5rem the wordmark and GitHub go,
   * and whatever width is left belongs to the name, which ellipsises rather than
   * disappearing. The sign keeps its size.
   *
   * The sign links home. It is the theme's own logo when the selfhoster has one, else their
   * `PUBLIC_SITE_LOGO`, and the bundled sign when there is neither or the file will not
   * load. The version is in the footer, not here.
   *
   * **In a room** the bar runs the window's width (`full`), and its middle says where the
   * night is (`where`): "Round 1 of 3: More or Less", "Lobby". A stacked room, a phone's,
   * passes none. An admin's Host menu (`HostMenu`) comes first among the controls while the
   * room is playing.
   *
   * **In a team game** the bar is the frame's: the player's god's colour, and the god's
   * symbol in place of the sign, still the way home. On a screen with no timer under the
   * bar, the team's badge hangs from it; the timer bar hangs it otherwise.
   */
  import { onMount, type Snippet } from 'svelte'
  import { initial, logo, logos, siteName } from 'virtual:branding'

  import type { BarPast, BarWhere } from '../lib/barWhere'
  import { finishedAt, finishedDay } from '../lib/dates'
  import type { HostAction } from '../lib/hostMenu'
  import { REPO_URL } from '../lib/links'
  import { team as teamNamed, type TeamId } from '../lib/teams'
  import { watchTheme } from '../lib/theme'
  import HostMenu from './HostMenu.svelte'
  import TeamBadge from './TeamBadge.svelte'
  import TeamLogo from './TeamLogo.svelte'

  let theme = $state('')
  const sign = $derived(logos[theme] ?? logo)
  // The file that would not load; a theme with another logo still tries its own.
  let broken = $state<string | null>(null)

  onMount(() => watchTheme((current) => (theme = current)))

  let {
    navigate,
    menu,
    wide = false,
    full = false,
    where = null,
    past = null,
    host = null,
    team = null,
    badge = false,
    autohide = false,
  }: {
    navigate: (to: string) => void
    menu?: Snippet
    /** The screen under the bar uses the wide page, so the bar's ends follow it. */
    wide?: boolean
    /** The screen under the bar is a room, which takes the window's whole width. */
    full?: boolean
    /** Where the room's night is, for the bar's middle. */
    where?: BarWhere | null
    /** The past game under the bar, which its middle names. */
    past?: BarPast | null
    /** The admin's controls for the room's phase; null draws no Host menu. */
    host?: HostAction[] | null
    /** The player's team in a team game, whose frame the bar wears. */
    team?: TeamId | null
    /** Hang the team's badge from the bar: there is no timer bar to hang it. */
    badge?: boolean
    /**
     * Out of sight until the pointer comes near the window's top, for the room's TV: a
     * screen across the room has no use for a bar, and its menu is there when needed.
     */
    autohide?: boolean
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

{#if autohide}<div class="peek" aria-hidden="true"></div>{/if}
<header class="bar" class:framed={team !== null} class:autohide>
  <div
    class="inner"
    class:wide
    class:full
    class:placed={where !== null || past !== null}
    class:past={past !== null}
  >
    <a class="skip" href="#content">Skip to the game</a>

    <div class="mark">
      <!-- The sign is the way home, and never hides however narrow the screen gets. The
           room is not lost by following it: the session stays in this browser, and the
           room's link brings you straight back in. -->
      <a class="home" href="/" aria-label="{siteName}, home" onclick={goHome}>
        {#if team !== null}
          <span class="sign" title={teamNamed(team).name}><TeamLogo {team} /></span>
        {:else if sign !== null && sign !== broken}
          <img class="sign" src={sign} alt="" onerror={() => (broken = sign)} />
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

    {#if where !== null}
      <p class="where">
        {where.lead}{#if where.mode !== null}{' '}<strong>{where.mode}</strong>{/if}
      </p>
    {/if}

    {#if past !== null}
      <p class="where past">
        <strong class="named">{past.code}</strong>{#if past.finishedAt !== null}<span class="when">
            , <span class="long">finished {finishedAt(past.finishedAt)}</span><span class="short">
              {finishedDay(past.finishedAt)}
            </span>
          </span>{/if}
      </p>
    {/if}

    <div class="controls">
      {#if host !== null}
        <HostMenu actions={host} />
      {/if}
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
  {#if team !== null && badge}
    <div class="hang"><TeamBadge {team} /></div>
  {/if}
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

  /* Fixed rather than sticky, so the page takes no room for it while it is away. */
  .autohide {
    position: fixed;
    inset: 0 0 auto;
    z-index: 21;
    transform: translateY(calc(-100% - var(--border-width)));
    transition: transform 200ms ease-out;
  }

  .peek {
    position: fixed;
    inset: 0 0 auto;
    z-index: 20;
    height: 2rem;
  }

  .peek:hover + .autohide,
  .autohide:hover,
  .autohide:focus-within {
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .autohide {
      transition: none;
    }
  }

  .framed {
    background: var(--frame);
    box-shadow: none;
    color: var(--frame-ink);
  }

  /* The menu's panel opens inside the bar but on its own surface, so only the controls
     themselves take the frame's ink. */
  .framed .controls :global(.control),
  .framed .controls .github {
    color: var(--frame-ink);
    --muted: var(--frame-ink);
  }

  /* A god's symbol is drawn in its own colour, so on its own bar it needs an edge. */
  .framed .sign {
    display: flex;
    filter: drop-shadow(0 0 1px var(--frame-dark)) drop-shadow(0 1px 0 var(--frame-dark));
  }

  /* Hangs into main's top padding, as the timer bar's tabs do, and is never in the way of
     a tap on what is under it. */
  .hang {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  /* The same column the screens use, so the bar's ends line up with the panels under it
     rather than with the window. */
  .inner.wide {
    width: min(var(--page-wide), 100% - 2rem);
  }

  .inner.full {
    width: calc(100% - 3rem);
  }

  /* Three columns, so where the night is stands in the bar's middle whatever its ends hold. */
  .inner.placed {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  }

  .where {
    margin: 0;
    white-space: nowrap;
    color: var(--muted);
  }

  .where strong {
    color: var(--ink);
    font-weight: 650;
  }

  .past .where {
    display: flex;
    min-width: 0;
  }

  .past .named {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .past .when {
    flex: none;
  }

  .past .short {
    display: none;
  }

  /* Under the room's frame the code may be long beside a phone's controls: the middle
     follows the sign and gives way before the name does. */
  @media (width < 64rem) {
    .inner.placed.past {
      display: flex;
    }

    .past .where {
      flex: 0 10 auto;
    }

    .past .long {
      display: none;
    }

    .past .short {
      display: inline;
    }
  }

  .framed .where,
  .framed .where strong {
    color: var(--frame-ink);
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
     of the real pets (32px) so the bar is the same bar either way. */
  .controls .chip .head {
    width: 32px;
    height: 32px;
  }

  .emblem-space {
    flex: none;
    width: 32px;
  }

  .head-face {
    fill: var(--panel-raised);
    stroke: currentColor;
  }

  /* The wordmark and GitHub give way under 37.5rem; the sign never does. */
  @media (max-width: 37.5rem) {
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
