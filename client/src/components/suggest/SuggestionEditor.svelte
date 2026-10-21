<script lang="ts">
  /**
   * One suggestion being written, or edited in the operator's queue: the fields of its
   * kind, the wiki page that proves it, and the credit.
   *
   * A question is Create's editor, held to the types its mode offers: an NPC's question
   * names its NPC, a round's names none and is previewed in its round. A round may hold
   * its options to a range, or its proof to a wiki page. A Drop Table question may name an
   * item to picture; the preview shows none, since the picture exists only once imported. An item is only a name, since the import script finds its id; nothing
   * on the wiki is needed to check one. Beside it the roster, searchable, so nobody writes
   * up an item the game already has; its credit is kept but cannot be shown.
   *
   * Nothing is red until the first Save, and Save hands back only a body the server takes.
   */
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'

  import type { CustomQuestion, CustomType } from '../../lib/customQuestions'
  import { NAME_MAX } from '../../lib/names'
  import type { OrderingQuestion } from '../../lib/ordering'
  import { profile } from '../../lib/profile'
  import {
    creditProblem,
    INTRO_ROUNDS,
    itemProblem,
    pictureItemProblem,
    sourceProblems,
    SUGGESTED_TYPE_LABELS,
    wikiProblem,
    type Choice,
    type ItemContent,
    type QuestionContent,
    type SuggestedType,
    type SuggestionBody,
    type SuggestionContent,
  } from '../../lib/suggestions'
  import { loadVocab, search, type VocabEntry } from '../../lib/vocab'
  import CustomQuestionForm from '../CustomQuestionForm.svelte'
  import OrderingForm from '../OrderingForm.svelte'

  let {
    choice,
    initial = undefined,
    saveLabel = 'Send to the innkeeper',
    onnpc = undefined,
    onsave,
    oncancel,
  }: {
    choice: Choice
    /** The suggestion to edit, or none for a new one. */
    initial?: SuggestionBody
    saveLabel?: string
    /** Told which NPC asks a random event's question whenever that changes, `''` for none. */
    onnpc?: (npc: string) => void
    onsave: (body: SuggestionBody) => void
    oncancel: () => void
  } = $props()

  const id = $props.id()

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = initial?.content as Partial<QuestionContent & ItemContent> | undefined
  // svelte-ignore state_referenced_locally
  let credit = $state(initial?.credit ?? get(profile)?.name ?? '')
  // svelte-ignore state_referenced_locally
  let shown = $state(choice.kind !== 'item' && (initial?.credit_shown ?? false))
  let wiki = $state(start?.wiki ?? '')
  let sourceUrl = $state(start?.source_url ?? '')
  let name = $state(start?.name ?? '')
  let pictureItem = $state(start?.picture_item ?? '')
  let attempted = $state(false)
  let roster = $state<readonly VocabEntry[] | 'loading' | 'failed'>('loading')
  let rosterQuery = $state('')

  onMount(() => {
    if (choice.kind !== 'item') return
    loadVocab('items').then(
      (list) => (roster = list.entries),
      () => (roster = 'failed'),
    )
  })

  const customTypes = $derived(
    choice.types.filter((type): type is CustomType => type !== 'ordering'),
  )
  // The type the form opened on, and the one picked since. A round may both sort and ask, so
  // picking across that line swaps one form for the other, starting it afresh.
  // svelte-ignore state_referenced_locally
  const opened: SuggestedType | undefined = start?.type ?? choice.types[0]
  let current = $state(opened)
  const sorts = $derived(current === 'ordering')
  const picker = $derived(
    choice.types.includes('ordering') && customTypes.length > 0
      ? {
          options: choice.types.map((type) => ({
            value: type,
            label: SUGGESTED_TYPE_LABELS[type],
          })),
          onpick: (type: string) => (current = type as SuggestedType),
        }
      : undefined,
  )

  // svelte-ignore state_referenced_locally
  const roundPrompt = choice.prompt
  /** A payload with the round's prompt: a fixed one always, any other only on a new question. */
  function prompted(payload: Record<string, unknown>): Record<string, unknown> {
    if (roundPrompt === undefined || (!roundPrompt.fixed && 'prompt' in payload)) return payload
    return { ...payload, prompt: roundPrompt.text }
  }
  // svelte-ignore state_referenced_locally
  const question: CustomQuestion | undefined =
    start?.type === 'ordering'
      ? undefined
      : start?.type === undefined
        ? roundPrompt === undefined
          ? undefined
          : { type: customTypes[0] ?? 'multiple_choice', payload: prompted({}) }
        : {
            type: start.type,
            payload: prompted(start.payload ?? {}),
            ...(start.random_event === undefined ? {} : { random_event: start.random_event }),
          }
  const picked = $derived(
    current === opened || current === undefined || current === 'ordering'
      ? question
      : { type: current, payload: prompted({}) },
  )
  const ordering: OrderingQuestion | undefined =
    start?.type === 'ordering'
      ? {
          type: 'ordering',
          payload: start.payload ?? {},
          ...(start.random_event === undefined ? {} : { random_event: start.random_event }),
        }
      : undefined

  const creditError = $derived(creditProblem(credit))
  const wikiError = $derived(wikiProblem(wiki))
  const pictureItemError = $derived(pictureItemProblem(pictureItem))
  const sourceErrors = $derived(sourceProblems(wiki, sourceUrl))
  const itemError = $derived(itemProblem({ name }, typeof roster === 'string' ? [] : roster))
  const rosterFound = $derived(typeof roster === 'string' ? [] : search(roster, rosterQuery))

  function send(content: SuggestionContent): void {
    onsave({ kind: choice.kind, content, credit: credit.trim(), credit_shown: shown })
  }

  /** The fields beside a question: whether they pass, asked on the editor's Save. */
  function questionFieldsPass(): boolean {
    attempted = true
    const checked = choice.wikiOnly
      ? wikiError === null
      : Object.values(sourceErrors).every((e) => e === null)
    return creditError === null && pictureItemError === null && checked
  }

  function saveQuestion(built: CustomQuestion | OrderingQuestion): void {
    const links = { wiki: wiki.trim(), source_url: sourceUrl.trim() }
    const given = Object.fromEntries(Object.entries(links).filter(([, url]) => url !== ''))
    const pictured = choice.pictureItem && pictureItem.trim() !== ''
    send({
      ...built,
      mode: choice.id,
      ...given,
      ...(pictured ? { picture_item: pictureItem.trim() } : {}),
    })
  }

  function saveItem(): void {
    attempted = true
    if (creditError !== null || itemError !== null) return
    const content: ItemContent = { name: name.trim() }
    send(content)
  }
