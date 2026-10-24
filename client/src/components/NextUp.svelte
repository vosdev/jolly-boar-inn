<script lang="ts">
  /**
   * The standings' table panel (section 11 of ideas/design.md): "Next up", the next round's
   * host, its name and question count, and the count to its splash, large at the foot.
   * Stacked on a phone it is a strip at the foot instead, with nothing behind it to open.
   */
  import { msUntil, serverNow } from '../lib/clock'
  import { hostOf, modeLabel } from '../lib/modes'
  import { nextRoundLine } from '../lib/nextUp'
  import type { Segment } from '../lib/protocol'
  import NpcFace from './NpcFace.svelte'

  let {
    segment,
    endsAt,
    stacked = false,
  }: {
    /** The round the standings hand over to, `room.next_segment`. */
    segment: Segment
    /** When the standings end, `room.next_at`. */
    endsAt: string | null
    stacked?: boolean
  } = $props()

  const label = $derived(modeLabel(segment.mode))
  const host = $derived(hostOf(segment.mode).host.id)
  const startsIn = $derived(
    endsAt === null ? null : Math.max(0, Math.ceil(msUntil(endsAt, $serverNow) / 1000)),
  )
</script>

{#if stacked}
  <section class="strip surface" aria-label="Next up">
    <span class="face" aria-hidden="true"><NpcFace npc={host} /></span>
    <span class="summary"><span class="muted">Next up:</span> {label}</span>
    {#if startsIn !== null}<strong class="count" aria-live="polite">{startsIn}</strong>{/if}
  </section>
{:else}
  <section class="panel next-up" aria-labelledby="next-up">
    <h2 id="next-up">Next up</h2>
    <div class="round">
      <span class="face" aria-hidden="true"><NpcFace npc={host} /></span>
      <div>
        <p class="name">{label}</p>
        <p class="line">{nextRoundLine(segment)}</p>
      </div>
    </div>
    {#if startsIn !== null}
      <p class="starts" aria-live="polite">
        <span>Starts in</span>
        <strong class="count">{startsIn}</strong>
      </p>
    {/if}
  </section>
{/if}

<style>
  .next-up {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .round {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .face {
    display: grid;
    flex: none;
    place-items: center;
    width: 3.75rem;
    height: 3.75rem;
  }

  /* Sized outright: a percentage of a grid cell's height is no height at all. */
  .face :global(img) {
    width: 100%;
    max-width: none;
    height: 100%;
    max-height: none;
    object-fit: contain;
  }

  .name {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .line {
    margin: 0.1rem 0 0;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .starts {
    display: flex;
    flex-direction: column;
    margin: auto 0 0;
    text-align: center;
    color: var(--muted);
  }

  .count {
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .starts .count {
    font-size: 4.5rem;
    line-height: 1;
  }

  .strip {
    position: fixed;
    right: 0.75rem;
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
    left: 0.75rem;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 52px;
    padding: 0.35rem 0.75rem;
    background: var(--panel);
    color: var(--ink);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 0.95rem;
  }

  .strip .face {
    width: 2.25rem;
    height: 2.25rem;
  }

  .summary {
    flex: 1;
    overflow-wrap: anywhere;
  }

  .muted {
    color: var(--muted);
  }

  .strip .count {
    font-size: 1.5rem;
  }
</style>
