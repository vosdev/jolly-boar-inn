<script lang="ts">
  /**
   * The menu's Theme section (section 1 of ideas/design.md): one row per theme, its emblem
   * on the left and its name on the right, the chosen one ringed.
   *
   * One row per theme `app.css` defines — `THEMES`, which a test holds to the stylesheet —
   * then the themes still to come, disabled, so players see what is on its way. Nothing
   * else: no "follow my device", because nothing in this app follows the device. A
   * browser that has never chosen is on `jolly`, and the list says so.
   *
   * Each emblem sits on a tile carrying its own `data-theme`, so the tile is that theme's
   * panel and the mark is in that theme's accent, whatever the page is painted in.
   *
   * Picking one repaints at once and the menu stays open, so a player can walk through the
   * themes with the arrow keys and see each on the real screen behind it. Nothing but
   * `data-theme` on <html> changes, so nothing remounts: a question stays open and its
   * timer keeps running on the server's clock.
   */
  import { EMBLEMS, isBuilt, UNBUILT_THEMES } from '../lib/emblems'
  import { THEME_LABELS, type Theme } from '../lib/theme'
  import Emblem from './Emblem.svelte'

  let { current, onpick }: { current: Theme; onpick: (theme: Theme) => void } = $props()
</script>

<fieldset>
  <legend class="section-title">Theme</legend>
  {#each EMBLEMS as theme (theme)}
    {@const built = isBuilt(theme)}
    <label class="option" class:selected={theme === current} class:unbuilt={!built}>
      <input
        type="radio"
        name="theme"
        value={theme}
        disabled={!built}
        checked={theme === current}
        onchange={() => isBuilt(theme) && onpick(theme)}
      />
      <span class="tile" data-theme={theme} aria-hidden="true"><Emblem {theme} /></span>
      <span class="theme-name">
        {isBuilt(theme) ? THEME_LABELS[theme].name : UNBUILT_THEMES[theme]}
      </span>
    </label>
  {/each}
</fieldset>

<style>
  fieldset {
    margin: 0;
    padding: 0;
    border: none;
    display: grid;
    gap: 0.3rem;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    margin: 0;
    padding: 0.35rem;
    border: var(--border-width) solid transparent;
    border-radius: var(--radius);
    color: var(--ink);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }

  .option:hover:not(.unbuilt) {
    border-color: var(--line);
  }

  .option.unbuilt {
    opacity: 0.55;
    cursor: default;
  }

  .option.selected {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
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

  /* Resolves against the tile's own data-theme, not the page's. Plain panel, without
     the texture, which is busier than a 32px mark can stand against. */
  .tile {
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0.35rem;
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
  }
</style>
