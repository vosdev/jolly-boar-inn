<script lang="ts">
  /**
   * One of the host's questions being written: its type's fields, who asks it, and beside
   * them the random event as players will see it. Choice answers wear the gem of their
   * position, as players will see them, and say which is right.
   *
   * A suggestion is written in it too (`routes/Suggest.svelte`): there the types may be
   * fewer, the NPC may be required or, for a round's question, not asked at all, and
   * `fields` adds the suggestion's own below. `onattempt` checks those on every Save, and
   * the question is handed back only when both pass. `/admin` edits a pack question in it,
   * with `pack` for the intro and picture pack questions carry, and its NPC `fixed`. A
   * suggestion for an NPC's question offers the intro alone, with `intro`. A round that also
   * sorts lists its `ordering` in `picker`, which hands that pick back to swap forms.
   *
   * Save only hands back a question `problems` passes. Until the first try, only the
   * limits show (too long, too many, a repeated answer); what is still empty waits for
   * Save, so a fresh form is not a page of red.
   */
  import type { Snippet } from 'svelte'

  import {
    CUSTOM_TYPES,
    TYPE_LABELS,
    draftOf,
    previewOf,
    problems,
    questionOf,
    type CustomQuestion,
    type CustomType,
  } from '../lib/customQuestions'
  import { codePoints, field, limit, type Problem } from '../lib/questionSchema'
  import NpcPicker from './NpcPicker.svelte'
  import QuestionStage from './QuestionStage.svelte'
  import { GEMS } from './questions/GemButton.svelte'
  import RandomEvent from './RandomEvent.svelte'
  import Segmented from './Segmented.svelte'

  let {
    question = undefined,
    title = undefined,
    types = CUSTOM_TYPES,
    asker = 'optional',
    mode = 'custom',
    quote = false,
    promptFixed = false,
    optionRange = undefined,
    pack = false,
    intro = false,
    picker = undefined,
    saveLabel = undefined,
    fields: more = undefined,
    onattempt = () => true,
    onnpc = undefined,
    ondraft = undefined,
    nearSave = undefined,
    onsave,
    oncancel,
  }: {
    /** The question to edit, or none for a new one. */
    question?: CustomQuestion
    title?: string
    /** The types offered, the first of them for a new question. */
    types?: readonly CustomType[]
    /**
     * Who asks it: an NPC or the room's draw, an NPC that must be named, the NPC it came
     * with, or the round.
     */
    asker?: 'optional' | 'required' | 'fixed' | 'none'
    /** The round a question with no NPC is previewed in. */
    mode?: string
    /** Whether a multiple-choice question may carry a quotation under its prompt. */
    quote?: boolean
    /** Whether the prompt is the round's own, shown but not editable. */
    promptFixed?: boolean
    /** How many options a multiple-choice question offers, when the round is stricter than the schema. */
    optionRange?: readonly [number, number]
    /** Whether the intro and the picture show, which only pack questions carry. */
    pack?: boolean
    /** Whether the intro shows without the picture. */
    intro?: boolean
    /** Every type the round offers, in order, and what to do with one this form does not write. */
    picker?: { options: { value: string; label: string }[]; onpick: (type: string) => void }
    saveLabel?: string
    /** More fields, under the question's own. */
    fields?: Snippet<[boolean]>
    /** Whether those fields are fine, asked on every Save. */
    onattempt?: () => boolean
    /** Told who asks it whenever that changes, `''` for nobody yet. */
    onnpc?: (npc: string) => void
    /** Told the question whenever it changes: whole, or `undefined` while it has problems. */
    ondraft?: (question: CustomQuestion | undefined) => void
    /** Shown just above Save. */
    nearSave?: Snippet
    onsave: (question: CustomQuestion) => void
    oncancel: () => void
  } = $props()

  const PICK_ALL = 'pick_all_that_apply'
  const choicesOf = (type: CustomType) => (type === PICK_ALL ? PICK_ALL : 'multiple_choice')
  const ACCEPTED_MIN = limit(field('free_text', 'accepted'), 'minItems') ?? 0
  const ACCEPTED_MAX = limit(field('free_text', 'accepted'), 'maxItems') ?? 0
  const DISTANCE_MIN = limit(field('free_text', 'max_distance'), 'minimum') ?? 0
  const DISTANCE_MAX = limit(field('free_text', 'max_distance'), 'maximum') ?? 0
  const DISTANCES = Array.from({ length: DISTANCE_MAX - DISTANCE_MIN + 1 }, (_, i) => ({
    value: String(DISTANCE_MIN + i),
    label: String(DISTANCE_MIN + i),
  }))
  const offered = $derived(
    picker?.options ?? types.map((type) => ({ value: type, label: TYPE_LABELS[type] })),
  )

  // The form starts from the question it was opened on and owns the draft from then on.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftOf(question))
  // svelte-ignore state_referenced_locally
  if (!types.includes(draft.type)) draft.type = types[0] ?? draft.type
  $effect(() => onnpc?.(draft.npc))
  // svelte-ignore state_referenced_locally
  const [rangeMin, rangeMax] = optionRange ?? [0, Infinity]
  if (draft.type === 'multiple_choice')
    while (draft.options.length < rangeMin) draft.options.push('')
  let attempted = $state(false)
  const ranged = $derived(draft.type === 'multiple_choice')
  const schemaMin = $derived(limit(field(choicesOf(draft.type), 'options'), 'minItems') ?? 0)
  const schemaMax = $derived(limit(field(choicesOf(draft.type), 'options'), 'maxItems') ?? 0)
  const optionsMin = $derived(ranged ? Math.max(schemaMin, rangeMin) : schemaMin)
  const optionsMax = $derived(ranged ? Math.min(schemaMax, rangeMax) : schemaMax)
  const id = $props.id()

  const promptMax = $derived(limit(field(draft.type, 'prompt'), 'maxLength'))
  const quoteMax = limit(field('multiple_choice', 'quote'), 'maxLength')
  const introMax = $derived(limit(field(draft.type, 'intro'), 'maxLength'))
  const explanationMax = $derived(limit(field(draft.type, 'explanation'), 'maxLength'))
  const built = $derived(questionOf(draft))
  const unnamed: Problem = { path: 'random_event', message: 'Pick who asks it.', kind: 'missing' }
  const found = $derived([
    ...problems(built),
    ...(asker === 'required' && draft.npc === '' ? [unnamed] : []),
  ])
  const shown = $derived(attempted ? found : found.filter((problem) => problem.kind === 'limit'))

  /** Paths the form has a place for; anything else is listed under the form. */
  const PLACED =
    /^(payload\.(prompt|quote|options|answer_index|answer_indices|picks|accepted|max_distance|answer|unit|explanation)(\[\d+\])?|random_event)$/
  const showIntro = $derived(pack || intro)
  const unplaced = $derived(
    shown.filter(
      (problem) =>
        !PLACED.test(problem.path) &&
        !(showIntro && problem.path === 'payload.intro') &&
        !(pack && problem.path === 'payload.image'),
    ),
  )

  function errorsAt(path: string): string[] {
    return shown.filter((problem) => problem.path === path).map((problem) => problem.message)
  }

  $effect(() => ondraft?.(found.length === 0 ? built : undefined))

  function save(): void {
    attempted = true
    const rest = onattempt()
    if (found.length === 0 && rest) onsave(built)
  }

  // Enter in a field would submit Create's form, and with it the room. Here it saves the
  // question instead, as it would in a form of its own.
  function enter(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return
    if (event.target.type === 'radio') return
    event.preventDefault()
    save()
  }

  function enterSaves(node: HTMLElement): () => void {
    node.addEventListener('keydown', enter)
    return () => node.removeEventListener('keydown', enter)
  }

  function gem(index: number): string {
    return `--fill: var(--gem-${GEMS[index % GEMS.length]})`
  }

  function addOption(): void {
    draft.options.push('')
  }

  function removeOption(index: number): void {
    draft.options.splice(index, 1)
    if (draft.answerIndex === index) draft.answerIndex = 0
    else if (draft.answerIndex > index) draft.answerIndex -= 1
    draft.answerIndices = draft.answerIndices
      .filter((right) => right !== index)
      .map((right) => (right > index ? right - 1 : right))
  }

  function tick(index: number, right: boolean): void {
    const others = draft.answerIndices.filter((ticked) => ticked !== index)
    draft.answerIndices = right ? [...others, index] : others
  }

  // Multiple choice may have two answers and pick all that apply needs three, so switching
  // adds the blank one rather than greeting the switch with an error.
  function setType(type: CustomType): void {
    draft.type = type
    const least = limit(field(choicesOf(type), 'options'), 'minItems') ?? 0
    if (type === PICK_ALL) while (draft.options.length < least) draft.options.push('')
  }
