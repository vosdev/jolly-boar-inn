<script lang="ts">
  /**
   * One bordered step card inside `/suggest`: its step number or checkmark, title, optional
   * badge, and a coloured border when completed or missing on submit.
   */
  import type { Snippet } from 'svelte'
  import type { SuggestStep } from '../../lib/suggestions'

  let {
    number,
    step,
    children,
  }: {
    number: number
    step: SuggestStep
    children: Snippet
  } = $props()

  const id = $props.id()
</script>

<div
  class="step-card"
  class:done={step.done}
  class:missing={step.missing}
  class:optional={step.optional}
  role="group"
  aria-labelledby="{id}-title"
>
  <div class="step-head">
    <div class="step-head-left">
      <span class="step-badge" aria-hidden="true">
        {step.done ? '✓' : step.missing ? '!' : number}
      </span>
      <span id="{id}-title" class="step-title">{step.title}</span>
    </div>
    {#if step.optional}
      <span class="tag">Optional</span>
    {/if}
  </div>
  {@render children()}
</div>

<style>
  .step-card {
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel);
    padding: 0.85rem 1rem;
    margin-bottom: 0.85rem;
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease;
  }

  .step-card.optional:not(.done) {
    border-style: dashed;
  }

  .step-card.done {
    border-color: var(--ok);
  }

  .step-card.missing {
    border-color: var(--bad);
    box-shadow: inset 0 0 0 1px var(--bad);
  }

  .step-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.7rem;
  }

  .step-head-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .step-badge {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 2px solid var(--line);
    background: var(--panel-raised);
    color: var(--muted);
    font-size: 0.78rem;
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

  .step-card.optional:not(.done) .step-badge {
    border-style: dashed;
  }

  .step-card.done .step-badge {
    background: var(--ok);
    border-color: var(--ok);
    color: var(--ok-ink);
  }

  .step-card.missing .step-badge {
    background: var(--bad);
    border-color: var(--bad);
    color: var(--bad-ink);
  }

  .step-title {
    font-weight: 700;
    font-size: 0.96rem;
    color: var(--ink);
  }

  .step-card.missing .step-title {
    color: var(--bad);
  }

  .tag {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    line-height: 1.3;
    white-space: nowrap;
  }

  .step-card :global(> .field:last-child),
  .step-card :global(> fieldset.field:last-child) {
    margin-bottom: 0;
  }
</style>
