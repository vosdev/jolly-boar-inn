<script lang="ts">
  /**
   * The theme picker, in the top bar's theme slot (D5, section 1 of ideas/design.md).
   *
   * One entry per theme `app.css` defines — `THEMES`, which a test holds to the stylesheet
   * — and nothing else: no "follow my device", because nothing in this app follows the
   * device (section 1). A browser that has never chosen is on `jolly`, and the picker says
   * so by showing jolly selected rather than nothing.
   *
   * Each swatch is **live**: it is a small drawing of a panel on a page, carrying its own
   * `data-theme`, so every token inside it resolves to that theme's block rather than the
   * page's. The swatch is the theme, not a picture of it, and a selfhoster's new block
   * shows up here correctly without anybody drawing it a thumbnail. That is why every
   * theme block in `app.css` sets every token.
   *
   * Picking one repaints at once and the popover stays open, so a player can walk through
   * all three with the arrow keys and see each on the real screen behind it. Nothing but
   * `data-theme` on <html> changes, so nothing remounts: a question stays open and its
   * timer keeps running on the server's clock.
   */
  import { getTheme, setTheme, THEME_LABELS, THEMES, type Theme } from '../lib/theme'

  let open = $state(false)
  let current = $state<Theme>(getTheme())
  let root = $state<HTMLElement | null>(null)

  function pick(theme: Theme): void {
    current = theme
    setTheme(theme)
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

<div class="picker" bind:this={root}>
  <button
    type="button"
    class="control"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label="Theme: {THEME_LABELS[current].name}. Change theme"
    onclick={() => (open = !open)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  </button>

  {#if open}
    <div class="popover" role="dialog" aria-label="Theme">
      <fieldset>
        <legend>Theme</legend>
        {#each THEMES as theme (theme)}
          <label class="option" class:selected={theme === current}>
            <input
              type="radio"
              name="theme"
              value={theme}
              checked={theme === current}
              onchange={() => pick(theme)}
            />
            <!-- The theme itself, in miniature: page, panel, text, accent and the first
                 five gems, all drawn from this theme's tokens. -->
            <span class="swatch" data-theme={theme} aria-hidden="true">
              <span class="swatch-panel">
                <span class="swatch-text">Aa</span>
                <span class="swatch-accent"></span>
                <span class="swatch-gems">
                  <span class="gem sapphire"></span>
                  <span class="gem emerald"></span>
                  <span class="gem ruby"></span>
                  <span class="gem red-topaz"></span>
                  <span class="gem dragonstone"></span>
                </span>
              </span>
            </span>
            <span class="words">
              <span class="theme-name">{THEME_LABELS[theme].name}</span>
              <span class="mood">{THEME_LABELS[theme].mood}</span>
            </span>
            <!-- Selected is a tick as well as a ring: never colour alone. -->
            <span class="tick" aria-hidden="true">{theme === current ? '✓' : ''}</span>
          </label>
        {/each}
      </fieldset>
    </div>
  {/if}
</div>

<style>
  /* Deliberately not positioned, like the identity chip: the popover anchors to the top
     bar's column (TopBar's `.inner`) and opens flush with its right edge. */
  .picker {
    display: flex;
    flex: none;
  }

  .popover {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    width: min(20rem, 100vw - 2rem);
    padding: 0.75rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: none;
    display: grid;
    gap: 0.4rem;
  }

  legend {
    padding: 0;
    margin-bottom: 0.4rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    margin: 0;
    padding: 0.45rem;
    border: var(--border-width) solid transparent;
    border-radius: var(--radius);
    color: var(--ink);
    font-size: 0.95rem;
    cursor: pointer;
  }

  .option:hover {
    border-color: var(--line);
  }

  .option.selected {
    border-color: var(--accent);
  }

  .option:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* The radio is the keyboard's way in — arrows move through the themes — and the row
     around it is what the eye reads, so the circle itself is not drawn. */
  input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
  }

  /* Everything from here to .gem resolves against the swatch's own data-theme. */
  .swatch {
    flex: none;
    display: flex;
    align-items: flex-end;
    width: 4.5rem;
    height: 3rem;
    padding: 0.35rem 0 0 0.45rem;
    overflow: hidden;
    background-color: var(--bg);
    background-image: var(--texture-bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .swatch-panel {
    display: grid;
    grid-template-columns: auto 1fr;
    align-content: start;
    gap: 0.2rem 0.35rem;
    width: 100%;
    height: 100%;
    padding: 0.6rem 0.35rem 0.25rem;
    background-color: var(--panel);
    background-image: var(--texture-panel);
    background-repeat: repeat-x;
    border: var(--border-width) solid var(--line);
    border-right: none;
    border-bottom: none;
    border-radius: var(--radius) 0 0 0;
  }

  .swatch-text {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
  }

  .swatch-accent {
    align-self: center;
    height: 0.45rem;
    background: var(--accent);
    border-radius: min(var(--radius), 3px);
  }

  .swatch-gems {
    grid-column: 1 / -1;
    display: flex;
    gap: 0.15rem;
  }

  .gem {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: min(var(--radius), 2px);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .sapphire {
    background: var(--gem-sapphire);
  }

  .emerald {
    background: var(--gem-emerald);
  }

  .ruby {
    background: var(--gem-ruby);
  }

  .red-topaz {
    background: var(--gem-red-topaz);
  }

  .dragonstone {
    background: var(--gem-dragonstone);
  }

  .words {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    line-height: 1.3;
  }

  .theme-name {
    font-weight: 600;
  }

  .mood {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .tick {
    flex: none;
    width: 1rem;
    color: var(--accent);
    font-weight: 700;
    text-align: center;
  }
</style>
