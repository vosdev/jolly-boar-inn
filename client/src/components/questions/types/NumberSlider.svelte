<script lang="ts">
  /**
   * `number_slider`: a number picked on a slider between two bounds, credited by how
   * close it lands.
   *
   * The prompt is the stem's to show; this view is the slider, its ends, and the chosen
   * number large above it with the unit under it. Numbers are written grouped, the way a
   * player reads them, never as coins: a slider of kills is not a price.
   *
   * `data` arrives in the two shapes `questions/types/number_slider.py` sends:
   *
   * - while open, `client_view(payload)`: the prompt, `min`, `max`, `scale` and `unit`.
   * - after close, `reveal(payload)`: the same plus `answer`, and an optional
   *   `explanation` that `Question` draws.
   *
   * Someone who cannot answer sees the range without a control. Once sent, the slider
   * holds the guess; the reveal marks the answer, the guess and everyone's as ticks.
   */
  import { middle, type Scale } from '../../../lib/slider'
  import type { TypeViewProps } from '../props'
  import Slider from '../Slider.svelte'

  interface Data {
    min: number
    max: number
    scale: Scale
    unit?: string
    /** Reveal only. */
    answer?: number
  }

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    onAnswer,
    results = null,
  }: TypeViewProps<number> = $props()

  const uid = $props.id()
  const q = $derived(data as unknown as Data)
  const unit = $derived(typeof q.unit === 'string' && q.unit !== '' ? q.unit : null)
  const sent = $derived(typeof yourValue === 'number' ? yourValue : null)
  let chosen: number | null = $state(null)
  const shown = $derived(sent ?? chosen ?? middle(q.min, q.max, q.scale))
  const locked = $derived(revealed || sent !== null || !canAnswer)
  // An editor's preview draws a slider whose ends are still being typed.
  const drawn = $derived(Number.isInteger(q.min) && Number.isInteger(q.max) && q.min < q.max)

  const grouped = (n: number) => n.toLocaleString('en-GB')
  const written = (n: number) => (unit === null ? grouped(n) : `${grouped(n)} ${unit}`)

  const off = $derived(
    revealed && sent !== null && typeof q.answer === 'number' ? Math.abs(sent - q.answer) : null,
  )

  const marks = $derived.by(() => {
    if (!revealed || typeof q.answer !== 'number') return []
    const ticks = Object.values(results ?? {})
      .map((result) => result.value)
      .filter((value): value is number => typeof value === 'number')
      .map((value) => ({ value, kind: 'tick' as const }))
    const yours = sent === null ? [] : [{ value: sent, kind: 'yours' as const }]
    return [...ticks, ...yours, { value: q.answer, kind: 'answer' as const }]
  })
</script>

<div class="number-slider">
  {#if !drawn}
    <p class="caption">Somewhere between</p>
  {:else if revealed && typeof q.answer === 'number'}
    <p class="chosen" id="{uid}-label">
      <span class="caption">The answer</span>
      {grouped(q.answer)}
      {#if unit !== null}<span class="unit">{unit}</span>{/if}
    </p>
    {#if sent !== null}
      <p class="yours">
        Your guess {written(sent)}{#if off !== null}, <span class="off"
            >{off === 0 ? 'spot on' : `off by ${written(off)}`}</span
          >{/if}
      </p>
    {/if}
  {:else if canAnswer || sent !== null}
    <p class="chosen" id="{uid}-label">
      <span class="caption">{sent === null ? 'Your guess' : 'Sent'}</span>
      {grouped(shown)}
      {#if unit !== null}<span class="unit">{unit}</span>{/if}
    </p>
  {:else}
    <p class="caption" id="{uid}-label">Somewhere between</p>
  {/if}

  {#if drawn && (canAnswer || sent !== null || revealed)}
    <Slider
      low={q.min}
      high={q.max}
      scale={q.scale}
      bind:value={() => (revealed && sent === null ? null : shown), (v) => (chosen = v)}
      disabled={locked}
      label="{uid}-label"
      valueText={written}
      {marks}
    />
  {/if}

  {#if drawn}
    <div class="ends">
      <span>{grouped(q.min)}</span>
      <span>{grouped(q.max)}</span>
    </div>
  {/if}

  {#if drawn && canAnswer && sent === null && !revealed}
    <button type="button" class="primary" onclick={() => onAnswer(shown)}>Submit</button>
  {/if}
</div>

<style>
  .number-slider {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .chosen {
    margin: 0;
    text-align: center;
    font-family: var(--font-numeric);
    font-size: 2rem;
    font-weight: 600;
  }

  .caption,
  .unit {
    display: block;
    color: var(--muted);
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 400;
    text-align: center;
  }

  .yours {
    margin: 0;
    text-align: center;
    color: var(--muted);
  }

  .off {
    font-family: var(--font-numeric);
    color: var(--ink);
  }

  .ends {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-numeric);
    color: var(--muted);
  }

  .primary {
    align-self: center;
    min-height: 56px;
    min-width: 10rem;
  }
</style>
