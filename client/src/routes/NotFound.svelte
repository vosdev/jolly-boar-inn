<script lang="ts">
  /**
   * A path no screen answers to. The server already sends it with a 404; this says so in the
   * inn's voice and sends the player back to Home, rather than drawing Home at the wrong address.
   */
  import DialogueBox from '../components/DialogueBox.svelte'

  let { navigate }: { navigate: (to: string) => void } = $props()
</script>

<section class="lost">
  <h1 class="sr">Page not found</h1>
  <DialogueBox npc="wise_old_man" name="Wise Old Man">
    <p>You've wandered off the map. Nothing here but goblins.</p>
  </DialogueBox>
  <div class="row">
    <button type="button" class="primary" onclick={() => navigate('/')}>Back to the inn</button>
  </div>
</section>

<style>
  .lost {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 36rem;
    margin: 2rem auto 0;
  }

  .lost p {
    margin: 0;
  }

  .row {
    justify-content: center;
  }
</style>
