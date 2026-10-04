<script lang="ts">
  /**
   * One suggestion being written, or edited in the operator's queue: the fields of its
   * kind, the wiki page that proves it, and the credit.
   *
   * A question is Create's editor, held to the types its mode offers: an NPC's question
   * names its NPC, a round's names none and is previewed in its round. An examine is
   * previewed as Guess the Examine shows it, stem only: its name joins the list only once
   * it is imported. An item is only a name, since the import script finds its id; nothing
   * on the wiki is needed to check one. Beside it the roster, searchable, so nobody writes
   * up an item the game already has; its credit is kept but cannot be shown.
   *
   * Nothing is red until the first Save, and Save hands back only a body the server takes.
   */
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'

  import type { CustomQuestion } from '../../lib/customQuestions'
  import { NAME_MAX } from '../../lib/names'
  import { profile } from '../../lib/profile'
  import {
    creditProblem,
    examinePreview,
    examineProblems,
    itemProblem,
    wikiProblem,
    type Choice,
    type ExamineContent,
    type ItemContent,
    type QuestionContent,
    type SuggestionBody,
    type SuggestionContent,
  } from '../../lib/suggestions'
  import { loadVocab, search, type VocabEntry } from '../../lib/vocab'
  import CustomQuestionForm from '../CustomQuestionForm.svelte'
  import QuestionStage from '../QuestionStage.svelte'

  let {
    choice,
    initial = undefined,
    saveLabel = 'Send to the innkeeper',
    onsave,
    oncancel,
  }: {
    choice: Choice
    /** The suggestion to edit, or none for a new one. */
    initial?: SuggestionBody
    saveLabel?: string
    onsave: (body: SuggestionBody) => void
    oncancel: () => void
  } = $props()

  const id = $props.id()

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = initial?.content as Partial<QuestionContent & ExamineContent> | undefined
  // svelte-ignore state_referenced_locally
  let credit = $state(initial?.credit ?? get(profile)?.name ?? '')
  // svelte-ignore state_referenced_locally
  let shown = $state(choice.kind !== 'item' && (initial?.credit_shown ?? false))
  let wiki = $state(start?.wiki ?? '')
  let name = $state(start?.name ?? '')
  let prompt = $state(start?.prompt ?? '')
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

  const question: CustomQuestion | undefined =
    start?.type === undefined
      ? undefined
      : {
          type: start.type,
          payload: start.payload ?? {},
          ...(start.random_event === undefined ? {} : { random_event: start.random_event }),
        }

  const creditError = $derived(creditProblem(credit))
  const wikiError = $derived(wikiProblem(wiki))
  const examineErrors = $derived(examineProblems({ name, prompt, wiki }))
  const itemError = $derived(itemProblem({ name }, typeof roster === 'string' ? [] : roster))
  const rosterFound = $derived(typeof roster === 'string' ? [] : search(roster, rosterQuery))

  function send(content: SuggestionContent): void {
    onsave({ kind: choice.kind, content, credit: credit.trim(), credit_shown: shown })
  }

  /** The fields beside a question: whether they pass, asked on the editor's Save. */
  function questionFieldsPass(): boolean {
    attempted = true
    return creditError === null && wikiError === null
  }

  function saveQuestion(built: CustomQuestion): void {
    send({ ...built, mode: choice.id, wiki: wiki.trim() })
  }

  function saveExamine(): void {
    attempted = true
    if (creditError !== null || Object.values(examineErrors).some((e) => e !== null)) return
    const content: ExamineContent = { name: name.trim(), prompt: prompt.trim(), wiki: wiki.trim() }
    send(content)
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
    <label for="{id}-wiki">Wiki page that proves it</label>
    <input
      id="{id}-wiki"
      type="text"
      inputmode="url"
      placeholder="https://oldschool.runescape.wiki/w/…"
      bind:value={wiki}
    />
    <p class="note hint">The innkeeper checks every suggestion against it. Players never see it.</p>
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
        More or Less and The Price is Right don't show who suggested an item. The innkeeper
        still sees your name.
      </p>
    {/if}
  </fieldset>
{/snippet}

{#snippet questionFields(show: boolean)}
  {@render wikiField(show)}
  {@render creditFields(show)}
{/snippet}

{#snippet buttons(save: () => void)}
  <div class="row actions">
    <button type="button" class="primary" onclick={save}>{saveLabel}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
{/snippet}

{#if choice.kind === 'question'}
  <CustomQuestionForm
    {question}
    title={choice.label}
    types={choice.types}
    asker={choice.id === 'random_event' ? 'required' : 'none'}
    mode={choice.id}
    {saveLabel}
    fields={questionFields}
    onattempt={questionFieldsPass}
    onsave={saveQuestion}
    {oncancel}
  />
{:else}
  <div class="editor surface" role="group" aria-labelledby="{id}-title">
    <div class="layout">
      <div class="fields">
        <h3 id="{id}-title">{choice.label}</h3>
        {#if choice.kind === 'examine'}
          <div class="field">
            <label for="{id}-prompt">The examine text, as the game writes it</label>
            <textarea id="{id}-prompt" rows="2" bind:value={prompt}></textarea>
            {@render problem(examineErrors.prompt, attempted)}
          </div>
          <div class="field">
            <label for="{id}-name">What it belongs to</label>
            <input id="{id}-name" type="text" bind:value={name} />
            <p class="note hint">
              The name players pick from the list. Something not in the list yet joins it.
            </p>
            {@render problem(examineErrors.name, attempted)}
          </div>
          {@render wikiField(attempted)}
        {:else}
          <p class="note">
            An item players will recognise, for More or Less and The Price is Right. Untradeable
            items are welcome: those rounds use alch and shop prices too.
          </p>
          <div class="field">
            <label for="{id}-item">Item name, as the wiki spells it</label>
            <input id="{id}-item" type="text" bind:value={name} />
            {@render problem(itemError, attempted)}
          </div>
        {/if}
        {@render creditFields(attempted)}
        {@render buttons(choice.kind === 'examine' ? saveExamine : saveItem)}
      </div>
      {#if choice.kind === 'examine'}
        <section class="preview" aria-label="Preview">
          <p class="note">What players will see</p>
          <QuestionStage
            question={examinePreview(prompt)}
            yourValue={null}
            onAnswer={() => {}}
            stemOnly
          />
        </section>
      {:else}
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
      {/if}
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

  textarea {
    width: 100%;
    font: inherit;
    padding: calc(0.55rem - var(--border-give)) calc(0.7rem - var(--border-give));
    color: var(--ink);
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    resize: vertical;
  }

  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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

  .preview {
    min-width: 0;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
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
