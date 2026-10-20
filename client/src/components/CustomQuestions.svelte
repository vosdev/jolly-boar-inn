<script lang="ts">
  /**
   * Create's panel for the host's own questions: the list, one question open at a time in
   * `CustomQuestionForm`, and the file they can be saved to and loaded from. On a phone
   * the form is a sheet over the whole page, where a question has the screen to itself.
   *
   * Each question takes one of the room's random-event slots, so the slot count is the
   * cap, and `RandomEvents` above shows it before the host writes a question that will
   * not fit rather than after. Rounds and frequency can still change under a full list;
   * then Create refuses to submit and this panel says why.
   */
  import {
    EXPORT_FILENAME,
    TYPE_LABELS,
    askedBy,
    exportText,
    importText,
    overCap,
    type CustomQuestion,
  } from '../lib/customQuestions'
  import type { EventFrequency } from '../lib/protocol'
  import CustomQuestionForm from './CustomQuestionForm.svelte'
  import NpcFace from './NpcFace.svelte'
  import Sheet from './Sheet.svelte'

  let {
    questions = $bindable(),
    editing = $bindable(),
    slots,
    frequency,
    atMore,
    sheet = false,
  }: {
    questions: CustomQuestion[]
    /** Whether a question is open in the form, which Create will not submit past. */
    editing: boolean
    /** Random events the rounds make room for at `frequency`. */
    slots: number
    frequency: EventFrequency
    /** The same at `more`, to say whether it would help. */
    atMore: number
    /** Write in a sheet over the page, as a phone does, rather than in the list. */
    sheet?: boolean
  } = $props()

  /** The question open in the form: its place in the list, `new` for one being added, or null. */
  let open = $state<number | 'new' | null>(null)
  let importErrors = $state<string[]>([])
  let fileInput: HTMLInputElement | undefined = $state()

  /** The most of a bad file's problems listed; the rest are counted. */
  const SHOWN_ERRORS = 8

  const over = $derived(overCap(questions.length, slots, frequency, atMore))
  const full = $derived(questions.length >= slots)

  $effect(() => {
    editing = open !== null
  })

  function save(question: CustomQuestion): void {
    if (open === 'new') questions = [...questions, question]
    else if (open !== null) questions = questions.map((q, i) => (i === open ? question : q))
    open = null
  }

  function remove(index: number): void {
    questions = questions.filter((_, i) => i !== index)
  }

  function move(index: number, by: number): void {
    const to = index + by
    if (to < 0 || to >= questions.length) return
    const moved = [...questions]
    const [question] = moved.splice(index, 1)
    if (question === undefined) return
    moved.splice(to, 0, question)
    questions = moved
  }

  function download(): void {
    const url = URL.createObjectURL(new Blob([exportText(questions)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = EXPORT_FILENAME
    link.click()
    URL.revokeObjectURL(url)
  }

  async function load(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    // Cleared so picking the same file again, after fixing it, is a change.
    input.value = ''
    if (file === undefined) return
    const result = importText(await file.text())
    if (!result.ok) {
      importErrors = result.errors
      return
    }
    const tooMany = overCap(result.questions.length, slots, frequency, atMore)
    if (tooMany !== null) {
      importErrors = [`This file has ${result.questions.length} questions. ${tooMany}`]
      return
    }
    importErrors = []
    questions = result.questions
    open = null
  }
</script>

{#snippet editor(question: CustomQuestion | undefined)}
  <CustomQuestionForm {question} onsave={save} oncancel={() => (open = null)} />
{/snippet}

<section class="panel own" aria-labelledby="own-title">
  <div class="head">
    <h2 id="own-title">Write your own</h2>
    <span class="tag">Optional</span>
  </div>
  <p class="note">
    An NPC asks each one in place of a random event. Perfect for your clan's in-jokes.
  </p>

  {#if questions.length > 0}
    <ol class="list">
      {#each questions as question, index (question)}
        <li>
          {#if open === index && !sheet}
            {@render editor(question)}
          {:else}
            <div class="summary">
              <span class="face"><NpcFace npc={question.random_event} /></span>
              <div class="words">
                <p class="prompt">{question.payload.prompt}</p>
                <p class="note">{TYPE_LABELS[question.type]} · {askedBy(question)}</p>
              </div>
              <div class="row actions">
                <button
                  type="button"
                  class="small"
                  aria-label="Move question {index + 1} earlier"
                  disabled={index === 0}
                  onclick={() => move(index, -1)}>↑</button
                >
                <button
                  type="button"
                  class="small"
                  aria-label="Move question {index + 1} later"
                  disabled={index === questions.length - 1}
                  onclick={() => move(index, 1)}>↓</button
                >
                <button
                  type="button"
                  class="small"
                  aria-label="Edit question {index + 1}"
                  disabled={open !== null}
                  onclick={() => (open = index)}>Edit</button
                >
                <button
                  type="button"
                  class="small"
                  aria-label="Remove question {index + 1}"
                  onclick={() => remove(index)}>Remove</button
                >
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  {#if open === 'new' && !sheet}
    {@render editor(undefined)}
  {/if}

  {#if open !== null && sheet}
    <Sheet
      full
      label={open === 'new' ? 'New question' : 'Edit question'}
      onclose={() => (open = null)}
    >
      <div class="in-sheet">{@render editor(open === 'new' ? undefined : questions[open])}</div>
    </Sheet>
  {/if}

  {#if over !== null}
    <p class="error" role="alert">{over}</p>
  {/if}

  <div class="row tools">
    {#if open !== 'new' || sheet}
      <button type="button" disabled={full || open !== null} onclick={() => (open = 'new')}>
        Write a question
      </button>
    {/if}
    <button type="button" onclick={() => fileInput?.click()}>Import…</button>
    <button type="button" disabled={questions.length === 0} onclick={download}>Export</button>
    <input
      bind:this={fileInput}
      class="sr"
      type="file"
      accept=".json,application/json"
      aria-label="Questions file to import"
      tabindex="-1"
      onchange={load}
    />
  </div>
  {#if full && questions.length > 0 && over === null && open === null}
    <p class="note">
      Every random event is already one of yours. Add round questions or pick More frequency to
      write another.
    </p>
  {/if}

  {#if importErrors.length > 0}
    <div class="banner bad" role="alert">
      <p>Nothing was imported:</p>
      <ul>
        {#each importErrors.slice(0, SHOWN_ERRORS) as message (message)}
          <li>{message}</li>
        {/each}
      </ul>
      {#if importErrors.length > SHOWN_ERRORS}
        <p>And {importErrors.length - SHOWN_ERRORS} more.</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .own > .note {
    margin: 0.2rem 0 1rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
  }

  /* The sheet is the editor's frame on a phone; a second one inside it only costs width. */
  .in-sheet :global(.editor) {
    padding: 0;
    border: none;
    background: none;
  }

  .face {
    flex: none;
    width: 2.6rem;
    height: 2.85rem;
    display: grid;
    place-items: end center;
    overflow: hidden;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 6px);
    background: var(--panel-raised);
  }

  .list {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--line);
  }

  .words {
    flex: 1 1 14rem;
    min-width: 0;
  }

  .words p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .tools {
    margin-top: 1rem;
  }

  .banner ul {
    margin: 0.4rem 0;
    padding-left: 1.25rem;
  }

  .banner p {
    margin: 0;
  }
</style>
