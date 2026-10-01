<script lang="ts">
  /**
   * One history chart on the admin page: stacked bars, or lines, over the range's buckets.
   *
   * Plain SVG drawn at the width it is given, rather than a library scaled by a viewBox:
   * a scaled chart's labels would shrink to nothing on a phone. Colours are theme tokens
   * by class, because the CSP allows no inline style for anything themed.
   */
  import type { Tone } from '../../lib/adminCharts'

  let {
    title,
    kind,
    days,
    series,
    height = 140,
  }: {
    title: string
    kind: 'stacked' | 'lines'
    /** Each bucket's first day, `YYYY-MM-DD`. */
    days: string[]
    series: { label: string; tone: Tone; values: number[] }[]
    height?: number
  } = $props()

  /** Room on the left for the scale, and below for the dates. */
  const LEFT = 34
  const BOTTOM = 20
  const TOP = 8

  let measured = $state(0)
  const width = $derived(measured > 0 ? measured : 640)
  const plot = $derived(height - BOTTOM - TOP)

  const totals = $derived(days.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)))
  const max = $derived(
    Math.max(1, ...(kind === 'stacked' ? totals : series.flatMap((s) => s.values))),
  )
  const step = $derived((width - LEFT) / Math.max(1, days.length))

  function y(value: number): number {
    return TOP + plot - (plot * value) / max
  }

  function x(i: number): number {
    return LEFT + step * (i + 0.5)
  }

  function shortDate(day: string): string {
    return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
  }

  /** Each bar's segments, bottom up. */
  const stacks = $derived(
    days.map((_, i) => {
      let base = 0
      return series.map((s) => {
        const value = s.values[i] ?? 0
        const segment = { tone: s.tone, top: y(base + value), bottom: y(base) }
        base += value
        return segment
      })
    }),
  )

  const ticks = $derived(
    days.length === 0
      ? []
      : [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])].map((i) => ({
          i,
          anchor: days.length === 1 ? 'middle' : i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle',
        })),
  )

  const summary = $derived(
    `${title}: ${series.map((s) => `${s.values.reduce((a, b) => a + b, 0)} ${s.label}`).join(', ')}`,
  )
</script>

<figure class="chart">
  <figcaption>{title}</figcaption>
  <div class="canvas" bind:clientWidth={measured}>
    <svg {width} {height} role="img" aria-label={summary}>
      {#each [0.5, 1] as fraction (fraction)}
        <line class="grid" x1={LEFT} x2={width} y1={y(max * fraction)} y2={y(max * fraction)} />
        <text class="scale" x={LEFT - 6} y={y(max * fraction) + 4} text-anchor="end">
          {Math.round(max * fraction)}
        </text>
      {/each}
      <line class="axis" x1={LEFT} x2={width} y1={y(0)} y2={y(0)} />
      {#each ticks as tick (tick.i)}
        <text class="scale" x={x(tick.i)} y={height - 5} text-anchor={tick.anchor}>
          {shortDate(days[tick.i] ?? '')}
        </text>
      {/each}
      {#if kind === 'stacked'}
        {#each stacks as stack, i (days[i])}
          <g>
            <title>
              {shortDate(days[i] ?? '')}: {series.map((s) => `${s.values[i] ?? 0} ${s.label}`).join(', ')}
            </title>
            {#each stack as segment, j (j)}
              {#if segment.bottom > segment.top}
                <rect
                  class="bar tone-{segment.tone}"
                  x={x(i) - Math.max(step * 0.4, 0.5)}
                  width={Math.max(step * 0.8, 1)}
                  y={segment.top}
                  height={segment.bottom - segment.top}
                />
              {/if}
            {/each}
          </g>
        {/each}
      {:else}
        {#each series as line (line.label)}
          <polyline
            class="line tone-{line.tone}"
            points={line.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        {/each}
      {/if}
    </svg>
  </div>
  <ul class="legend">
    {#each series as s (s.label)}
      <li><span class="swatch tone-{s.tone}" aria-hidden="true"></span>{s.label}</li>
    {/each}
  </ul>
</figure>

<style>
  .chart {
    margin: 0 0 1.25rem;
  }

  figcaption {
    font-size: 0.9rem;
    color: var(--muted);
    margin-bottom: 0.25rem;
  }

  svg {
    display: block;
    overflow: visible;
  }

  .scale {
    font-size: 11px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 0.5;
    stroke-dasharray: 2 3;
  }

  .axis {
    stroke: var(--line);
    stroke-width: 1;
  }

  .line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .swatch {
    display: inline-block;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 2px;
    margin-right: 0.35rem;
  }

  .bar.tone-ok,
  .swatch.tone-ok {
    fill: var(--ok);
    background: var(--ok);
  }

  .bar.tone-bad,
  .swatch.tone-bad {
    fill: var(--bad);
    background: var(--bad);
  }

  .bar.tone-muted,
  .swatch.tone-muted {
    fill: var(--muted);
    background: var(--muted);
  }

  .bar.tone-accent,
  .swatch.tone-accent {
    fill: var(--accent);
    background: var(--accent);
  }

  .bar.tone-warn,
  .swatch.tone-warn {
    fill: var(--warn);
    background: var(--warn);
  }

  .line.tone-ok {
    stroke: var(--ok);
  }

  .line.tone-bad {
    stroke: var(--bad);
  }

  .line.tone-muted {
    stroke: var(--muted);
  }

  .line.tone-accent {
    stroke: var(--accent);
  }

  .line.tone-warn {
    stroke: var(--warn);
  }
</style>
