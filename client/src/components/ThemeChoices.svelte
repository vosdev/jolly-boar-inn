<script lang="ts">
  /**
   * The menu's Theme section (section 1 of ideas/design.md): a grid of emblem tiles, the
   * chosen one ringed.
   *
   * One tile per theme `app.css` defines — `THEMES`, which a test holds to the stylesheet —
   * then the themes still to come, disabled, so players see what is on its way. Nothing
   * else: no "follow my device", because nothing in this app follows the device. A
   * browser that has never chosen is on `jolly`, and the grid says so.
   *
   * A list of rows grew a full row per theme and pushed the menu past a phone's height, so
   * the tiles sit four abreast and only the chosen theme's name is written out, under them.
   * Every tile still carries its name for a screen reader. The wide sheet has the room to
   * write every name under its own tile, five abreast (`named`).
   *
   * Each emblem sits on a tile carrying its own `data-theme`, so the tile is that theme's
   * panel and the mark is in that theme's accent, whatever the page is painted in.
   *
   * Picking one repaints at once and the menu stays open, so a player can walk through the
   * themes with the arrow keys and see each on the real screen behind it. Nothing but
   * `data-theme` on <html> changes, so nothing remounts: a question stays open and its
   * timer keeps running on the server's clock.
   */
  import { EMBLEMS, isBuilt, UNBUILT_THEMES, type EmblemId } from '../lib/emblems'
  import { THEME_LABELS, type Theme } from '../lib/theme'
  import Emblem from './Emblem.svelte'

  let {
    current,
    onpick,
    named = false,
  }: { current: Theme; onpick: (theme: Theme) => void; named?: boolean } = $props()

  function nameOf(theme: EmblemId): string {
    return isBuilt(theme) ? THEME_LABELS[theme].name : UNBUILT_THEMES[theme]
  }
</script>

<fieldset>
  <legend class="section-title">Theme</legend>
  <div class="grid" class:named>
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
        <span class="name" class:sr={!named}>{nameOf(theme)}</span>
      </label>
    {/each}
  </div>
  {#if !named}
    <p class="current" aria-hidden="true">{THEME_LABELS[current].name}</p>
  {/if}
</fieldset>

<style>
  fieldset {
    margin: 0;
    padding: 0;
    border: none;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.3rem;
  }

  .grid.named {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .option {
    position: relative;
    display: grid;
    justify-items: center;
    margin: 0;
    padding: 0.3rem 0;
    border: var(--border-width) solid transparent;
    border-radius: var(--radius);
    color: var(--ink);
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

  /* The radio is the keyboard's way in — arrows move through the themes — and the tile
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
    width: 2.75rem;
    height: 2.75rem;
    padding: 0.35rem;
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
  }

  .name:not(.sr) {
    margin-top: 0.3rem;
    padding-inline: 0.15rem;
    font-size: 0.8rem;
    line-height: 1.2;
    text-align: center;
  }

  .selected .name {
    font-weight: 600;
  }

  .current {
    margin: 0.4rem 0 0;
    font-size: 0.95rem;
    font-weight: 600;
    text-align: center;
  }
</style>
