<script lang="ts">
  /**
   * The item a verse describes: a combobox over the plain items on the list, searched as
   * `pick_from_list`'s is (`lib/vocab.ts`). Unlike that one it is not strict, so a name the
   * list lacks stays as typed, and the import script adds it.
   */
  import { search, SHOWN_MAX, type VocabEntry } from '../../lib/vocab'

  let {
    entries,
    name,
    label,
    problem = null,
    onname,
  }: {
    /** What the list offers, or none while it loads or if it failed. */
    entries: readonly VocabEntry[]
    name: string
    label: string
    problem?: string | null
    onname: (name: string) => void
  } = $props()

  const uid = $props.id()
  const listId = `${uid}-list`
  const optionId = (index: number) => `${uid}-option-${index}`

  let expanded = $state(false)
  let active = $state(0)
  let listbox = $state<HTMLUListElement | null>(null)

  const matches = $derived(search(entries, name))
  const shown = $derived(matches.slice(0, SHOWN_MAX))

  function select(entry: VocabEntry): void {
    onname(entry.name)
    expanded = false
  }

  function highlight(index: number): void {
    active = Math.max(0, Math.min(shown.length - 1, index))
    listbox
      ?.querySelector(`#${CSS.escape(optionId(active))}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!expanded) expanded = true
      else highlight(active + (event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const entry = shown[active]
      if (expanded && entry !== undefined) select(entry)
      else expanded = false
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      expanded = false
    }
  }
</script>

<div class="field">
  <label for="{uid}-input">{label}</label>
  <input
    id="{uid}-input"
    type="text"
    role="combobox"
    autocomplete="off"
    spellcheck="false"
    placeholder="Start typing a name…"
    aria-autocomplete="list"
    aria-expanded={expanded}
    aria-controls={listId}
    aria-activedescendant={expanded && shown.length > 0 ? optionId(active) : undefined}
    aria-invalid={problem !== null}
    value={name}
    oninput={(event) => {
      onname(event.currentTarget.value)
      active = 0
      expanded = true
    }}
    onclick={() => (expanded = true)}
    onblur={() => (expanded = false)}
    onkeydown={onKeydown}
  />
  <ul
    bind:this={listbox}
    id={listId}
    role="listbox"
    aria-label="Items"
    hidden={!expanded || shown.length === 0}
  >
    {#each shown as entry, index (entry.id)}
      <!-- The keys belong to the input, which keeps focus: the combobox pattern. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id={optionId(index)}
        role="option"
        aria-selected={index === active}
        class:active={index === active}
        onpointerdown={(event) => event.preventDefault()}
        onclick={() => select(entry)}
      >
        {entry.name}
      </li>
    {/each}
  </ul>
  {#if problem !== null}<p class="error">{problem}</p>{/if}
</div>

<style>
  [role='listbox'] {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0.25rem;
    max-height: 40vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-raised);
  }

  [role='listbox'][hidden] {
    display: none;
  }

  [role='option'] {
    padding: 0.5rem 0.6rem;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
  }

  [role='option'].active {
    background: var(--accent);
    color: var(--accent-ink);
  }
</style>
