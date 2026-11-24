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
   * The icons are pixel art, so they are drawn at their own size or a whole multiple of it:
   * scaled otherwise, they blur or lose a row of pixels. The button is the game's own Emotes
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
  let tab = $state<HTMLElement | null>(null)
  /** The tab opens leftwards from the button's right edge where rightwards would not fit. */
  let flip = $state(false)
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

  // The panel holding the button is what scrolls and clips, so the tab has to fit inside it.
  $effect(() => {
    if (tab === null || button === null || strip) return
    const edge = (button.closest('.panel') ?? document.documentElement).getBoundingClientRect()
    flip = button.getBoundingClientRect().left + tab.getBoundingClientRect().width > edge.right
  })

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
      class:flip
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
      bind:this={tab}
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
  .emotes {
    --emotes-size: 60px;
    position: relative;
    display: flex;
    align-items: center;
  }

  /* A square, the same at the table's foot and on a phone's strip. */
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

  /* The button's figure is 18 by 27, too small to tap at its own size: twice it, exactly. */
  .open img {
    width: 36px;
    height: 54px;
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
    bottom: calc(100% + 0.5rem);
    left: 0;
    z-index: 10;
    width: min(16.5rem, calc(100vw - 1.5rem));
    padding: 0.4rem;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow);
  }

  .tab.flip {
    right: 0;
    left: auto;
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
