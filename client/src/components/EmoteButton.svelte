<script lang="ts">
  /**
   * The Emotes button and the emote tab it opens: a panel of the theme's with the eight
   * icons, each named for a screen reader and on hover, and by name alone where its icon was
   * never fetched. A pick sends it and closes the tab; Escape or a tap outside closes it too.
   *
   * After a send the button is held for `EMOTE_MS` while a shade drains across it, left to
   * right, from when the server's `emote` frame lands; until then it is held from the tap,
   * and let go again if no frame comes.
   *
   * The icons are pixel art, so they are drawn at their own size: scaled, they blur or lose
   * a row of pixels. The button is the game's own Emotes
   * button and nothing else.
   *
   * `strip` pins it to the left end of a phone's strip, with the tab over the strip.
   */
  import { dismissable } from '../lib/dismissable'
  import { EMOTE_MS, EMOTES, emoteIcon, yourEmoteAt, type EmoteId } from '../lib/emotes'

  let { send, strip = false }: { send: (emote: EmoteId) => boolean; strip?: boolean } = $props()

  const face = emoteIcon('button')

  let open = $state(false)
  let button = $state<HTMLButtonElement | null>(null)
  let pending = $state(false)
  let pendingTimer: ReturnType<typeof setTimeout> | undefined
  /** When the cooldown being shown began, or null outside one. */
  let cooling = $state<number | null>(null)

  $effect(() => {
    const at = $yourEmoteAt
    if (at === null) return
    pending = false
    clearTimeout(pendingTimer)
    const left = at + EMOTE_MS - Date.now()
    if (left <= 0) return
    cooling = at
    const timer = setTimeout(() => (cooling = null), left)
    return () => clearTimeout(timer)
  })

  $effect(() => () => clearTimeout(pendingTimer))

  const held = $derived(pending || cooling !== null)

  function pick(emote: EmoteId): void {
    open = false
    button?.focus()
    if (held || !send(emote)) return
    pending = true
    clearTimeout(pendingTimer)
    pendingTimer = setTimeout(() => (pending = false), EMOTE_MS)
  }
</script>

<div class="emotes" class:strip>
  {#if open}
    <div
      class="tab"
      role="dialog"
      aria-label="Emotes"
      use:dismissable={{
        open,
        close: (by) => {
          open = false
          if (by === 'escape') button?.focus()
        },
        inside: [button],
      }}
    >
      <ul class="grid">
        {#each EMOTES as emote (emote.id)}
          {@const icon = emoteIcon(emote.id)}
          <li>
            <button
              type="button"
              class="slot"
              aria-label={emote.name}
              title={emote.name}
              onclick={() => pick(emote.id)}
            >
              {#if icon !== null}<img src={icon} alt="" />{:else}{emote.name}{/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
  <button
    type="button"
    class="open"
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label="Emotes"
    disabled={held}
    bind:this={button}
    onclick={() => (open = !open)}
  >
    {#key cooling}{#if cooling !== null}<span class="drain" aria-hidden="true"></span>{/if}{/key}
    {#if face !== null}<img src={face} alt="" />{:else}<span class="label">Emotes</span>{/if}
  </button>
</div>

<style>
  /* At the right of its row, so the tab, which opens leftwards from there, stays inside the
     panel: the table column scrolls and would cut off what passes its edge. */
  .emotes {
    --emotes-size: 44px;
    position: relative;
    align-self: flex-end;
    margin-left: auto;
    display: flex;
    align-items: center;
  }

  /* A square: 44px at the table, the strip's 52px on a phone. */
  .open {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--emotes-size);
    height: var(--emotes-size);
    min-height: 0;
    padding: 0;
    overflow: hidden;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
  }

  .open img,
  .slot img {
    image-rendering: pixelated;
  }

  .label {
    font-size: 0.65rem;
  }

  .open:disabled img {
    opacity: 0.5;
  }

  .drain {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--ink) 30%, transparent);
    transform-origin: right;
    animation: drain 3s linear both;
    pointer-events: none;
  }

  @keyframes drain {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }

  .tab {
    position: absolute;
    right: 0;
    bottom: calc(100% + 0.5rem);
    z-index: 10;
    width: min(16.5rem, calc(100vw - 1.5rem));
    padding: 0.4rem;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .slot {
    display: grid;
    place-items: center;
    width: 100%;
    height: 56px;
    min-height: 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-raised);
    box-shadow: none;
    color: var(--ink);
    font: inherit;
    font-size: 0.8rem;
  }

  .slot:hover {
    border-color: var(--accent);
  }

  /* A phone's strip: a square at its left end, like the item's at its right. */
  .strip {
    --emotes-size: 52px;
    position: fixed;
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
    left: 0.75rem;
    z-index: 6;
  }

  .strip .open {
    box-shadow: var(--shadow);
  }

  .strip .tab {
    position: fixed;
    right: 0.75rem;
    bottom: calc(0.75rem + var(--emotes-size) + 0.5rem + env(safe-area-inset-bottom));
    left: 0.75rem;
    width: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .drain {
      animation: none;
    }
  }
</style>
