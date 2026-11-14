<script lang="ts">
  /**
   * Tonight's rounds in the lobby, a card each: its host, its name and its length, A–Z by
   * name, which is deliberately not the order they play in: what is coming is the game's to
   * reveal, one splash at a time, and the host arranged that order (or handed it to `random`)
   * on the way in. A secret room's cards are all "A surprise".
   *
   * Up to 8 rounds show as cards; from 9 the eighth tile is "+N more", a button that opens
   * every round as the same cards in a popover (Escape, a click outside or the button closes
   * it), so the panel does not outgrow the stage. The popover sits over the nearest
   * positioned box, the lobby's board.
   */
  import { tick } from 'svelte'

  import { dismissable, type Dismissed } from '../lib/dismissable'
  import { hostOf, modeLabel } from '../lib/modes'
  import type { ModeSettings } from '../lib/protocol'
  import NpcFace from './NpcFace.svelte'

  let {
    modes,
    secret,
    rounds,
  }: {
    modes: ModeSettings[]
    secret: boolean
    /** How many rounds a secret room holds, which its `modes` do not say. */
    rounds: number
  } = $props()

  /** The most cards the panel shows; past it the last tile folds the rest away. */
  const CARDS_MAX = 8

  const listed = $derived(
    [...modes].sort((a, b) => modeLabel(a.mode).localeCompare(modeLabel(b.mode))),
  )
  const cards = $derived(
    secret
      ? Array.from({ length: rounds }, (_, index) => ({
          key: String(index),
          npc: undefined as string | undefined,
          name: 'A surprise',
          questions: null as number | null,
        }))
      : listed.map((round) => ({
          key: round.mode,
          npc: hostOf(round.mode).host.id as string | undefined,
          name: modeLabel(round.mode),
          questions: round.questions as number | null,
        })),
  )
  const folded = $derived(cards.length > CARDS_MAX)
  const shown = $derived(folded ? cards.slice(0, CARDS_MAX - 1) : cards)
  // Closed again whenever the list folds or unfolds; a tap opens it in between.
  let showAll = $derived.by(() => {
    void folded
    return false
  })
  let foldButton = $state<HTMLButtonElement | null>(null)

  function dismissed(by: Dismissed): void {
    showAll = false
    if (by === 'escape') void tick().then(() => foldButton?.focus())
  }
</script>

<ul class="rounds">
  {#each shown as card (card.key)}
    {@render round(card)}
  {/each}
  {#if folded}
    <li class="fold">
      <button
        bind:this={foldButton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={showAll}
        onclick={() => (showAll = !showAll)}
      >
        +{cards.length - shown.length} more
      </button>
    </li>
  {/if}
</ul>
{#if showAll}
  <div
    class="all"
    role="dialog"
    aria-label="All rounds"
    use:dismissable={{ open: showAll, close: dismissed, inside: [foldButton] }}
  >
    <ul class="rounds">
      {#each cards as card (card.key)}
        {@render round(card)}
      {/each}
    </ul>
  </div>
{/if}

{#snippet round(card: { npc: string | undefined; name: string; questions: number | null })}
  <li class="round">
    <span class="face"><NpcFace npc={card.npc} /></span>
    <span class="name">{card.name}</span>
    {#if card.questions !== null}
      <span class="aside">
        {card.questions}
        {card.questions === 1 ? 'question' : 'questions'}
      </span>
    {/if}
  </li>
{/snippet}

<style>
  /* The folded round's tile: a card that is one button. */
  .fold {
    display: grid;
  }

  .fold button {
    min-height: 44px;
    border-radius: var(--radius);
    font-weight: 700;
  }

  /* Every round over the list, on the panel's own surface; long, it scrolls. */
  .all {
    position: absolute;
    z-index: 5;
    inset: 2.5rem 0 auto;
    max-height: 24rem;
    overflow-y: auto;
    padding: 0.6rem;
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  /* Three abreast when there is room. */
  .rounds {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .round {
    display: grid;
    grid-template-columns: 3.25rem minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
  }

  .round .face {
    grid-row: 1 / 3;
    display: grid;
    place-items: center;
    width: 3.25rem;
    height: 3.25rem;
  }

  .round .face :global(img) {
    width: 3.25rem;
    max-width: none;
    height: 3.25rem;
    max-height: none;
    object-fit: contain;
  }

  .round .name {
    align-self: end;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .round .face + .name:last-child {
    grid-row: 1 / 3;
    align-self: center;
  }

  .round .aside {
    align-self: start;
  }

  .aside {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
