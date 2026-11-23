<script lang="ts">
  /**
   * Which question a report is about, for a round on screenshots: every question asks the
   * same thing, so the player picks the photo they saw. Pack order, a page of them at a time.
   *
   * "Something else" comes first, as in `ChoiceSearch`.
   */
  import { pictureUrl } from '../../lib/pictures'
  import type { Picked, ReportChoice } from '../../lib/reports'

  let {
    choices,
    picked = $bindable(null),
    label,
    problem = null,
  }: { choices: ReportChoice[]; picked?: Picked; label: string; problem?: string | null } = $props()

  const PAGE = 24
  const uid = $props.id()
  let shown = $state(PAGE)
</script>

<fieldset class="field" aria-describedby={problem !== null ? `${uid}-problem` : undefined}>
  <legend>{label}</legend>
  <label class="other">
    <input
      type="radio"
      name="{uid}-pick"
      checked={picked === 'other'}
      onchange={() => (picked = 'other')}
    />
    Something else
  </label>
  <ul class="photos">
    {#each choices.slice(0, shown) as choice, index (choice.id)}
      <li>
        <label class:on={picked !== 'other' && picked?.id === choice.id}>
          <input
            type="radio"
            name="{uid}-pick"
            checked={picked !== 'other' && picked?.id === choice.id}
            onchange={() => (picked = choice)}
          />
          <img src={pictureUrl(choice.picture)} alt="Photo {index + 1}" loading="lazy" />
        </label>
      </li>
    {/each}
  </ul>
  {#if choices.length > shown}
    <button type="button" class="more" onclick={() => (shown += PAGE)}>
      Show more ({choices.length - shown} left)
    </button>
  {/if}
  {#if problem !== null}<p class="error" id="{uid}-problem">{problem}</p>{/if}
</fieldset>

<style>
  fieldset {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.35rem;
    font-weight: 600;
  }

  .other {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-style: italic;
    cursor: pointer;
  }

  .photos {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.5rem;
  }

  .photos label {
    position: relative;
    display: block;
    border: 3px solid transparent;
    border-radius: min(var(--radius), 8px);
    overflow: hidden;
    cursor: pointer;
  }

  .photos label.on {
    border-color: var(--accent);
  }

  .photos label:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* The photo is the control; the radio stays for keyboards and screen readers. */
  .photos input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    background: var(--surface-muted);
  }

  .more {
    margin-top: 0.5rem;
  }
</style>
