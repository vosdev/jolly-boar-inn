<script lang="ts">
  /**
   * One player in a ready check's grid, the lobby's and the splash's alike: their pet with
   * their name under it.
   *
   * Three states, each told by more than a hue so it survives every theme and a player who
   * cannot tell the theme's hues apart: an away player's pet fades to grey, a connected
   * one is drawn whole, and a ready one is also outlined and named in `--ok`.
   */
  import { petOf } from '../lib/pets'
  import type { PlayerView } from '../lib/protocol'
  import Pet from './Pet.svelte'

  let { player, status = '' }: { player: PlayerView; status?: string } = $props()

  const ready = $derived(player.ready === true)
</script>

<span
  class="roster-pet"
  class:lit={ready}
  class:away={!player.connected}
  class:editing={player.editing === true}
>
  <span class="face">
    <Pet pet={petOf(player)} size={48} label="" />
  </span>
  <span class="pet-name">{player.display_name}</span>
  {#if status !== ''}<span class="status">{status}</span>{/if}
  <span class="sr">{ready ? 'ready' : 'not ready'}</span>
</span>

<style>
  .roster-pet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    width: 100%;
    padding: 0.2rem 0;
    border-radius: min(var(--radius), 8px);
    outline: 2px solid transparent;
    outline-offset: -2px;
    color: var(--ink);
    transition: outline-color 200ms ease-out;
  }

  .face {
    display: inline-flex;
  }

  /* Opacity and not colour, so an away pet reads the same in every theme. The name is
     dimmed by ink instead, so it keeps its contrast. */
  .face > :global(.pet) {
    transition:
      opacity 200ms ease-out,
      filter 200ms ease-out;
  }

  .lit {
    outline-color: var(--ok);
    color: var(--ok);
  }

  /* After .lit: a ready player who has left is away first, since nobody counts them. */
  .away {
    outline-color: transparent;
    color: var(--muted);
  }

  .away .face > :global(.pet) {
    opacity: 0.3;
    filter: grayscale(1);
  }

  /* Up to 24 characters, so two lines before it is cut off. */
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
