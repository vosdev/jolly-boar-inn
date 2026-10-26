<script lang="ts">
  /**
   * The progress line at the top of a suggestion editor: each step's number or checkmark,
   * whether it is optional, and a red mark when the player tries to send with it incomplete.
   */
  import type { SuggestStep } from '../../lib/suggestions'

  let { steps }: { steps: readonly SuggestStep[] } = $props()
</script>

<ol class="progress-line" aria-label="Steps">
  {#each steps as step, index (step.title)}
    {#if index > 0}
      <li
        class="connector"
        class:done={steps[index - 1]?.done && (step.done || step.optional)}
        aria-hidden="true"
      ></li>
    {/if}
    <li
      class="node"
      class:done={step.done}
      class:missing={step.missing}
      class:optional={step.optional}
    >
      <span class="dot" aria-hidden="true">
        {step.done ? '✓' : step.missing ? '!' : index + 1}
      </span>
      <span class="label">
        {step.title}
        {#if step.optional}
          <span class="opt">(optional)</span>
        {/if}
      </span>
    </li>
  {/each}
</ol>

<style>
  .progress-line {
    display: flex;
    align-items: center;
    list-style: none;
    margin: 0 0 1rem;
    padding: 0.55rem 0.85rem;
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    overflow-x: auto;
  }

  .node {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex: none;
  }

  .connector {
    flex: 1 1 1.5rem;
    min-width: 1rem;
    height: 2px;
    margin: 0 0.55rem;
    background: color-mix(in srgb, var(--line) 45%, transparent);
    transition: background-color 150ms ease;
  }

  .connector.done {
    background: var(--ok);
  }

  .dot {
    width: 1.45rem;
    height: 1.45rem;
    border-radius: 50%;
    border: 2px solid var(--line);
    background: var(--panel-raised);
    color: var(--muted);
    font-size: 0.76rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  .node.optional:not(.done) .dot {
    border-style: dashed;
  }

  .node.done .dot {
    background: var(--ok);
    border-color: var(--ok);
    color: var(--ok-ink);
  }

  .node.missing .dot {
    background: var(--bad);
    border-color: var(--bad);
    color: var(--bad-ink);
  }

  .label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
  }

  .node.optional:not(.done) .label {
    color: var(--muted);
    font-weight: 500;
  }

  .node.done .label {
    color: var(--ok);
  }

  .node.missing .label {
    color: var(--bad);
  }

  .opt {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 400;
  }
</style>
