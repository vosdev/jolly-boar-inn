<script lang="ts">
  /**
   * One pack question being edited in `/admin`: its type's form, held to the type and the
   * NPC it has, with the links it was checked against and its credit under it.
   *
   * Choice, typed and number questions use Create's form with the intro and picture pack
   * questions carry; an ordering question uses `/suggest`'s. An examine line answers from
   * the names its list already has, picked by name: a new name stays with suggestions,
   * whose import gives it an id. A type no form writes yet is edited as its payload's JSON,
   * which the server checks on Save.
   */
  import { onMount } from 'svelte'

  import type { CustomQuestion, CustomType } from '../../lib/customQuestions'
  import { nameProblem, NAME_MAX } from '../../lib/names'
  import type { OrderingQuestion } from '../../lib/ordering'
  import { envelopeOf, parsePayload, showsQuote, type QuestionEdit } from '../../lib/questionEdits'
  import type { PackQuestion } from '../../lib/reports'
  import { examinePreview, sourceProblems } from '../../lib/suggestions'
  import { fold, loadVocab, type VocabEntry } from '../../lib/vocab'
  import CustomQuestionForm from '../CustomQuestionForm.svelte'
  import OrderingForm from '../OrderingForm.svelte'
  import QuestionStage from '../QuestionStage.svelte'

  let {
    question,
    onsave,
    oncancel,
  }: {
    question: PackQuestion
    onsave: (edit: QuestionEdit) => void
    oncancel: () => void
  } = $props()

  const FORM_TYPES: readonly string[] = ['multiple_choice', 'free_text', 'closest_number']
  const SAVE = 'Queue the edit'
  const id = $props.id()

  // The form starts from the question it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = question
  const payload = start.payload
  let wiki = $state(start.wiki ?? '')
  let sourceUrl = $state(start.source_url ?? '')
  let credit = $state(start.credit ?? '')
  let creditShown = $state(start.credit_shown ?? false)
  let attempted = $state(false)

  let prompt = $state(typeof payload.prompt === 'string' ? payload.prompt : '')
  let answerName = $state(
    typeof (payload.subject as { name?: unknown } | undefined)?.name === 'string'
      ? (payload.subject as { name: string }).name
      : '',
  )
  let entries = $state<readonly VocabEntry[]>([])
  let json = $state(JSON.stringify(payload, null, 2))

  const custom: CustomQuestion | null = FORM_TYPES.includes(start.type)
    ? {
        type: start.type as CustomType,
        payload,
        ...(start.random_event === undefined ? {} : { random_event: start.random_event }),
      }
    : null
  const ordering: OrderingQuestion | null =
    start.type === 'ordering' ? { type: 'ordering', payload } : null

  onMount(() => {
    if (start.type !== 'pick_from_list' || typeof payload.vocab !== 'string') return
    loadVocab(payload.vocab).then(
      (list) => (entries = list.entries),
      () => (entries = []),
    )
  })

  const links = $derived(sourceProblems(wiki, sourceUrl))
  const creditError = $derived(credit.trim() === '' ? null : nameProblem(credit))
  const answer = $derived(entries.find((entry) => fold(entry.name) === fold(answerName.trim())))
  const answerError = $derived(
    answerName.trim() === ''
      ? 'Required: what it belongs to.'
      : answer === undefined
        ? 'Not a name in the list. A new name is added through a suggestion.'
        : null,
  )
  const parsed = $derived(parsePayload(json))

  function envelopePasses(): boolean {
    attempted = true
    return links.wiki === null && links.source_url === null && creditError === null
  }

  function send(next: Record<string, unknown>): void {
    onsave({ payload: next, ...envelopeOf({ wiki, sourceUrl, credit, creditShown }) })
  }

  function saveListed(): void {
    if (!envelopePasses() || answerError !== null || answer === undefined) return
    const subject = { ...(payload.subject as object), name: answer.name }
    send({ ...payload, prompt: prompt.trim(), answer_id: answer.id, subject })
  }

  function saveJson(): void {
    if (!envelopePasses() || typeof parsed === 'string') return
    send(parsed)
  }
