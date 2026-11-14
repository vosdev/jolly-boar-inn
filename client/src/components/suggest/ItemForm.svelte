<script lang="ts">
  /**
   * An item is only a name, since the import script finds its id; nothing on the wiki is
   * needed to check one. Beside it the roster, searchable, so nobody writes up an item the
   * game already has.
   */
  import { onMount } from 'svelte'

  import { itemProblem, type ItemContent } from '../../lib/suggestions'
  import { loadVocab, search, type VocabEntry } from '../../lib/vocab'
  import type { SuggestionFormProps } from './forms'

  let {
    id,
    choice,
    content,
    saveLabel,
    stepQuestion,
    fields,
    onattempt,
    onprogress,
    onsave,
    oncancel,
  }: SuggestionFormProps = $props()

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  let name = $state((content as Partial<ItemContent> | undefined)?.name ?? '')
  let attempted = $state(false)
  let roster = $state<readonly VocabEntry[] | 'loading' | 'failed'>('loading')
  let query = $state('')

  onMount(() => {
    loadVocab('items').then(
      (list) => (roster = list.entries),
      () => (roster = 'failed'),
    )
  })

  const error = $derived(itemProblem({ name }, typeof roster === 'string' ? [] : roster))
  const found = $derived(typeof roster === 'string' ? [] : search(roster, query))

  $effect(() =>
    onprogress({ questionDone: error === null, extrasFilled: false, extrasValid: true }),
  )

  function save(): void {
    attempted = true
    if (!onattempt() || error !== null) return
    onsave({ name: name.trim() })
  }
</script>

{#snippet body()}
  <p class="note item-note">
    An item players will recognise, for More or Less, The Price is Right and Pixel Hunt. Untradeable
    items are welcome: the price rounds use alch and shop prices too.
  </p>
  <div class="field">
    <label for="{id}-item">Item name, as the wiki spells it</label>
    <input id="{id}-item" type="text" bind:value={name} />
    {#if attempted && error !== null}
      <p class="error">{error}</p>
    {/if}
  </div>
{/snippet}

<div class="fields">
  <h3 id="{id}-title">{choice.label}</h3>
  {@render stepQuestion(body)}
  {@render fields(attempted)}
  <div class="row actions">
    <button type="button" class="primary" onclick={save}>{saveLabel}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</div>
<section class="roster" aria-labelledby="{id}-roster">
  <h4 id="{id}-roster">Already in the game</h4>
  <input
    type="search"
    aria-label="Search the items already in the game"
    placeholder="Search"
    bind:value={query}
  />
  {#if roster === 'loading'}
    <p class="note">Fetching the list…</p>
  {:else if roster === 'failed'}
    <p class="note">The list didn't load. An item the game has is still turned away.</p>
  {:else if found.length === 0}
    <p class="note">None of them match.</p>
  {:else}
    <ul>
      {#each found as entry (entry.id)}
        <li>{entry.name}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .fields,
  .roster {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.75rem;
  }

  .item-note {
    margin: 0 0 0.75rem;
  }

  .actions {
    margin-top: 1rem;
  }

  .roster h4 {
    margin: 0 0 0.5rem;
  }

  .roster input {
    width: 100%;
  }

  /* The fields beside it set the height; the list scrolls inside that rather than
     stretching the editor to every item on the roster. */
  .roster ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    max-height: 20rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--surface-muted) var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel);
  }

  .roster li {
    padding: 0.3rem 0.7rem;
  }

  .roster li + li {
    border-top: var(--border-width) solid var(--line);
  }
</style>
