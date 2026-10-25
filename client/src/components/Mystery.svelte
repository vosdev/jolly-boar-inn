<!--
  The "?" square that stands for a host nobody may know yet: a random event's on Create,
  a shuffled or hidden round's on the splash. It fills whatever box its parent gives it.
-->
<span class="mystery" aria-hidden="true">?</span>

<style>
  .mystery {
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border: var(--border-width) dashed var(--line);
    border-radius: min(var(--radius), 6px);
    color: var(--muted);
    font-weight: 800;
    font-size: 1.2rem;
  }
</style>
