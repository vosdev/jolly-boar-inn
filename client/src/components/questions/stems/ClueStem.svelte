<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  /** Nothing is typed in the hold: the host's ask line asks, and the clues come in after it. */
  export function lines(): Line[] {
    return []
  }

  /** The question's clues, vaguest first, or none for a payload without. */
  export function cluesOf(data: Record<string, unknown>): string[] {
    const clues = data.clues
    return Array.isArray(clues) ? clues.filter((c): c is string => typeof c === 'string') : []
  }
</script>

<script lang="ts">
  /**
   * Riddles of the Sphinx's clue ladder: one rung a clue, each with what an answer on it pays.
   *
   * Every clue is in `data` from the start (architecture section 6), so the ladder shows one a
   * step and keeps the rest as dots: rung k from the k-th step of the mode's `steps`, counted as
   * the server counts them, so the points a rung shows are the points an answer then earns.
   * Passed rungs strike their points; the current one carries a bar for the time it has left.
   * The reveal shows every clue.
   */
  import { pointsOnStep, stepAt } from '../../../lib/samples'
  import type { StemProps } from '../props'

  let { data, revealed, timing }: StemProps = $props()

  const clues = $derived(cluesOf(data))
  const steps = $derived(timing.steps ?? { build: clues.length - 1, of: clues.length })
  const from = $derived(Date.parse(timing.answerableAt))
  const seconds = $derived((Date.parse(timing.endsAt) - from) / 1000)

  let now = $state(Date.now())
  $effect(() => timing.now.subscribe((value) => (now = value)))

  const elapsed = $derived(Math.max(0, now - from))
  const started = $derived(revealed || now >= from)
  const current = $derived(revealed ? clues.length : started ? stepAt(elapsed, seconds, steps) : 0)
  /** Seconds on the step's clock, for the bar: each a share of the time, the last the rest. */
  const left = $derived.by(() => {
    if (revealed || current === 0) return 0
    const stepMs = (seconds * 1000) / steps.of
    const start = (current - 1) * stepMs
    const end = current > steps.build ? seconds * 1000 : current * stepMs
    return Math.max(0, Math.min(1, (end - elapsed) / (end - start)))
  })
</script>

<ol class="ladder" aria-label="Clues">
  {#each clues as clue, index (index)}
    {@const rung = index + 1}
    {@const shownClue = revealed || rung <= current}
    <li class:past={!revealed && rung < current} class:now={!revealed && rung === current}>
      <span class="points">{pointsOnStep(rung, clues.length)}</span>
      {#if shownClue}
        <span class="clue">{clue}</span>
      {:else}
        <span class="clue later" aria-label="Clue {rung}, still hidden">· · · · ·</span>
      {/if}
      {#if !revealed && rung === current}
        <span class="left" aria-hidden="true"><i style:width="{left * 100}%"></i></span>
      {/if}
    </li>
  {/each}
</ol>

<style>
  .ladder {
    list-style: none;
    margin: 0;
    padding: 0;
    color: var(--scroll-ink);
  }

  li {
    display: grid;
    grid-template-columns: 4.25rem 1fr;
    align-items: center;
    column-gap: 0.75rem;
    min-height: 2.75rem;
    border-top: 1px dashed color-mix(in srgb, var(--scroll-ink) 45%, transparent);
  }

  li:first-child {
    border-top: 0;
  }

  .points {
    justify-self: start;
    padding: 0.1rem 0.45rem;
    border: 2px solid transparent;
    border-radius: 4px;
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-size: max(1rem, 1.15rem * var(--scroll-text, 1));
  }

  .clue {
    padding-block: 0.35rem;
    font-size: max(1rem, 1.2rem * var(--scroll-text, 1));
    line-height: 1.2;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .later {
    color: var(--scroll-muted);
    letter-spacing: 0.35em;
  }

  li:has(.later) .points {
    border-color: var(--scroll-muted);
  }

  .past .points {
    color: var(--scroll-muted);
    text-decoration: line-through;
  }

  .now .points {
    background: var(--scroll-ink);
    color: var(--scroll-paper);
  }

  .now .clue {
    animation: arrive 450ms ease-out;
  }

  .left {
    grid-column: 1;
    height: 3px;
    margin-inline-end: 0.5rem;
    border-radius: 2px;
    background: color-mix(in srgb, var(--scroll-ink) 20%, transparent);
    overflow: hidden;
  }

  .left i {
    display: block;
    height: 100%;
    background: var(--scroll-ink);
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .now .clue {
      animation: none;
    }
  }
</style>
