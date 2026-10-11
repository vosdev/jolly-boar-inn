<script lang="ts">
  /** Where Create is: one bar per step, filled up to the current one; each one goes to its step. */
  let {
    steps,
    current,
    onpick,
  }: { steps: string[]; current: number; onpick: (index: number) => void } = $props()
</script>

<ol class="steps" aria-label="Steps">
  {#each steps as step, index (step)}
    <li class:done={index <= current}>
      <button
        type="button"
        aria-current={index === current ? 'step' : undefined}
        onclick={() => onpick(index)}
      >
        {index + 1} · {step}
      </button>
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
  }

  button {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0 0 0.2rem;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    text-align: left;
    color: var(--muted);
    cursor: pointer;
  }

  button::before {
    content: '';
    align-self: stretch;
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--line) 40%, var(--panel));
  }

  li.done button::before {
    background: var(--accent);
  }

  button[aria-current='step'],
  button:hover {
    color: var(--ink);
  }
</style>
