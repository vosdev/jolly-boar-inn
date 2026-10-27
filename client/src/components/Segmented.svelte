<script lang="ts" generics="T extends string | boolean">
  /**
   * One choice of a few, as joined buttons: radios underneath, so arrow keys move
   * between them.
   */
  let {
    legend,
    hideLegend = false,
    options,
    value = $bindable(),
    disabled = false,
  }: {
    legend: string
    hideLegend?: boolean
    options: { value: T; label: string }[]
    value: T | undefined
    disabled?: boolean
  } = $props()

  const name = $props.id()
</script>

<fieldset
  class="segmented"
  class:left={hideLegend}
  {disabled}
  aria-label={hideLegend ? legend : undefined}
>
  {#if !hideLegend}
    <legend>{legend}</legend>
  {/if}
  <span class="segments">
    {#each options as option (option.value)}
      <label>
        <input type="radio" {name} value={option.value} bind:group={value} />
        {option.label}
      </label>
    {/each}
  </span>
</fieldset>

<style>
  .segmented {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem 0.75rem;
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
  }

  legend {
    float: left;
    padding: 0;
    color: var(--muted);
    font-size: 0.95rem;
  }

  .left {
    justify-content: flex-start;
  }

  /* Wraps rather than running off a narrow screen when a game offers many choices. */
  .segments {
    display: flex;
    flex-wrap: wrap;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    overflow: hidden;
  }

  label {
    margin: 0;
    padding: calc(0.45rem - var(--border-give)) 0.9rem;
    color: var(--ink);
    font-size: 0.95rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .segmented:disabled label {
    opacity: 0.55;
    cursor: not-allowed;
  }

  label:has(:checked) {
    background: var(--accent);
    color: var(--accent-ink);
  }

  label:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -4px;
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
</style>
