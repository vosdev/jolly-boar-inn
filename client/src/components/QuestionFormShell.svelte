<script lang="ts">
  /**
   * What every question form wraps around its own fields: the title, who asks it, the
   * intro, the question, the explanation, the caller's fields, the problems with no place
   * of their own, Save and Cancel, and beside them the preview. `CustomQuestionForm`,
   * `OrderingForm` and `MatchingForm` hand in their type's fields as `payload` and their
   * type picker as `chooser`, and keep their draft and its `QuestionForm`.
   *
   * The form's `id` is passed in rather than made here, so the ids its own fields and the
   * shell's share one prefix.
   */
  import { fieldHints } from '../lib/placeholders'
  import type { OpenQuestion } from '../lib/protocol'
  import type { QuestionForm } from '../lib/questionForm.svelte'
  import type { Snippet } from 'svelte'

  import { codePoints, field, limit } from '../lib/questionSchema'
  import NpcPicker from './NpcPicker.svelte'
  import QuestionStage from './QuestionStage.svelte'
  import RandomEvent from './RandomEvent.svelte'

  let {
    id,
    type,
    mode,
    form,
    fresh,
    title = undefined,
    saveLabel = undefined,
    asker,
    npc = $bindable(''),
    chooser = undefined,
    intro,
    introText = $bindable(''),
    prompt = $bindable(''),
    promptLabel,
    promptRows = 2,
    promptFixed = false,
    payload,
    explanation = true,
    explanationText = $bindable(''),
    enterOnRadio = false,
    head = undefined,
    inQuestion = undefined,
    inExtras = undefined,
    stepQuestion = undefined,
    stepDifficulty = undefined,
    stepExtras = undefined,
    fields = undefined,
    nearSave = undefined,
    previewNote,
    shown,
    preview = undefined,
    oncancel,
  }: {
    /** The form's own `$props.id()`. */
    id: string
    /** The question type whose schema limits the shared fields. */
    type: string
    /** The round it is previewed in. */
    mode: string
    /** The form's state: only what the shell reads of it, whatever question it builds. */
    form: Pick<QuestionForm<unknown>, 'attempted' | 'unplaced' | 'errorsAt' | 'save'>
    /** Whether it is a new question rather than one being edited. */
    fresh: boolean
    title?: string | undefined
    saveLabel?: string | undefined
    asker: 'optional' | 'required' | 'fixed' | 'none'
    /** Who asks it, `''` for nobody yet. */
    npc?: string
    /** How players answer, between the asker and the intro. */
    chooser?: Snippet | undefined
    /** Whether the intro shows. */
    intro: boolean
    introText?: string
    prompt?: string
    promptLabel: string
    promptRows?: number
    /** Whether the prompt is the round's own, shown but not editable. */
    promptFixed?: boolean
    /** The type's own fields, under the prompt. */
    payload: Snippet
    /** Whether the explanation shows. */
    explanation?: boolean
    explanationText?: string
    /** Whether Enter on a radio button saves, as it does on a text field. */
    enterOnRadio?: boolean
    head?: Snippet | undefined
    inQuestion?: Snippet | undefined
    inExtras?: Snippet<[boolean]> | undefined
    stepQuestion?: Snippet<[Snippet]> | undefined
    stepDifficulty?: Snippet | undefined
    stepExtras?: Snippet<[Snippet]> | undefined
    fields?: Snippet<[boolean]> | undefined
    nearSave?: Snippet | undefined
    /** The line above the preview. */
    previewNote: string
    /** The question as the preview shows it open. */
    shown: OpenQuestion
    preview?: Snippet<[OpenQuestion]> | undefined
    oncancel: () => void
  } = $props()

  const hints = $derived(fieldHints(mode))
  const promptMax = $derived(limit(field(type, 'prompt'), 'maxLength'))
  const introMax = $derived(limit(field(type, 'intro'), 'maxLength'))
  const explanationMax = $derived(limit(field(type, 'explanation'), 'maxLength'))
  const save = (): void => form.save()

  // Enter in a field would submit Create's form, and with it the room. Here it saves the
  // question instead, as it would in a form of its own.
  function enter(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return
    if (!enterOnRadio && event.target.type === 'radio') return
    event.preventDefault()
    save()
  }

  function enterSaves(node: HTMLElement): () => void {
    node.addEventListener('keydown', enter)
    return () => node.removeEventListener('keydown', enter)
  }
