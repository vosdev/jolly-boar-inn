<script lang="ts">
  /**
   * The app shell's bar (D2, section 4 of ideas/design.md). One of these, above every
   * screen, 56px and sticky:
   *
   *     ┌────────────────────────────────────────────────────────┐
   *     │ [sign] The Jolly Boar Inn             [♪] [◑]  [◍] Name │
   *     └────────────────────────────────────────────────────────┘
   *
   * **No room code up here**, and section 4 says why: a code in this app is a word —
   * `SaradominGodsword`, `ThermonuclearSmokeDevil` — and one of those in 56px beside four
   * controls either truncates to something worse than useless or pushes the controls off
   * a phone. The lobby shows the code big with the link to share it, and Join keeps its
   * own heading. The bar is therefore the same width in every room.
   *
   * **Three named slots**, in the order section 4 puts them: sound (D6), theme (D5) and
   * identity (D3, then D4). Each falls back to a placeholder control, because the shell
   * is what D2 delivers and the controls are other tasks — a placeholder holds the exact
   * space the real one will take, so neither of those tasks has to come back and rework
   * the bar. GitHub is deliberately not a slot here: it is D10's, along with the footer
   * it really belongs to (section 9.3).
   *
   * **Identity is the only slot that is told how wide the bar is.** Section 4 says the
   * chip drops to just the head under 26rem, and only the chip's own component can do
   * that to itself, so it gets `{ narrow }`. Sound and theme need nothing: they collapse
   * whole, into the `⋯` popover, which the shell does around them.
   *
   * The mark is a placeholder shape (section 9.1): D10 swaps it for `PUBLIC_SITE_LOGO`
   * and the wordmark for `PUBLIC_SITE_NAME`, and neither needs a change here to do it.
   */
  import { onMount, type Snippet } from 'svelte'

  const SITE_NAME = 'The Jolly Boar Inn'

  /** The letter on the placeholder sign. A leading article is not what an inn is called,
      so the Jolly Boar Inn gets a J and the Dancing Donkey a D. */
  const INITIAL = SITE_NAME.replace(/^(the|a|an)\s+/i, '').trim().charAt(0).toUpperCase()

  /** Section 4's breakpoint. In JS rather than only in CSS, because the collapse changes
      what is rendered — a control cannot be in the bar and in the popover at once. */
  const NARROW = '(max-width: 26rem)'

  let {
    sound,
    theme,
    identity,
  }: {
    sound?: Snippet
    theme?: Snippet
    identity?: Snippet<[{ narrow: boolean }]>
  } = $props()

  // Read once at init so the first paint is already the right shape on a phone; the
  // listener below keeps it honest through a rotation or a resized window.
  let narrow = $state(matchMedia(NARROW).matches)
  let overflowOpen = $state(false)
  let overflow = $state<HTMLElement | null>(null)

  onMount(() => {
    const query = matchMedia(NARROW)
    const onChange = (event: MediaQueryListEvent): void => {
      narrow = event.matches
      // Widening while the popover is open would leave it floating over a bar that has
      // its controls back.
      if (!narrow) overflowOpen = false
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  })

  function onWindowPointerDown(event: MouseEvent): void {
    if (!overflowOpen) return
    const target = event.target
    if (target instanceof Node && overflow?.contains(target)) return
    overflowOpen = false
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') overflowOpen = false
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

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

{#snippet identityPlaceholder(state: { narrow: boolean })}
  <span class="control chip" aria-label="You">
    <svg class="head" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle class="head-face" cx="12" cy="12" r="11" />
      <circle cx="12" cy="9.5" r="3.5" fill="currentColor" />
      <path d="M5 21a7 7 0 0 1 14 0z" fill="currentColor" />
    </svg>
    {#if !state.narrow}<span class="chip-name">Guest</span>{/if}
  </span>
{/snippet}

<header class="bar">
  <div class="inner">
    <a class="skip" href="#content">Skip to the game</a>

    <div class="mark">
      <!-- The placeholder sign (section 9.1): a shape, drawn in tokens, sized for the
           file that replaces it. It never hides, however narrow the screen gets. -->
      <svg class="sign" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path class="sign-hanger" d="M16 2v5" />
        <rect class="sign-board" x="3" y="7" width="26" height="20" rx="4" />
        <text class="sign-letter" x="16" y="18" text-anchor="middle" dominant-baseline="central">
          {INITIAL}
        </text>
      </svg>
      <!-- Not a heading and not a link: the screen below owns the page title, and a logo
           that navigates home is a way to drop out of a question by accident. -->
      <p class="wordmark">{SITE_NAME}</p>
    </div>

    <div class="controls">
      {#if narrow}
        <!-- Section 4: under 26rem sound and theme fold into one popover, and the chip
             keeps its place outside it, because it is the one a thumb reaches for. -->
        <div class="overflow" bind:this={overflow}>
          <button
            type="button"
            class="control"
            aria-label="More"
            aria-haspopup="true"
            aria-expanded={overflowOpen}
            onclick={() => (overflowOpen = !overflowOpen)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="5" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="19" cy="12" r="1.8" fill="currentColor" />
            </svg>
          </button>
          {#if overflowOpen}
            <div class="popover">
              {@render (sound ?? soundPlaceholder)()}
              {@render (theme ?? themePlaceholder)()}
            </div>
          {/if}
        </div>
      {:else}
        {@render (sound ?? soundPlaceholder)()}
        {@render (theme ?? themePlaceholder)()}
      {/if}
      {@render (identity ?? identityPlaceholder)({ narrow })}
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
    border-bottom: var(--border-width) solid var(--line);
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
  }

  .mark {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* min-width lets the wordmark be the thing that gives way, which is what keeps a
       320px screen from scrolling sideways. */
    flex: 1;
    min-width: 0;
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

  .controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
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
    padding: 0 0.4rem;
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
    max-width: 10rem;
  }

  .chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  /* Wins over the 20px every other control glyph gets: a face wants the extra pixels,
     and D4's real heads are drawn at this size. */
  .controls .chip .head {
    width: 24px;
    height: 24px;
  }

  .head-face {
    fill: var(--panel-raised);
    stroke: currentColor;
  }

  .overflow {
    position: relative;
  }

  .popover {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.35rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .popover :global(.control) {
    justify-content: flex-start;
    width: 100%;
  }

  /* Section 4: the wordmark gives way under 26rem, the sign never does. */
  @media (max-width: 26rem) {
    .wordmark {
      display: none;
    }
  }

  /* The bar puts three or four controls in front of the screen for anyone on a keyboard,
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
