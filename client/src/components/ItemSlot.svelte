<script lang="ts">
  /**
   * Your one inventory square at the head of the table column: the item's icon, its name,
   * what it does and when it goes. On the standings it is "You found", and the square is
   * the Mystery Box opening, its words arriving as the box does. An item used on the question
   * shows what it did in its line's place, its square spent, until the reveal ends.
   */
  import { afterUse, itemLine, itemName } from '../lib/heldItems'
  import type { HeldItem } from '../lib/protocol'
  import ItemIcon from './ItemIcon.svelte'
  import MysteryBox, { BOX_OPEN_MS } from './MysteryBox.svelte'

  let {
    held,
    last,
    title = null,
    box = null,
    bare = false,
    used = false,
  }: {
    held: HeldItem
    /** "Gone after this round", or the next round's name on the standings. */
    last: string
    title?: string | null
    /** The box opening in the square, with the screen's `opening` and `instant`. */
    box?: { opening: boolean; instant: boolean } | null
    /** No panel of its own: inside a sheet that already is one. */
    bare?: boolean
    /** Used on this question. */
    used?: boolean
  } = $props()

  const id = $props.id()
  const late = $derived(box !== null && !box.instant)
</script>

<section
  class="item-slot"
  class:panel={!bare}
  aria-labelledby={title === null ? undefined : `${id}-title`}
  aria-label={title === null ? 'Your item' : undefined}
>
  {#if title !== null}<h2 id="{id}-title">{title}</h2>{/if}
  <div class="held">
    <span class="square" class:big={box !== null} class:spent={used}>
      {#if box !== null}
        <MysteryBox
          item={held.id}
          charges={held.charges}
          opening={box.opening}
          instant={box.instant}
          size={64}
        />
      {:else}
        <ItemIcon id={held.id} charges={held.charges} size={36} label="" />
      {/if}
      {#if held.charges !== null && (box === null || !late || box.opening)}
        <span class="charges" class:late aria-hidden="true">{held.charges}</span>
      {/if}
    </span>
    <div
      class="words"
      class:late
      class:waiting={box !== null && !box.opening && !box.instant}
      style:--after="{BOX_OPEN_MS}ms"
    >
      <p class="name">{itemName(held.id, held.charges)}</p>
      <p class="line">{used ? afterUse(held.id) : itemLine(held.id)}</p>
      <p class="last">{last}</p>
    </div>
  </div>
</section>

<style>
  .item-slot {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .held {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
  }

  .square {
    position: relative;
    display: grid;
    place-items: center;
    width: 3.25rem;
    height: 3.25rem;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-raised);
  }

  .square.spent > :global(*) {
    opacity: 0.45;
  }

  .square.big {
    width: 5.5rem;
    height: 5.5rem;
  }

  /* Top left, where the game puts a stack's count. */
  .charges {
    position: absolute;
    top: 0.1rem;
    left: 0.25rem;
    font-family: var(--font-numeric);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
  }

  p {
    margin: 0;
  }

  .name {
    font-weight: 700;
  }

  .line {
    font-size: 0.9rem;
    line-height: 1.35;
  }

  .last {
    margin-top: 0.2rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .waiting {
    visibility: hidden;
  }

  .late {
    opacity: 0;
    animation: arrive 300ms ease-out var(--after) forwards;
  }

  @keyframes arrive {
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .late {
      opacity: 1;
      animation: none;
    }
  }
</style>
