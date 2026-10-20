<script lang="ts">
  /**
   * Which question a report is about: a strict combobox over a mode's questions, like
   * `pick_from_list`'s, searched by word prefix with case and accents ignored
   * (`lib/vocab.ts`). Guess the Examine holds hundreds, so nobody scrolls for theirs.
   *
   * "Something else" heads the list whatever is typed, for a report about no one question.
   * Only a picked entry counts: editing the box after a pick clears it.
   */
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
  const listId = `${uid}-list`
  const optionId = (index: number) => `${uid}-option-${index}`

  // `search` works on numbered entries, so each choice is numbered by its place in `choices`.
  const entries = $derived<VocabEntry[]>(choices.map((c, index) => ({ id: index, name: c.label })))

  let query = $state(picked === 'other' ? OTHER : picked === null ? '' : picked.label)
  let expanded = $state(false)
  let active = $state(0)
  let listbox = $state<HTMLUListElement | null>(null)

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
    placeholder="Search by a word from the question…"
    aria-autocomplete="list"
    aria-expanded={expanded}
    aria-controls={listId}
    aria-activedescendant={expanded ? optionId(active) : undefined}
    aria-invalid={problem !== null}
    bind:value={query}
    oninput={() => {
      picked = null
      active = matches.length > 0 ? 1 : 0
      expanded = true
    }}
    onfocus={() => (expanded = true)}
    onclick={() => (expanded = true)}
    onblur={() => (expanded = false)}
    onkeydown={onKeydown}
  />
  <ul bind:this={listbox} id={listId} role="listbox" aria-label="Questions" hidden={!expanded}>
    {#each shown as entry, index (entry === 'other' ? 'other' : `${index}:${entry?.id}`)}
      <!-- The keys belong to the input, which keeps focus: the combobox pattern. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id={optionId(index)}
        role="option"
        aria-selected={index === active}
        class:active={index === active}
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
