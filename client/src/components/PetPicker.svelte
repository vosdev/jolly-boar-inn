<script lang="ts">
  /**
   * The pet picker (section 6 of ideas/design.md), in the name prompt and the settings menu.
   *
   * It shows the pet you have as its chathead with its name, a Random button for somebody
   * who cannot decide, and "Change pet", which opens a search box over a scrolling grid of
   * every pet's icon. With two hundred pets the grid is not browsed, it is searched: the
   * list is A to Z, and typing narrows it by name.
   *
   * The grid is a native radio group, so the keyboard and a screen reader get what they
   * expect for free: one tab stop, the arrow keys move through the pets and choose as they
   * go, and each is announced by name and place ("Aggy, 3 of 204"). The choice is a draft
   * in the caller, which says when it counts.
   *
   * The grid stays shut until asked for, so the name prompt, which is answered with one
   * tap, is no taller than it was. `inline` is for the wide settings sheet, which has room
   * for it: the search and the grid are always out, and the chathead is the caller's to
   * draw beside the name.
   */
  import { tick } from 'svelte'

  import { PICKABLE, petName, randomPet } from '../lib/pets'
  import Die from './Die.svelte'
  import Pet from './Pet.svelte'

  let {
    value = $bindable(),
    taken = [],
    disabled = false,
    inline = false,
    onchange,
  }: {
    /** The pet's id. */
    value: string
    /** Pets already in the room, so Random leans toward one nobody has. */
    taken?: string[]
    disabled?: boolean
    /** Search and grid always open, with no chathead or "Change pet". */
    inline?: boolean
    /** A pick was made, by hand or by Random. */
    onchange?: () => void
  } = $props()

  const id = $props.id()
  let open = $state(false)
  let query = $state('')
  let search = $state<HTMLInputElement | null>(null)
  let toggle = $state<HTMLButtonElement | null>(null)
  let grid = $state<HTMLElement | null>(null)

  const matches = $derived.by(() => {
    const needle = query.trim().toLowerCase()
    return needle === ''
      ? PICKABLE
      : PICKABLE.filter((pet) => pet.name.toLowerCase().includes(needle))
  })

  // Always open, the grid starts where your pet is, as a grid opened by hand does.
  $effect(() => {
    if (inline) grid?.querySelector('label:has(:checked)')?.scrollIntoView?.({ block: 'nearest' })
  })

  function pick(pet: string): void {
    value = pet
    onchange?.()
  }

  function random(): void {
    pick(randomPet(taken, value))
  }

  async function toggleOpen(): Promise<void> {
    open = !open
    if (!open) return
    query = ''
    await tick()
    search?.focus()
    // The pet you have is where the grid opens, so a change of mind is a step from it.
    grid?.querySelector('label:has(:checked)')?.scrollIntoView?.({ block: 'nearest' })
  }

  /** Escape closes the grid and not the menu or prompt it sits in. */
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    open = false
    toggle?.focus()
  }
</script>

{#snippet searchField()}
  <input
    id="{id}-search"
    type="text"
    inputmode="search"
    enterkeyhint="search"
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    aria-label="Search pets"
    placeholder={inline ? 'Search pets' : undefined}
    bind:value={query}
    bind:this={search}
    {disabled}
    onkeydown={(event) => {
      if (event.key === 'Enter') event.preventDefault()
    }}
  />
{/snippet}

{#snippet randomButton()}
  <button type="button" class="small random" {disabled} onclick={random}>
    <Die /> Random
  </button>
{/snippet}

{#snippet petGrid()}
  <div class="pets" class:tall={inline} role="radiogroup" aria-label="Pets" bind:this={grid}>
    {#each matches as pet (pet.id)}
      <label class="cell" title={pet.name}>
        <input
          type="radio"
          class="sr"
          name="{id}-pet"
          value={pet.id}
          checked={value === pet.id}
          {disabled}
          onchange={() => pick(pet.id)}
        />
        <Pet pet={pet.id} size={40} cut="icon" label="" />
        <span class="sr">{pet.name}</span>
      </label>
    {/each}
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker" class:inline onkeydown={onKeyDown}>
  {#if inline}
    <label for="{id}-search">Pet: <strong class="pet-name">{petName(value)}</strong></label>
    <div class="search-row">
      {@render searchField()}
      {@render randomButton()}
    </div>
    {#if matches.length === 0}
      <p class="note">No pet has that name.</p>
    {/if}
    {@render petGrid()}
  {:else}
    <div class="current">
      <Pet pet={value} size={64} label="" />
      <div class="who">
        <span class="pet-name">{petName(value)}</span>
        <span class="buttons">
          {@render randomButton()}
          <button
            type="button"
            class="small"
            {disabled}
            aria-expanded={open}
            aria-controls="{id}-finder"
            bind:this={toggle}
            onclick={toggleOpen}
          >
            {open ? 'Done' : 'Change pet'}
          </button>
        </span>
      </div>
    </div>

    {#if open}
      <div class="finder" id="{id}-finder">
        <label for="{id}-search">Search pets</label>
        {@render searchField()}
        <p class="note">
          {matches.length === 0
            ? 'No pet has that name.'
            : `${matches.length} ${matches.length === 1 ? 'pet' : 'pets'}`}
        </p>
        {@render petGrid()}
      </div>
    {/if}
  {/if}
</div>

<style>
  .picker {
    margin-bottom: 0.75rem;
  }

  .current {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .who {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .pet-name {
    overflow-wrap: anywhere;
    font-weight: 600;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .random {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .picker.inline {
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-bottom: 0;
  }

  .search-row {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }

  .search-row input {
    flex: 1;
    min-width: 0;
  }

  .inline .pet-name {
    color: var(--ink);
  }

  .inline .note {
    margin: 0 0 0.4rem;
  }

  .finder {
    margin-top: 0.75rem;
  }

  .finder .note {
    margin: 0.3rem 0;
  }

  /* A few rows tall, however long the list: it scrolls inside, and a finger that starts
     on it scrolls it, not the page. */
  .pets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr));
    align-content: start;
    gap: 0.25rem;
    max-height: 13.5rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.25rem;
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
  }

  /* Beside the name, theme and sound there is room for more rows; a search that leaves a
     few pets shrinks it to them. */
  .pets.tall {
    max-height: 24rem;
  }

  .cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
    margin: 0;
    border: var(--border-width) solid transparent;
    border-radius: min(var(--radius), 8px);
    cursor: pointer;
  }

  .cell:hover {
    background: var(--panel-raised);
  }

  .cell:has(:checked) {
    background: var(--panel-raised);
    border-color: var(--accent);
  }

  .cell:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
