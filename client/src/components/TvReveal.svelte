<script lang="ts">
  /**
   * The TV's panel on a reveal: the answers with their counts and the tally, faded in over
   * the waiting panel's place, and faded off again when `closing`, before the next screen.
   */
  import type { Snippet } from 'svelte'

  let { closing = false, children }: { closing?: boolean; children: Snippet } = $props()
</script>

<section class="panel answers tv-panel">
  <div class="in" class:closing>
    {@render children()}
  </div>
</section>

<style>
  /* The way off is a transition, not an animation: the next screen's hand-over moves this
     node, which would replay an animation and flash the reveal back up. */
  .in {
    animation: in 200ms ease-out;
    transition: opacity 200ms ease-in;
  }

  .in.closing {
    opacity: 0;
  }

  @keyframes in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .in {
      animation: none;
      transition: none;
    }
  }
</style>
