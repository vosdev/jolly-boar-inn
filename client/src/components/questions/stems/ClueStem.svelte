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
   * Riddles of the Sphinx's clue ladder: one rung a clue, vaguest first.
   *
   * Every clue is in `data` from the start (architecture section 6), so the ladder shows one a
   * step and keeps the rest as dots: rung k from the k-th step of the mode's `steps`, counted as
   * the server counts them. A hidden rung already takes its clue's height, so a clue that wraps
   * does not grow the stage when it arrives; the clue sits in an attribute drawn invisibly, out
   * of the page's text. The reveal shows every clue.
   */
  import { stepAt } from '../../../lib/samples'
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
</script>

<ol class="ladder" aria-label="Clues">
  {#each clues as clue, index (index)}
    {@const rung = index + 1}
    <li class:now={!revealed && rung === current}>
      {#if revealed || rung <= current}
        <span class="clue">{clue}</span>
      {:else}
        <span class="clue later" data-room={clue} aria-label="Clue {rung}, still hidden">
          <span aria-hidden="true">· · · · ·</span>
        </span>
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
    align-items: center;
    min-height: 2.75rem;
    border-top: 1px dashed color-mix(in srgb, var(--scroll-ink) 45%, transparent);
  }

  li:first-child {
    border-top: 0;
  }

  /* Never the desktop stage's 1.5: five clues at that size wrap to two lines each and leave
     no room for the answer list or the reveal's picture. */
  .clue {
    padding-block: 0.35rem;
    font-size: max(1rem, 1.2rem * min(var(--scroll-text, 1), 1));
    line-height: 1.2;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .later {
    display: grid;
    align-items: center;
    color: var(--scroll-muted);
    letter-spacing: 0.35em;
  }

  .later::before {
    content: attr(data-room);
    visibility: hidden;
    letter-spacing: normal;
  }

  .later::before,
  .later > span {
    grid-area: 1 / 1;
  }

  .now .clue {
    animation: arrive 450ms ease-out;
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