</script>

{#snippet errors(path: string)}
  {#each errorsAt(path) as message (message)}
    <p class="error">{message}</p>
  {/each}
{/snippet}

<!-- A form of its own would nest inside Create's, which HTML does not allow, so this is a
     group whose Save button does the submitting. -->
<div class="editor surface" role="group" aria-labelledby="{id}-title" {@attach enterSaves}>
  <div class="layout">
    <div class="fields">
      <h3 id="{id}-title">
        {title ?? (question === undefined ? 'New question' : 'Edit question')}
      </h3>
      {#if asker === 'optional' || asker === 'required'}
        <NpcPicker bind:value={draft.npc} {asker} errors={errorsAt('random_event')} />
      {/if}

      {#if offered.length > 1}
        <Segmented
          legend="How players answer"
          options={offered}
          bind:value={
            () => draft.type,
            (type) =>
              types.includes(type as CustomType)
                ? setType(type as CustomType)
                : picker?.onpick(type)
          }
        />
      {/if}

      {#if showIntro}
        <div class="field">
          <label for="{id}-intro">Intro, a line in the asker's voice before the question</label>
          <textarea id="{id}-intro" rows="2" bind:value={draft.intro}></textarea>
          <p class="note counter">{codePoints(draft.intro.trim())}/{introMax}</p>
          {@render errors('payload.intro')}
        </div>
      {/if}

      <div class="field">
        <label for="{id}-prompt">Question</label>
        <textarea id="{id}-prompt" rows="3" bind:value={draft.prompt} readonly={promptFixed}
        ></textarea>
        <p class="note counter">{codePoints(draft.prompt.trim())}/{promptMax}</p>
        {@render errors('payload.prompt')}
      </div>

      {#if draft.type === 'multiple_choice' && (quote || draft.quote !== '')}
        <div class="field">
          <label for="{id}-quote"
            >The quotation, if the question asks about words someone said</label
          >
          <textarea id="{id}-quote" rows="2" bind:value={draft.quote}></textarea>
          <p class="note counter">{codePoints(draft.quote.trim())}/{quoteMax}</p>
          {@render errors('payload.quote')}
        </div>
      {/if}

      {#if draft.type === 'multiple_choice'}
        <fieldset class="field">
          <legend>Answers · tick the right one</legend>
          {#each draft.options as _, index (index)}
            {@const right = draft.answerIndex === index}
            <div class="option answer" class:right style={gem(index)}>
              <input
                type="radio"
                name="{id}-correct"
                aria-label="Answer {index + 1} is right"
                checked={right}
                onchange={() => (draft.answerIndex = index)}
              />
              <input
                type="text"
                aria-label="Answer {index + 1}"
                bind:value={draft.options[index]}
              />
              {#if right}
                <span class="mark">Right</span>
              {:else}
                <button
                  type="button"
                  class="remove"
                  aria-label="Remove answer {index + 1}"
                  disabled={draft.options.length <= optionsMin}
                  onclick={() => removeOption(index)}>✕</button
                >
              {/if}
            </div>
            {@render errors(`payload.options[${index}]`)}
          {/each}
          <button
            type="button"
            class="small"
            disabled={draft.options.length >= optionsMax}
            onclick={addOption}>Add an answer</button
          >
          <p class="note">{optionsMin} to {optionsMax} answers.</p>
          {@render errors('payload.options')}
          {@render errors('payload.answer_index')}
        </fieldset>
      {:else if draft.type === PICK_ALL}
        <fieldset class="field">
          <legend>Answers · tick every right one</legend>
          {#each draft.options as _, index (index)}
            {@const right = draft.answerIndices.includes(index)}
            <div class="option answer" class:right style={gem(index)}>
              <input
                type="checkbox"
                aria-label="Answer {index + 1} is right"
                checked={right}
                onchange={(event) => tick(index, event.currentTarget.checked)}
              />
              <input
                type="text"
                aria-label="Answer {index + 1}"
                bind:value={draft.options[index]}
              />
              {#if right}
                <span class="mark">Right</span>
              {:else}
                <button
                  type="button"
                  class="remove"
                  aria-label="Remove answer {index + 1}"
                  disabled={draft.options.length <= optionsMin}
                  onclick={() => removeOption(index)}>✕</button
                >
              {/if}
            </div>
            {@render errors(`payload.options[${index}]`)}
          {/each}
          <button
            type="button"
            class="small"
            disabled={draft.options.length >= optionsMax}
            onclick={addOption}>Add an answer</button
          >
          <p class="note">
            {optionsMin} to {optionsMax} answers: at least one right, and one wrong.
          </p>
          {@render errors('payload.options')}
          {@render errors('payload.answer_indices')}
        </fieldset>
        <div class="field">
          <label class="check">
            <input type="checkbox" bind:checked={draft.picksShown} />
            Tell players how many are right
          </label>
          {@render errors('payload.picks')}
        </div>
      {:else if draft.type === 'free_text'}
        <fieldset class="field">
          <legend>Answers that count</legend>
          {#each draft.accepted as _, index (index)}
            <div class="option">
              <input
                type="text"
                aria-label="Accepted answer {index + 1}"
                bind:value={draft.accepted[index]}
              />
              <button
                type="button"
                class="small"
                aria-label="Remove accepted answer {index + 1}"
                disabled={draft.accepted.length <= ACCEPTED_MIN}
                onclick={() => draft.accepted.splice(index, 1)}>✕</button
              >
            </div>
            {@render errors(`payload.accepted[${index}]`)}
          {/each}
          <button
            type="button"
            class="small"
            disabled={draft.accepted.length >= ACCEPTED_MAX}
            onclick={() => draft.accepted.push('')}>Add another spelling</button
          >
          <p class="note">Case, accents, punctuation and spacing never count against a player.</p>
          {@render errors('payload.accepted')}
        </fieldset>
        <div class="field">
          <Segmented
            legend="Typos allowed"
            options={DISTANCES}
            bind:value={
              () => String(draft.maxDistance), (value) => (draft.maxDistance = Number(value))
            }
          />
          <p class="note">Answers under four letters must always match exactly.</p>
          {@render errors('payload.max_distance')}
        </div>
      {:else}
        <div class="pair">
          <div class="field">
            <label for="{id}-answer">Answer</label>
            <input id="{id}-answer" type="text" inputmode="decimal" bind:value={draft.answer} />
            {@render errors('payload.answer')}
          </div>
          <div class="field">
            <label for="{id}-unit">Unit, if any</label>
            <input id="{id}-unit" type="text" placeholder="gp" bind:value={draft.unit} />
            {@render errors('payload.unit')}
          </div>
        </div>
        <p class="note closest">The closest guess wins, ties included.</p>
      {/if}

      {#if pack}
        <div class="field">
          <label for="{id}-image">Picture, if any</label>
          <input
            id="{id}-image"
            type="text"
            placeholder="item:4151 or npc:2042"
            bind:value={draft.image}
          />
          {@render errors('payload.image')}
        </div>
      {/if}

      <div class="field">
        <label for="{id}-explanation">Explanation shown after the question finished.</label>
        <textarea id="{id}-explanation" rows="2" bind:value={draft.explanation}></textarea>
        <p class="note counter">{codePoints(draft.explanation.trim())}/{explanationMax}</p>
        {@render errors('payload.explanation')}
      </div>

      {@render more?.(attempted)}

      {#each unplaced as problem (problem.path + problem.message)}
        <p class="error">{problem.path}: {problem.message}</p>
      {/each}

      {@render nearSave?.()}

      <div class="row">
        <button type="button" class="primary" onclick={save}>
          {saveLabel ?? (question === undefined ? 'Add question' : 'Save question')}
        </button>
        <button type="button" onclick={oncancel}>Cancel</button>
      </div>
    </div>

    <section class="preview" aria-label="Preview">
      <p class="note">What players will see</p>
      {#if asker === 'none'}
        <QuestionStage question={previewOf(built, mode)} yourValue={null} onAnswer={() => {}} />
      {:else}
        <RandomEvent question={previewOf(built)} yourValue={null} onAnswer={() => {}} />
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

  .fields > :global(.segmented) {
    margin-bottom: 1rem;
  }

  /* Four ways to answer do not fit a phone in one row; two by two they keep their names whole. */
  @container (max-width: 26rem) {
    .fields > :global(.segmented .segments) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.4rem;
      width: 100%;
      border: none;
      overflow: visible;
    }

    .fields > :global(.segmented label) {
      display: grid;
      place-items: center;
      min-height: 2.75rem;
      white-space: normal;
      text-align: center;
      border: var(--border-width) solid var(--line);
      border-radius: min(var(--radius), 8px);
    }

    .fields > :global(.segmented label:has(:checked)) {
      border-color: var(--accent);
    }
  }

  fieldset {
    border: none;
    padding: 0;
    margin: 0 0 1rem;
    min-width: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.3rem;
    font-size: 0.9rem;
    color: var(--muted);
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

  .option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .option input[type='radio'],
  .option input[type='checkbox'] {
    flex: none;
    width: 1.05rem;
    height: 1.05rem;
    accent-color: var(--accent);
  }

  .option button {
    flex: none;
  }

  .answer {
    gap: 0;
    padding-left: 0.65rem;
    color: var(--gem-ink);
    background: var(--fill);
    border: var(--border-width) solid color-mix(in srgb, var(--gem-ink) 35%, transparent);
    border-radius: min(var(--radius), 8px);
  }

  .answer.right {
    border-color: var(--gem-ink);
    box-shadow: inset 0 0 0 1px var(--gem-ink);
  }

  .answer input[type='text'] {
    min-height: 2.75rem;
    color: var(--gem-ink);
    background: transparent;
    border: none;
  }

  .answer input[type='text']:focus-visible {
    outline-color: var(--gem-ink);
    outline-offset: -3px;
  }

  .answer input[type='radio'],
  .answer input[type='checkbox'] {
    appearance: none;
    margin: 0;
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid var(--gem-ink);
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }

  .answer input[type='checkbox'] {
    border-radius: 4px;
  }

  .answer input:checked {
    background: var(--gem-ink);
    box-shadow: inset 0 0 0 3px var(--fill);
  }

  .answer input[type='radio']:focus-visible,
  .answer input[type='checkbox']:focus-visible {
    outline-color: var(--gem-ink);
  }

  /* The mark and the remove button share a width, so every answer's text starts and ends alike. */
  .mark,
  .remove {
    flex: none;
    width: 3.25rem;
    text-align: center;
  }

  .mark {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .remove {
    min-height: 2.75rem;
    padding: 0;
    color: var(--gem-ink);
    background: transparent;
    border: none;
  }

  .pair {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
  }

  .preview {
    min-width: 0;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
  }

  .fields .note {
    margin: 0.3rem 0 0;
  }

  .fields .closest {
    margin: -0.5rem 0 1rem;
  }
</style>
