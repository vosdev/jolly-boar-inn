<script lang="ts">
  /** A read-only URL with a copy button. `navigator.clipboard` needs a secure context,
   * so the input stays selectable as the fallback when it is missing or refused.
   *
   * `shown` is what the field reads in place of `value`, for a link with a secret in it
   * on a screen that may be shared. The fallback reveals `value`, since only then is
   * selecting it the way to copy it. */
  import { tick } from 'svelte'

  let {
    id,
    value,
    label,
    shown = value,
  }: { id: string; value: string; label: string; shown?: string } = $props()

  let field: HTMLInputElement | undefined = $state()
  let copied = $state(false)
  let revealed = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => (copied = false), 2000)
    } catch {
      revealed = true
      await tick()
      field?.select()
    }
  }
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="row">
    <input
      {id}
      type="text"
      readonly
      value={revealed ? value : shown}
      bind:this={field}
      onfocus={() => field?.select()}
    />
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
