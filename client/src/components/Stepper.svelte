<script lang="ts">
  /**
   * A number set with − and +, held to `min`..`max`: nothing to type, so nothing to
   * refuse. The buttons are named "Fewer <noun>" and "More <noun>".
   */
  let {
    label,
    noun,
    value,
    min,
    max,
    step = 1,
    onchange,
  }: {
    label: string
    noun: string
    value: number
    min: number
    max: number
    step?: number
    onchange: (value: number) => void
  } = $props()

  const id = $props.id()
</script>

<div class="stepper" role="group" aria-labelledby={id}>
  <span {id}>{label}</span>
  <span class="controls">
    <button
      type="button"
      class="square"
      aria-label="Fewer {noun}"
      disabled={value <= min}
      onclick={() => onchange(Math.max(min, value - step))}
    >
      −
    </button>
    <output class="value">{value}</output>
    <button
      type="button"
      class="square"
      aria-label="More {noun}"
      disabled={value >= max}
      onclick={() => onchange(Math.min(max, value + step))}
    >
      +
    </button>
  </span>
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.95rem;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .square {
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    display: grid;
    place-items: center;
    font-size: 1.1rem;
    line-height: 1;
  }

  .value {
    min-width: 2ch;
    text-align: center;
    color: var(--ink);
    font-family: var(--font-numeric);
    font-weight: 700;
    font-size: 1.05rem;
  }
</style>
