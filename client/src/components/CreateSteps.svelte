<script lang="ts">
  /**
   * Where Create is: one bar per step, filled up to the current one. Not buttons: the
   * footer's Back and Next move between steps, so there is one way to do it.
   */
  let { steps, current }: { steps: string[]; current: number } = $props()
</script>

<ol class="steps" aria-label="Steps">
  {#each steps as step, index (step)}
    <li class:done={index <= current} aria-current={index === current ? 'step' : undefined}>
      {index + 1} · {step}
    </li>
  {/each}
</ol>

<style>
  .steps {
    display: flex;
    gap: 0.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }

  li::before {
    content: '';
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--line) 40%, var(--panel));
  }

  li.done::before {
    background: var(--accent);
  }

  li[aria-current='step'] {
    color: var(--ink);
  }
</style>
