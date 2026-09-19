<script lang="ts">
  /** A read-only URL with a copy button. `navigator.clipboard` needs a secure context,
   * so the input stays selectable as the fallback when it is missing or refused. */
  let { value, label }: { value: string; label: string } = $props()

  let field: HTMLInputElement | undefined = $state()
  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => (copied = false), 2000)
    } catch {
      field?.select()
    }
  }
</script>

<div class="field">
  <label for={label}>{label}</label>
  <div class="row">
    <input id={label} type="text" readonly {value} bind:this={field} onfocus={() => field?.select()} />
    <button type="button" class="small" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  </div>
</div>

<style>
  .row {
    flex-wrap: nowrap;
  }

  input {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.85rem;
  }
</style>