</script>

{#snippet problem(message: string | null, show: boolean)}
  {#if show && message !== null}
    <p class="error">{message}</p>
  {/if}
{/snippet}

{#snippet envelope(show: boolean)}
  <div class="field">
    <label for="{id}-wiki">Wiki page it was checked on</label>
    <input id="{id}-wiki" type="text" inputmode="url" bind:value={wiki} />
    {@render problem(links.wiki, show)}
  </div>
  <div class="field">
    <label for="{id}-source">Another source, for what the wiki can’t show</label>
    <input id="{id}-source" type="text" inputmode="url" bind:value={sourceUrl} />
    {@render problem(links.source_url, show)}
  </div>
  <fieldset class="credit">
    <legend>Credit</legend>
    <div class="field">
      <label for="{id}-credit">Suggested by</label>
      <input id="{id}-credit" type="text" maxlength={NAME_MAX} bind:value={credit} />
      {@render problem(creditError, show)}
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={creditShown} disabled={credit.trim() === ''} />
      The reveal names them
    </label>
  </fieldset>
{/snippet}

{#snippet buttons(save: () => void)}
  <div class="row actions">
    <button type="button" class="primary" onclick={save}>{SAVE}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
{/snippet}

{#if custom !== null}
  <CustomQuestionForm
    question={custom}
    title="Edit question"
    types={[custom.type]}
    asker={start.random_event === undefined ? 'none' : 'fixed'}
    mode={start.mode}
    quote={showsQuote(start.mode)}
    pack
    saveLabel={SAVE}
    fields={envelope}
    onattempt={envelopePasses}
    onsave={(built) => send(built.payload)}
    {oncancel}
  />
{:else if ordering !== null}
  <OrderingForm
    question={ordering}
    title="Edit question"
    mode={start.mode}
    saveLabel={SAVE}
    fields={envelope}
    onattempt={envelopePasses}
    onsave={(built) => send(built.payload)}
    {oncancel}
  />
{:else}
  <div class="editor surface" role="group" aria-labelledby="{id}-title">
    <div class="layout">
      <div class="fields">
        <h3 id="{id}-title">Edit question</h3>
        {#if start.type === 'pick_from_list'}
          <div class="field">
            <label for="{id}-prompt">The line players read</label>
            <textarea id="{id}-prompt" rows="2" bind:value={prompt}></textarea>
          </div>
          <div class="field">
            <label for="{id}-answer">What it belongs to</label>
            <input id="{id}-answer" type="text" list="{id}-names" bind:value={answerName} />
            <datalist id="{id}-names">
              {#each entries as entry (entry.id)}
                <option value={entry.name}></option>
              {/each}
            </datalist>
            {@render problem(answerError, attempted)}
          </div>
        {:else}
          <div class="field">
            <label for="{id}-json">Payload, as JSON</label>
            <textarea id="{id}-json" class="code" rows="14" spellcheck="false" bind:value={json}></textarea>
            <p class="note">No form writes this type yet. The server checks it on Save.</p>
            {@render problem(typeof parsed === 'string' ? parsed : null, true)}
          </div>
        {/if}
        {@render envelope(attempted)}
        {@render buttons(start.type === 'pick_from_list' ? saveListed : saveJson)}
      </div>
      {#if start.type === 'pick_from_list'}
        <section class="preview" aria-label="Preview">
          <p class="note">What players will see</p>
          <QuestionStage question={examinePreview(prompt)} yourValue={null} onAnswer={() => {}} stemOnly />
        </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .editor {
    container-type: inline-size;
    padding: 1rem;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel-raised);
  }

  .layout {
    display: grid;
    gap: 1.25rem;
  }

  @container (min-width: 46rem) {
    .layout {
      grid-template-columns: 3fr 2fr;
      align-items: start;
    }
  }

  .fields,
  .preview {
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

  textarea.code {
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
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

  .preview > .note {
    margin: 0 0 0.5rem;
  }
</style>
