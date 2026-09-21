<script lang="ts">
  /**
   * A name input with a re-roll button beside it: the one name field in the app, used by
   * the blocking popup, Create, Join's fallback form and the profile popover.
   *
   * The re-roll keeps focus where it was. Somebody halfway through typing who taps the
   * die wants to see the next name, not to have the keyboard drop and the page jump, so
   * the button swallows the press that would move focus onto it — `pointerdown` for touch
   * and pen, `mousedown` for everything else — and only its click does anything.
   */
  import { generateName, NAME_MAX, nameProblem } from '../lib/names'

  let {
    id,
    value = $bindable(),
    label = 'Your name',
    avoid = '',
    hint = '1–24 characters. This is what the room sees.',
  }: {
    id: string
    value: string
    label?: string
    /** The room code, when there is one: a generated name never matches it. */
    avoid?: string
    hint?: string
  } = $props()

  /** Only once the field has something in it: an empty field is not yet a mistake. */
  const problem = $derived(value.trim() === '' ? null : nameProblem(value))

  function reroll(): void {
    value = generateName(avoid, value.trim())
  }

  function keepFocus(event: Event): void {
    event.preventDefault()
  }
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="name-row">
    <input
      {id}
      type="text"
      bind:value
      maxlength={NAME_MAX}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-invalid={problem !== null}
      aria-describedby="{id}-hint"
    />
    <button
      type="button"
      class="reroll"
      aria-label="Roll a random name"
      title="Roll a random name"
      onpointerdown={keepFocus}
      onmousedown={keepFocus}
      onclick={reroll}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="4" width="16" height="16" rx="3.5" />
        <circle cx="9" cy="9" r="1.4" />
        <circle cx="15" cy="15" r="1.4" />
        <circle cx="15" cy="9" r="1.4" />
        <circle cx="9" cy="15" r="1.4" />
      </svg>
    </button>
  </div>
  {#if problem !== null}
    <p class="error" id="{id}-hint">{problem}</p>
  {:else}
    <p class="note" id="{id}-hint">{hint}</p>
  {/if}
</div>

<style>
  .name-row {
    display: flex;
    gap: 0.4rem;
  }

  .name-row input {
    flex: 1;
    min-width: 0;
  }

  .reroll {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    padding: 0;
  }

  .reroll svg {
    width: 22px;
    height: 22px;
  }

  .reroll rect {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .reroll circle {
    fill: currentColor;
  }

  .field p {
    margin: 0.35rem 0 0;
  }
</style>
