<script lang="ts">
  /**
   * `price_is_right`: one item, a range of prices, and a slider to say what it goes for.
   *
   * The item and the question line are the stem's to show (`PriceStem`, on the scroll);
   * this view is the slider. Prices arrive as integers and are written here with
   * `lib/gp.ts`, the chosen one with three figures, since the slider's neighbouring
   * positions differ in the third.
   *
   * `data` arrives in the two shapes `questions/types/price_is_right.py` sends:
   *
   * - while open, `client_view(payload)`: the subject, `min`, `max` and `as_of`.
   * - after close, `reveal(payload)`: the same plus `value`.
   *
   * Someone who cannot answer sees the range without a control. Once sent, the slider
   * holds the guess; the reveal marks the price, the guess and everyone's as ticks.
   */
  import { formatGp } from '../../../lib/gp'
  import { middle } from '../../../lib/slider'
  import type { TypeViewProps } from '../props'
  import Slider from '../Slider.svelte'

  interface Data {
    min: number
    max: number
    /** Reveal only. */
    value?: number
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
  const sent = $derived(typeof yourValue === 'number' ? yourValue : null)
  let chosen: number | null = $state(null)
  const shown = $derived(sent ?? chosen ?? middle(q.min, q.max))
  const locked = $derived(revealed || sent !== null || !canAnswer)

  const gp = (amount: number) => `${formatGp(amount)} gp`
  const precise = (amount: number) => `${formatGp(amount, { figures: 3 })} gp`

  const off = $derived(
    revealed && sent !== null && typeof q.value === 'number'
      ? Math.round(((sent - q.value) / q.value) * 100)
      : null,
  )

  const marks = $derived.by(() => {
    if (!revealed || typeof q.value !== 'number') return []
    const ticks = Object.values(results ?? {})
      .map((result) => result.value)
      .filter((value): value is number => typeof value === 'number')
      .map((value) => ({ value, kind: 'tick' as const }))
    const yours = sent === null ? [] : [{ value: sent, kind: 'yours' as const }]
    return [...ticks, ...yours, { value: q.value, kind: 'answer' as const }]
  })
</script>

<div class="price-slider">
  {#if revealed && typeof q.value === 'number'}
    <p class="chosen" id="{uid}-label">
      <span class="caption">It goes for</span>
      {precise(q.value)}
    </p>
    {#if sent !== null}
      <p class="yours">
        Your guess {precise(sent)}{#if off !== null}, <span class="off"
            >{off === 0 ? 'spot on' : `${off > 0 ? '+' : '−'}${Math.abs(off)}%`}</span
          >{/if}
      </p>
    {/if}
  {:else if canAnswer || sent !== null}
    <p class="chosen" id="{uid}-label">
      <span class="caption">{sent === null ? 'Your price' : 'Sent'}</span>
      {precise(shown)}
    </p>
  {:else}
    <p class="caption" id="{uid}-label">Somewhere between</p>
  {/if}

  {#if canAnswer || sent !== null || revealed}
    <Slider
      low={q.min}
      high={q.max}
      bind:value={() => (revealed && sent === null ? null : shown), (v) => (chosen = v)}
      disabled={locked}
      label="{uid}-label"
      valueText={precise}
      {marks}
    />
  {/if}

  <div class="ends">
    <span>{gp(q.min)}</span>
    <span>{gp(q.max)}</span>
  </div>

  {#if canAnswer && sent === null && !revealed}
    <button type="button" class="primary" onclick={() => onAnswer(shown)}>Submit</button>
  {/if}
</div>

<style>
  .price-slider {
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

  .caption {
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
