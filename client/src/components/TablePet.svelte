<script lang="ts">
  /**
   * One player in the table panel: their pet with their whole name under it, wrapped when
   * it is too wide for its column, yours in bold.
   *
   * An away player's pet fades to grey and says "away"; the TV carries a screen on its
   * corner, and a found item sits on its shoulder. Which half a pet sits in says the rest,
   * so there is no tick here.
   */
  import { shownItems } from '../lib/heldItems'
  import { petOf } from '../lib/pets'
  import type { PlayerView } from '../lib/protocol'
  import Pet from './Pet.svelte'
  import WornItem from './WornItem.svelte'

  let {
    player,
    you = false,
    status = '',
  }: { player: PlayerView; you?: boolean; status?: string } = $props()

  const held = $derived($shownItems.get(player.id) ?? player.item ?? null)
</script>

<span class="table-pet" class:you class:away={!player.connected}>
  <span class="face">
    <Pet pet={petOf(player)} size={48} label="" />
    {#if player.role === 'tv'}
      <svg class="screen" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3.5" y="4.5" width="9" height="6" rx="0.8" />
        <path d="M6 12.5h4" />
      </svg>
    {/if}
    {#if held !== null}<WornItem {held} />{/if}
  </span>
  <span class="pet-name" title={player.display_name}>{player.display_name}</span>
  {#if status !== ''}<span class="status" class:editing={player.editing === true}>{status}</span
    >{/if}
</span>

<style>
  .table-pet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    min-width: 0;
    width: 100%;
  }

  .face {
    position: relative;
    display: inline-flex;
  }

  .face > :global(.pet) {
    transition:
      opacity 200ms ease-out,
      filter 200ms ease-out;
  }

  /* Opacity and not colour, so an away pet reads the same in every theme. */
  .away .face > :global(.pet) {
    opacity: 0.3;
    filter: grayscale(1);
  }

  .screen {
    position: absolute;
    right: -0.35rem;
    bottom: -0.15rem;
    width: 1.2rem;
    height: 1.2rem;
    border: 2px solid var(--panel);
    border-radius: 50%;
    background: var(--ink);
    fill: none;
    stroke: var(--panel);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Never cut: a name too wide for a third of the panel breaks onto a second line, even
     mid-word, since twelve W's have no gap to break at. */
  .pet-name {
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: center;
    font-size: 0.72rem;
    line-height: 1.25;
    color: var(--muted);
  }

  .you .pet-name {
    color: var(--ink);
    font-weight: 700;
  }

  .status {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.7rem;
    line-height: 1.2;
    color: var(--muted);
  }

  .editing {
    font-style: italic;
  }

  @media (prefers-reduced-motion: reduce) {
    .face > :global(.pet) {
      transition: none;
    }
  }
</style>
