<script lang="ts">
  /**
   * One pack question being edited in `/admin`: its type's form, held to the type and the
   * NPC it has, with the links it was checked against and its credit under it.
   *
   * Choice, typed, number and pick-all questions use Create's form with the intro and picture pack
   * questions carry; an ordering question uses `/suggest`'s, and a matching question its own,
   * with a picture per field. A type no form writes yet is
   * edited as its payload's JSON, which the server checks on Save.
   */
  import { CUSTOM_TYPES, type CustomQuestion, type CustomType } from '../../lib/customQuestions'
  import { nameProblem, NAME_MAX } from '../../lib/names'
  import type { MatchingQuestion } from '../../lib/matching'
  import type { OrderingQuestion } from '../../lib/ordering'
  import {
    envelopeOf,
    parsePayload,
    showsExplanation,
    showsQuote,
    type QuestionEdit,
  } from '../../lib/questionEdits'
  import type { PackQuestion } from '../../lib/reports'
  import { sourceProblems } from '../../lib/suggestions'
  import CustomQuestionForm from '../CustomQuestionForm.svelte'
  import MatchingForm from '../MatchingForm.svelte'
  import OrderingForm from '../OrderingForm.svelte'

  let {
    question,
    onsave,
    oncancel,
  }: {
    question: PackQuestion
    onsave: (edit: QuestionEdit) => void
    oncancel: () => void
  } = $props()

  const FORM_TYPES: readonly string[] = CUSTOM_TYPES
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
  const matching: MatchingQuestion | null =
    start.type === 'matching'
      ? {
          type: 'matching',
          payload,
          ...(start.random_event === undefined ? {} : { random_event: start.random_event }),
        }
      : null

  const links = $derived(sourceProblems(wiki, sourceUrl))
  const creditError = $derived(credit.trim() === '' ? null : nameProblem(credit))
  const parsed = $derived(parsePayload(json))

  function envelopePasses(): boolean {
    attempted = true
    return links.wiki === null && links.source_url === null && creditError === null
  }

  function send(next: Record<string, unknown>): void {
    onsave({ payload: next, ...envelopeOf({ wiki, sourceUrl, credit, creditShown }) })
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
    explanation={showsExplanation(start.mode)}
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
{:else if matching !== null}
  <MatchingForm
    question={matching}
    title="Edit question"
    mode={start.mode}
    asker={start.random_event === undefined ? 'none' : 'fixed'}
    intro={start.random_event !== undefined}
    icons
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
        <div class="field">
          <label for="{id}-json">Payload, as JSON</label>
          <textarea id="{id}-json" class="code" rows="14" spellcheck="false" bind:value={json}
          ></textarea>
          <p class="note">No form writes this type yet. The server checks it on Save.</p>
          {@render problem(typeof parsed === 'string' ? parsed : null, true)}
        </div>
        {@render envelope(attempted)}
        {@render buttons(saveJson)}
      </div>
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
</style>
