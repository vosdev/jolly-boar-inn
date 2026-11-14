<script lang="ts">
  /**
   * A question whose answer is a name the import looks up. A Who's That NPC? shadow is only
   * the NPC's name, its render four buttons in the shared form: the preview shows no picture,
   * since it exists only once imported, and a shadow of an NPC the game already asks about is
   * refused before it is sent. A Forgetful Bard question is a verse and its item, from the list
   * or typed if the list lacks it; the item fills in its wiki page, and the preview's reveal
   * has no picture, which a room alone may name.
   */
  import { onMount } from 'svelte'

  import { fieldHints } from '../../lib/placeholders'
  import { codePoints } from '../../lib/questionSchema'
  import {
    npcNameProblem,
    onList,
    plainItems,
    questionPreview,
    VERSE_MAX,
    verseItemProblem,
    verseProblem,
    type QuestionContent,
  } from '../../lib/suggestions'
  import { loadVocab, type VocabEntry } from '../../lib/vocab'
  import Segmented from '../Segmented.svelte'
  import type { SuggestionFormProps } from './forms'
  import ItemPicker from './ItemPicker.svelte'

  let {
    id,
    choice,
    content,
    asked,
    picker,
    saveLabel,
    stepQuestion,
    stepDifficulty,
    fields,
    nearSave,
    preview,
    onattempt,
    onsubject,
    ondraft,
    onprogress,
    onsave,
    oncancel,
  }: SuggestionFormProps = $props()

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = content as Partial<QuestionContent> | undefined
  // svelte-ignore state_referenced_locally
  const verses = choice.editor === 'verse'
  let name = $state(
    start?.type === 'pick_from_list'
      ? ((start.payload?.subject as { name?: string })?.name ?? '')
      : '',
  )
  let verse = $state(verses ? ((start?.payload?.prompt as string | undefined) ?? '') : '')
  let attempted = $state(false)
  let roster = $state<readonly VocabEntry[] | 'loading' | 'failed'>('loading')

  onMount(() => {
    if (!verses) return
    loadVocab('items').then(
      (list) => (roster = list.entries),
      () => (roster = 'failed'),
    )
  })

  const verseError = $derived(verseProblem(verse, name))
  const itemError = $derived(verseItemProblem(name))
  const error = $derived(verses ? (verseError ?? itemError) : npcNameProblem(name, asked))
  const question = $derived<QuestionContent>({
    type: 'pick_from_list',
    payload: {
      prompt: verses ? verse.trim() : (choice.prompt?.text ?? ''),
      subject: { name: name.trim() },
    },
    mode: choice.id,
  })
  const items = $derived(typeof roster === 'string' ? [] : plainItems(roster))
  const listed = $derived(verses && onList(name, items))
  const shown = $derived.by(() => {
    const open = questionPreview(question)
    return listed ? { ...open, view: { ...open.view, vocab: 'items' } } : open
  })

  $effect(() => ondraft(error === null ? question : undefined))
  $effect(() =>
    onprogress({ questionDone: error === null, extrasFilled: false, extrasValid: true }),
  )

  function pickItem(next: string): void {
    onsubject(name, next)
    name = next
  }

  function save(): void {
    attempted = true
    if (!onattempt() || error !== null) return
    onsave(question)
  }
</script>

{#snippet problem(message: string | null, show: boolean)}
  {#if show && message !== null}
    <p class="error">{message}</p>
  {/if}
{/snippet}

{#snippet body()}
  {#if picker}
    <div class="field">
      <Segmented
        legend="How players answer"
        options={picker.options}
        bind:value={() => 'pick_from_list', picker.onpick}
      />
    </div>
  {/if}
  {#if verses}
    <div class="field">
      <label for="{id}-verse">The verse Falo sings</label>
      <textarea
        id="{id}-verse"
        rows="3"
        placeholder={fieldHints(choice.id).prompt}
        bind:value={verse}></textarea>
      <p class="note hint counter">{codePoints(verse.trim())}/{VERSE_MAX}</p>
      {@render problem(verseError, attempted)}
    </div>
    <ItemPicker
      entries={items}
      {name}
      label="The item it describes"
      problem={attempted ? itemError : null}
      onname={pickItem}
    />
    {#if name.trim() !== '' && !listed && itemError === null && typeof roster !== 'string'}
      <p class="note hint">Not on the list yet: Reldo adds it if your verse is approved.</p>
    {/if}
  {:else}
    <div class="field">
      <label for="{id}-npc">Monster or NPC, as the wiki spells it</label>
      <input id="{id}-npc" type="text" bind:value={name} />
      {@render problem(error, attempted)}
    </div>
  {/if}
{/snippet}

<div class="fields">
  <h3 id="{id}-title">{choice.label}</h3>
  {@render stepQuestion(body)}
  {@render stepDifficulty()}
  {@render fields(attempted)}
  {@render nearSave()}
  <div class="row actions">
    <button type="button" class="primary" onclick={save}>{saveLabel}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</div>
<section class="preview" aria-label="Preview">
  <p class="note">What players will see</p>
  {@render preview(shown, listed)}
</section>

<style>
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

  .counter {
    text-align: right;
  }

  .fields,
  .preview {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.75rem;
  }

  .hint {
    margin: 0.3rem 0 0;
  }

  .actions {
    margin-top: 1rem;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
  }
</style>
