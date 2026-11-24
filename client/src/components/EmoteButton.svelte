<script lang="ts">
  /**
   * The Emotes button and the game's emote tab it opens: a stone panel of eight, each
   * icon over its name in Quill orange. A pick sends it and closes the tab; Escape or a tap
   * outside closes it too.
   *
   * After a send the button is held for `EMOTE_MS` while a shade drains across it, left to
   * right, from when the server's `emote` frame lands; until then it is held from the tap,
   * and let go again if no frame comes. A desktop says the limit under it.
   *
   * `strip` pins it to the left end of a phone's strip, with the tab over the strip.
   */
  import { dismissable } from '../lib/dismissable'
  import { EMOTE_MS, EMOTES, emoteIcon, yourEmoteAt, type EmoteId } from '../lib/emotes'
  import { roomShown } from '../lib/roomFit'

  let { send, strip = false }: { send: (emote: EmoteId) => boolean; strip?: boolean } = $props()

  const cheer = emoteIcon('cheer')
  const desktop = $derived($roomShown !== null)

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
            <button type="button" class="slot" onclick={() => pick(emote.id)}>
              {#if icon !== null}<img src={icon} alt="" />{/if}
              <span>{emote.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
  <button
    type="button"
    class="open"
    class:bare={cheer === null}
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={strip ? 'Emotes' : undefined}
    aria-describedby={desktop && !strip ? 'emote-limit' : undefined}
    disabled={held}
    bind:this={button}
    onclick={() => (open = !open)}
  >
    {#key cooling}{#if cooling !== null}<span class="drain" aria-hidden="true"></span>{/if}{/key}
    {#if cheer !== null}<img src={cheer} alt="" />{/if}
    {#if !strip || cheer === null}<span class="label">Emotes</span>{/if}
  </button>
  {#if desktop && !strip}<p class="limit" id="emote-limit">One every 3 seconds.</p>{/if}
</div>

<style>
  .emotes {
    position: relative;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 0.6rem;
  }

  .open {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    overflow: hidden;
  }

  .open img {
    height: 26px;
    image-rendering: pixelated;
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

  .limit {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  /* The game's emote tab: its stone and its orange. */
  .tab {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 0;
    z-index: 10;
    width: min(16.5rem, calc(100vw - 1.5rem));
    padding: 8px;
    border: 2px solid var(--emote-tab-edge);
    border-radius: 4px;
    background: var(--emote-tab);
    box-shadow:
      inset 0 0 0 1px var(--emote-tab-rim),
      0 6px 18px rgb(18 12 4 / 0.45);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    width: 100%;
    height: 68px;
    min-height: 0;
    padding: 0 0 5px;
    border: 1px solid var(--emote-slot-edge);
    border-radius: 2px;
    background: var(--emote-slot);
    box-shadow: none;
    font: inherit;
  }

  .slot:hover {
    background: var(--emote-slot-hover);
  }

  .slot:focus-visible {
    outline: 2px solid var(--emote-name);
    outline-offset: 1px;
  }

  .slot img {
    max-height: 40px;
    image-rendering: pixelated;
  }

  .slot span {
    font-family: 'RuneScape', var(--font-body);
    font-size: 16px;
    line-height: 1;
    color: var(--emote-name);
    text-shadow: 1px 1px 0 var(--chat-outline);
  }

  /* A phone's strip: a square at its left end, like the item's at its right. */
  .strip {
    position: fixed;
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
    left: 0.75rem;
    z-index: 6;
  }

  .strip .open {
    justify-content: center;
    width: 52px;
    height: 52px;
    padding: 0;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .strip .open img {
    height: 30px;
  }

  .strip .open.bare .label {
    font-size: 0.65rem;
  }

  .strip .tab {
    position: fixed;
    right: 0.75rem;
    bottom: calc(0.75rem + 52px + 0.5rem + env(safe-area-inset-bottom));
    left: 0.75rem;
    width: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .drain {
      animation: none;
    }
  }
</style>
