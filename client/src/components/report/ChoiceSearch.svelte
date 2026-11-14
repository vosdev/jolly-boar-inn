<script lang="ts">
  /**
   * Which question a report is about: a strict combobox over a mode's questions, like
   * `pick_from_list`'s, searched by word prefix with case and accents ignored
   * (`lib/vocab.ts`). Guess the Examine holds hundreds, so nobody scrolls for theirs.
   *
   * "Something else" heads the list whatever is typed, for a report about no one question.
   * Only a picked entry counts: editing the box after a pick clears it.
   */
  import { Combobox } from '../../lib/combobox.svelte'
  import type { Picked, ReportChoice } from '../../lib/reports'
  import { search, SHOWN_MAX, type VocabEntry } from '../../lib/vocab'

  let {
    choices,
    picked = $bindable(null),
    label,
    problem = null,
  }: { choices: ReportChoice[]; picked?: Picked; label: string; problem?: string | null } = $props()

  const OTHER = 'Something else'
  const uid = $props.id()
  const box = new Combobox(uid)

  // `search` works on numbered entries, so each choice is numbered by its place in `choices`.
  const entries = $derived<VocabEntry[]>(choices.map((c, index) => ({ id: index, name: c.label })))

  let query = $state(picked === 'other' ? OTHER : picked === null ? '' : picked.label)
  const matches = $derived(search(entries, query === OTHER ? '' : query))
  const shown = $derived<Picked[]>([
    'other',
    ...matches.slice(0, SHOWN_MAX).map((e) => choices[e.id] ?? null),
  ])

  function nameOf(entry: Picked): string {
    return entry === 'other' ? OTHER : (entry?.label ?? '')
  }

  function select(entry: Picked): void {
    picked = entry
    query = nameOf(entry)
    box.expanded = false
  }

  function onKeydown(event: KeyboardEvent): void {
    box.keydown(event, {
      count: shown.length,
      open: () => (box.expanded = true),
      pick: (index) => select(shown[index]!),
      strict: true,
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
    placeholder="Search by a word from the question…"
    aria-autocomplete="list"
    aria-expanded={box.expanded}
    aria-controls={box.listId}
    aria-activedescendant={box.expanded ? box.optionId(box.active) : undefined}
    aria-invalid={problem !== null}
    bind:value={query}
    oninput={() => {
      picked = null
      box.active = matches.length > 0 ? 1 : 0
      box.expanded = true
    }}
    onfocus={() => (box.expanded = true)}
    onclick={() => (box.expanded = true)}
    onblur={() => (box.expanded = false)}
    onkeydown={onKeydown}
  />
  <ul
    bind:this={box.listbox}
    id={box.listId}
    role="listbox"
    aria-label="Questions"
    hidden={!box.expanded}
  >
    {#each shown as entry, index (entry === 'other' ? 'other' : `${index}:${entry?.id}`)}
      <!-- The keys belong to the input, which keeps focus: the combobox pattern. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id={box.optionId(index)}
        role="option"
        aria-selected={index === box.active}
        class:active={index === box.active}
        class:other={entry === 'other'}
        onpointerdown={(event) => event.preventDefault()}
        onclick={() => select(entry)}
      >
        {nameOf(entry)}
      </li>
    {/each}
    {#if matches.length === 0 && query.trim() !== '' && query !== OTHER}
      <li class="empty" role="option" aria-selected="false" aria-disabled="true">
        No question matches “{query.trim()}”.
      </li>
    {:else if matches.length > SHOWN_MAX}
      <li class="empty" role="option" aria-selected="false" aria-disabled="true">
        {matches.length - SHOWN_MAX} more — keep typing to narrow the list.
      </li>
    {/if}
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

  [role='option'].other {
    font-style: italic;
  }

  [role='option'].active {
    background: var(--accent);
    color: var(--accent-ink);
  }

  [role='option'].empty {
    cursor: default;
    color: var(--muted);
  }
</style>