</script>

{#snippet errors(path: string)}
  {#each form.errorsAt(path) as message (message)}
    <p class="error">{message}</p>
  {/each}
{/snippet}

{#snippet introField()}
  {#if intro}
    <div class="field">
      <label for="{id}-intro">Intro, a line in the asker's voice before the question</label>
      <textarea id="{id}-intro" rows="2" bind:value={introText}></textarea>
      <p class="note counter">{codePoints(introText.trim())}/{introMax}</p>
      {@render errors('payload.intro')}
    </div>
  {/if}
{/snippet}

{#snippet questionBody()}
  {#if asker === 'optional' || asker === 'required'}
    <NpcPicker bind:value={npc} {asker} errors={form.errorsAt('random_event')} />
  {/if}

  {@render chooser?.()}

  {#if !stepExtras}
    {@render introField()}
  {/if}

  <div class="field">
    <label for="{id}-prompt">{promptLabel}</label>
    <textarea
      id="{id}-prompt"
      rows={promptRows}
      placeholder={promptFixed ? undefined : hints.prompt}
      bind:value={prompt}
      readonly={promptFixed}></textarea>
    <p class="note counter">{codePoints(prompt.trim())}/{promptMax}</p>
    {@render errors('payload.prompt')}
  </div>

  {@render payload()}

  {@render inQuestion?.()}
{/snippet}

{#snippet extrasBody()}
  {#if stepExtras}
    {@render introField()}
  {/if}
  {@render inExtras?.(form.attempted)}
  {#if explanation}
    <div class="field">
      <label for="{id}-explanation">Explanation shown after the question finished.</label>
      <textarea
        id="{id}-explanation"
        rows="2"
        placeholder={hints.explanation}
        bind:value={explanationText}></textarea>
      <p class="note counter">{codePoints(explanationText.trim())}/{explanationMax}</p>
      {@render errors('payload.explanation')}
    </div>
  {/if}
{/snippet}

<!-- A form of its own would nest inside Create's, which HTML does not allow, so this is a
     group whose Save button does the submitting. -->
<div class="editor surface" role="group" aria-labelledby="{id}-title" {@attach enterSaves}>
  {@render head?.()}
  <div class="layout">
    <div class="fields">
      <h3 id="{id}-title">
        {title ?? (fresh ? 'New question' : 'Edit question')}
      </h3>
      {#if stepQuestion}
        {@render stepQuestion(questionBody)}
      {:else}
        {@render questionBody()}
      {/if}

      {#if stepDifficulty}
        {@render stepDifficulty()}
      {/if}

      {#if stepExtras}
        {@render stepExtras(extrasBody)}
      {:else}
        {@render extrasBody()}
      {/if}

      {@render fields?.(form.attempted)}

      {#each form.unplaced as problem (problem.path + problem.message)}
        <p class="error">{problem.path}: {problem.message}</p>
      {/each}

      {@render nearSave?.()}

      <div class="row">
        <button type="button" class="primary" onclick={save}>
          {saveLabel ?? (fresh ? 'Add question' : 'Save question')}
        </button>
        <button type="button" onclick={oncancel}>Cancel</button>
      </div>
    </div>

    <section class="preview" aria-label="Preview">
      <p class="note">{previewNote}</p>
      {#if preview}
        {@render preview(shown)}
      {:else if asker === 'none'}
        <QuestionStage question={shown} yourValue={null} onAnswer={() => {}} />
      {:else}
        <RandomEvent question={shown} yourValue={null} onAnswer={() => {}} />
      {/if}
    </section>
  </div>
</div>

<style>
  .editor {
    container-type: inline-size;
    padding: 1rem;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel-raised);
  }

  /* The preview beside the fields where there is room, under them on a phone. */
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

  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .counter {
    margin: 0.2rem 0 0;
    text-align: right;
  }

  .fields .note {
    margin: 0.3rem 0 0;
  }

  .preview {
    min-width: 0;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
  }
</style>
