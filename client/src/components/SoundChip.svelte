<script lang="ts">
  /**
   * The TV's reminder that its browser still blocks sound: nobody plays on the TV, so it
   * may never be touched after a reload. Any tap or key press unlocks it (`lib/audio.ts`);
   * the chip is only where to aim.
   */
  import { unlocked } from '../lib/audio'
</script>

{#if !$unlocked}
  <button type="button" class="sound-chip">Tap for sound</button>
{/if}

<style>
  .sound-chip {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 20;
    font-size: 0.85rem;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.25);
  }
</style>
