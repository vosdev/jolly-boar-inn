<script lang="ts">
  /**
   * A daily's score as a ring, filled by the share of full-credit answers. The number
   * beside or inside it carries the score, so the ring is decoration to a screen reader.
   */
  let {
    correct,
    total,
    small = false,
  }: {
    correct: number
    total: number
    /** A row's ring: only the right answers in it, the total stands beside it. */
    small?: boolean
  } = $props()
</script>

<span class="ring" class:small aria-hidden="true">
  <svg viewBox="0 0 48 48">
    <circle class="track" cx="24" cy="24" r="20" />
    {#if correct > 0}
      <circle
        class="arc"
        cx="24"
        cy="24"
        r="20"
        pathLength={total}
        stroke-dasharray={`${correct} ${total}`}
      />
    {/if}
  </svg>
  {small ? correct : `${correct}/${total}`}
</span>

<style>
  .ring {
    position: relative;
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 58px;
    height: 58px;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .ring.small {
    width: 40px;
    height: 40px;
    font-size: 0.875rem;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  circle {
    fill: none;
    stroke-width: 5;
  }

  .track {
    stroke: currentColor;
    opacity: 0.2;
  }

  .arc {
    stroke: var(--accent);
    stroke-linecap: round;
  }
</style>