</script>

{#snippet problem(message: string | null, show: boolean)}
  {#if show && message !== null}
    <p class="error">{message}</p>
  {/if}
{/snippet}

{#snippet wikiField(show: boolean)}
  <div class="field">
    <label for="{id}-wiki">Relevant Wiki page</label>
    <input
      id="{id}-wiki"
      type="text"
      inputmode="url"
      placeholder="https://oldschool.runescape.wiki/w/…"
      bind:value={wiki}
    />
    <p class="note hint">
      All submissions are fact-checked by the innkeeper against the OSRS wiki.
    </p>
    {@render problem(wikiError, show)}
  </div>
{/snippet}

{#snippet creditFields(show: boolean)}
  <fieldset class="credit">
    <legend>Credit</legend>
    <div class="field">
      <label for="{id}-credit">Your name</label>
      <input id="{id}-credit" type="text" maxlength={NAME_MAX} bind:value={credit} />
      <p class="note hint">Letters, digits, spaces, _ and -, up to {NAME_MAX}.</p>
      {@render problem(creditError, show)}
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={shown} disabled={choice.kind === 'item'} />
      Show my name to players when this comes up in a game
    </label>
    {#if choice.kind === 'item'}
      <p class="note hint">
        More or Less and The Price is Right do not support displaying the author of a question. The
        innkeeper still sees your name.
      </p>
    {/if}
  </fieldset>
{/snippet}

{#snippet questionFields(show: boolean)}
  {#if choice.pictureItem}
    <div class="field">
      <label for="{id}-picture">Item to show, if any</label>
      <input id="{id}-picture" type="text" bind:value={pictureItem} />
      <p class="note hint">Its name, as the wiki spells it. Players see its picture.</p>
      {@render problem(pictureItemError, show)}
    </div>
  {/if}
  {#if choice.wikiOnly}
    {@render wikiField(show)}
    {@render creditFields(show)}
  {:else}
    {@render sourceFields(show)}
  {/if}
{/snippet}

{#snippet sourceFields(show: boolean)}
  <div class="field">
    <label for="{id}-wiki">Relevant Wiki page</label>
    <input
      id="{id}-wiki"
      type="text"
      inputmode="url"
      placeholder="https://oldschool.runescape.wiki/w/…"
      bind:value={wiki}
    />
    <p class="note hint">
      All submissions are fact-checked by the innkeeper against the OSRS wiki.
    </p>
    {@render problem(sourceErrors.wiki, show)}
  </div>
  <div class="field">
    <label for="{id}-source">Another source, if the wiki can’t show it</label>
    <input
      id="{id}-source"
      type="text"
      inputmode="url"
      placeholder="https://…"
      bind:value={sourceUrl}
    />
    <p class="note hint">
      A clip or page that proves it, such as what a streamer said. Either one is enough.
    </p>
    {@render problem(sourceErrors.source_url ?? sourceErrors.either, show)}
  </div>
  {@render creditFields(show)}
{/snippet}

{#snippet buttons(save: () => void)}
  <div class="row actions">
    <button type="button" class="primary" onclick={save}>{saveLabel}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
{/snippet}

{#if choice.kind === 'question' && sorts}
  <OrderingForm
    question={ordering}
    title={choice.label}
    mode={choice.id}
    asker={choice.id === 'random_event' ? 'required' : 'none'}
    intro={INTRO_ROUNDS.includes(choice.id)}
    {picker}
    {saveLabel}
    fields={questionFields}
    onattempt={questionFieldsPass}
    {onnpc}
    onsave={saveQuestion}
    {oncancel}
  />
{:else if choice.kind === 'question'}
  <CustomQuestionForm
    question={picked}
    title={choice.label}
    types={customTypes}
    asker={choice.id === 'random_event' ? 'required' : 'none'}
    mode={choice.id}
    quote={choice.quote ?? false}
    promptFixed={roundPrompt?.fixed ?? false}
    optionRange={choice.options}
    intro={INTRO_ROUNDS.includes(choice.id)}
    {picker}
    {saveLabel}
    fields={questionFields}
    onattempt={questionFieldsPass}
    {onnpc}
    onsave={saveQuestion}
    {oncancel}
  />
{:else}
  <div class="editor surface" role="group" aria-labelledby="{id}-title">
    <div class="layout">
      <div class="fields">
        <h3 id="{id}-title">{choice.label}</h3>
        <p class="note">
          An item players will recognise, for More or Less and The Price is Right. Untradeable items
          are welcome: those rounds use alch and shop prices too.
        </p>
        <div class="field">
          <label for="{id}-item">Item name, as the wiki spells it</label>
          <input id="{id}-item" type="text" bind:value={name} />
          {@render problem(itemError, attempted)}
        </div>
        {@render creditFields(attempted)}
        {@render buttons(saveItem)}
      </div>
      <section class="roster" aria-labelledby="{id}-roster">
        <h4 id="{id}-roster">Already in the game</h4>
        <input
          type="search"
          aria-label="Search the items already in the game"
          placeholder="Search"
          bind:value={rosterQuery}
        />
        {#if roster === 'loading'}
          <p class="note">Fetching the list…</p>
        {:else if roster === 'failed'}
          <p class="note">The list didn't load. An item the game has is still turned away.</p>
        {:else if rosterFound.length === 0}
          <p class="note">None of them match.</p>
        {:else}
          <ul>
            {#each rosterFound as entry (entry.id)}
              <li>{entry.name}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </div>
{/if}

<style>
  .editor {
    padding: 1rem;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel-raised);
  }

  .layout {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 1.25rem;
    align-items: start;
  }

  .fields {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.75rem;
  }

  .hint {
    margin: 0.3rem 0 0;
  }

  .credit {
    border: var(--border-width) dashed var(--line);
    border-radius: min(var(--radius), 8px);
    padding: 0.75rem 1rem 0.5rem;
    margin: 0 0 1rem;
  }

  .credit legend {
    padding: 0 0.3rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .actions {
    margin-top: 1rem;
  }

  .roster {
    min-width: 0;
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
