<script lang="ts">
  /**
   * The item a verse describes: a combobox over the plain items on the list, searched as
   * `pick_from_list`'s is (`lib/vocab.ts`). Unlike that one it is not strict, so a name the
   * list lacks stays as typed, and the import script adds it.
   */
  import { Combobox } from '../../lib/combobox.svelte'
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
  const box = new Combobox(uid)

  const matches = $derived(search(entries, name))
  const shown = $derived(matches.slice(0, SHOWN_MAX))

  function select(entry: VocabEntry): void {
    onname(entry.name)
    box.expanded = false
  }

  function onKeydown(event: KeyboardEvent): void {
    box.keydown(event, {
      count: shown.length,
      open: () => (box.expanded = true),
      pick: (index) => select(shown[index]!),
      strict: false,
    })
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
    aria-expanded={box.expanded}
    aria-controls={box.listId}
    aria-activedescendant={box.expanded && shown.length > 0 ? box.optionId(box.active) : undefined}
    aria-invalid={problem !== null}
    value={name}
    oninput={(event) => {
      onname(event.currentTarget.value)
      box.active = 0
      box.expanded = true
    }}
    onclick={() => (box.expanded = true)}
    onblur={() => (box.expanded = false)}
    onkeydown={onKeydown}
  />
  <ul
    bind:this={box.listbox}
    id={box.listId}
    role="listbox"
    aria-label="Items"
    hidden={!box.expanded || shown.length === 0}
  >
    {#each shown as entry, index (entry.id)}
      <!-- The keys belong to the input, which keeps focus: the combobox pattern. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id={box.optionId(index)}
        role="option"
        aria-selected={index === box.active}
        class:active={index === box.active}
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
    scrollbar-width: thin;
    scrollbar-color: var(--surface-muted) var(--panel-raised);
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
