<script lang="ts">
  /**
   * A linear or logarithmic slider over `lib/slider.ts`'s grid, with marks for a reveal.
   *
   * A `role="slider"` of its own rather than `<input type="range">`: a native range is
   * linear and pages by a tenth of its width, and this one must page by ten grid steps
   * along a log track. Dragging works by pointer, so touch and mouse alike; the thumb's
   * hit area is the whole track.
   */
  import { pageSteps, position, stepFrom, valueAt, type Scale } from '../../lib/slider'

  interface Mark {
    value: number
    kind: 'answer' | 'yours' | 'tick'
  }

  let {
    low,
    high,
    scale = 'log',
    value = $bindable(),
    disabled = false,
    label,
    valueText,
    marks = [],
  }: {
    low: number
    high: number
    scale?: Scale
    value: number | null
    disabled?: boolean
    /** The id of the element that names the slider. */
    label: string
    valueText: (value: number) => string
    marks?: Mark[]
  } = $props()

  let track: HTMLDivElement | undefined = $state()
  let dragging = false

  const at = (v: number) => `${(position(v, low, high, scale) * 100).toFixed(3)}%`

  function fromPointer(event: PointerEvent): void {
    if (track === undefined) return
    const box = track.getBoundingClientRect()
    if (box.width > 0) value = valueAt((event.clientX - box.left) / box.width, low, high, scale)
  }

  const step = (v: number, steps: number) => stepFrom(v, steps, low, high, scale)
  const KEYS: Record<string, (v: number) => number> = {
    ArrowRight: (v) => step(v, 1),
    ArrowUp: (v) => step(v, 1),
    ArrowLeft: (v) => step(v, -1),
    ArrowDown: (v) => step(v, -1),
    PageUp: (v) => step(v, pageSteps(low, high, scale)),
    PageDown: (v) => step(v, -pageSteps(low, high, scale)),
    Home: () => low,
    End: () => high,
  }

  function onkeydown(event: KeyboardEvent): void {
    const move = KEYS[event.key]
    if (disabled || move === undefined || value === null) return
    event.preventDefault()
    value = move(value)
  }
</script>

<div
  class="track"
  class:disabled
  bind:this={track}
  role="slider"
  tabindex={disabled ? -1 : 0}
  aria-labelledby={label}
  aria-valuemin={low}
  aria-valuemax={high}
  aria-valuenow={value ?? undefined}
  aria-valuetext={value === null ? undefined : valueText(value)}
  aria-disabled={disabled}
  {onkeydown}
  onpointerdown={(event) => {
    if (disabled) return
    dragging = true
    track?.setPointerCapture?.(event.pointerId)
    fromPointer(event)
  }}
  onpointermove={(event) => {
    if (dragging) fromPointer(event)
  }}
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
>
  <div class="rail"></div>
  {#each marks as mark, index (index)}
    <div class="mark {mark.kind}" style:left={at(mark.value)} data-value={mark.value}></div>
  {/each}
  {#if value !== null}
    <div class="thumb" style:left={at(value)}></div>
  {/if}
</div>

<style>
  .track {
    position: relative;
    height: 56px;
    touch-action: none;
    cursor: pointer;
    margin: 0 14px;
  }

  .track.disabled {
    cursor: default;
  }

  .track:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
    border-radius: var(--radius);
  }

  .rail {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 8px;
    margin-top: -4px;
    border-radius: 4px;
    background: var(--bg-muted);
    border: var(--border-width) solid var(--line);
  }

  .thumb,
  .mark {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .thumb {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    border: 3px solid var(--panel);
    box-shadow: var(--shadow);
  }

  .disabled .thumb {
    background: var(--muted);
  }

  .mark.tick {
    width: 2px;
    height: 20px;
    background: var(--muted);
  }

  .mark.answer {
    width: 4px;
    height: 40px;
    background: var(--ok);
  }

  .mark.yours {
    width: 4px;
    height: 32px;
    background: var(--accent);
  }
</style>
