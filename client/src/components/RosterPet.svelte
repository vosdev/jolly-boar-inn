<script lang="ts">
  /**
   * One player in a ready check's grid, the lobby's and the splash's alike: their pet with
   * their name under it.
   *
   * Three states, each told by more than a hue so it survives every theme and a player who
   * cannot tell the theme's hues apart: an away player's pet fades to grey, a connected
   * one is drawn whole, and a ready one also carries a tick and is named in `--ok`. The
   * room's TV is never ready: a screen sits where its tick would.
   */
  import { shownItems } from '../lib/heldItems'
  import { petOf } from '../lib/pets'
  import type { PlayerView } from '../lib/protocol'
  import Pet from './Pet.svelte'
  import WornItem from './WornItem.svelte'

  let { player, status = '' }: { player: PlayerView; status?: string } = $props()

  const ready = $derived(player.ready === true)
  const tv = $derived(player.role === 'tv')
  const held = $derived($shownItems.get(player.id) ?? player.item ?? null)
</script>

<span
  class="roster-pet"
  class:lit={ready}
  class:away={!player.connected}
  class:editing={player.editing === true}
>
  <span class="face">
    <Pet pet={petOf(player)} size={48} label="" />
    {#if tv}
      <svg class="badge screen" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3.5" y="4.5" width="9" height="6" rx="0.8" />
        <path d="M6 12.5h4" />
      </svg>
    {:else if ready && player.connected}
      <svg class="badge tick" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 8.5l2.5 2.5L12 5.5" />
      </svg>
    {/if}
    {#if held !== null}<WornItem {held} />{/if}
  </span>
  <span class="pet-name">{player.display_name}</span>
  {#if status !== ''}<span class="status">{status}</span>{/if}
  <span class="sr">{tv ? 'TV' : ready ? 'ready' : 'not ready'}</span>
</span>

<style>
  .roster-pet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    width: 100%;
    padding: 0.2rem 0;
    color: var(--ink);
    transition: color 200ms ease-out;
  }

  .face {
    position: relative;
    display: inline-flex;
  }

  /* Over the pet's corner, ringed in the panel so it stands off any pet's colours. */
  .badge {
    position: absolute;
    right: -0.35rem;
    bottom: -0.15rem;
    width: 1.2rem;
    height: 1.2rem;
    border: 2px solid var(--panel);
    border-radius: 50%;
    background: var(--ok);
    fill: none;
    stroke: var(--ok-ink);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* The panel's own ink and not `--ok`, since the TV is not ready, just watching. */
  .screen {
    background: var(--ink);
    stroke: var(--panel);
    stroke-width: 1.6;
  }

  /* Opacity and not colour, so an away pet reads the same in every theme. The name is
     dimmed by ink instead, so it keeps its contrast. */
  .face > :global(.pet) {
    transition:
      opacity 200ms ease-out,
      filter 200ms ease-out;
  }

  .lit {
    color: var(--ok);
  }

  /* After .lit: a ready player who has left is away first, since nobody counts them. */
  .away {
    color: var(--muted);
  }

  .away .face > :global(.pet) {
    opacity: 0.3;
    filter: grayscale(1);
  }

  /* Up to 12 characters, wrapped in a narrow tile, so two lines before it is cut off. */
  .pet-name {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    overflow-wrap: anywhere;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-size: 0.75rem;
    line-height: 1.2;
    text-align: center;
  }

  .status {
    font-size: 0.7rem;
    line-height: 1.2;
    color: var(--muted);
    text-align: center;
  }

  .editing .status {
    font-style: italic;
  }

  @media (prefers-reduced-motion: reduce) {
    .roster-pet,
    .face > :global(.pet) {
      transition: none;
    }
  }
</style>
