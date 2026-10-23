<script lang="ts">
  /**
   * The TV's panel on a reveal: the answers with their counts and the tally, faded in
   * once the panel has widened for them and the stage has scaled to its new size (250 ms
   * each), so nothing is read while it moves, and faded off again when `closing`, before
   * the panel narrows.
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
  .in {
    animation: in 200ms ease-out 500ms both;
  }

  .in.closing {
    animation: out 200ms ease-in both;
  }

  @keyframes in {
    from {
      opacity: 0;
    }
  }

  @keyframes out {
    to {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .in {
      animation: none;
    }

    .in.closing {
      opacity: 0;
    }
  }
</style>
