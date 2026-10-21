<script lang="ts">
  /**
   * A `matching` question being written, with the question as players will see it beside
   * the fields. Create, `/suggest` and `/admin` all write it here.
   *
   * Each pair is a field and the answer that belongs on it, side by side, so `answer`
   * follows and the author never types an index. Decoys follow, answers that belong on no
   * field, up to the gems there are in all. With `icons`, a field may be an `item:` or
   * `npc:` picture as well as or instead of a name: only a pack question shows one.
   * `fields` adds a caller's own fields below the question's, and `onattempt` checks those
   * on every Save. A caller that also takes other types passes them in `picker`, and
   * picking one hands it back. Who asks it is `asker`, as in `CustomQuestionForm`.
   *
   * Like the other forms, nothing is red until the first Save except a limit that is
   * already broken, and Save hands back only a question `problems` passes.
   */
  import type { Snippet } from 'svelte'

  import {
    DETAIL_MAX,
    FIELDS_MAX,
    FIELDS_MIN,
    OPTIONS_MAX,
    TEXT_MAX,
    draftOf,
    previewOf,
    problems,
    questionOf,
    type MatchingQuestion,
  } from '../lib/matching'
  import { codePoints, field, limit, type Problem } from '../lib/questionSchema'
  import NpcPicker from './NpcPicker.svelte'
  import QuestionStage from './QuestionStage.svelte'
  import RandomEvent from './RandomEvent.svelte'
  import Segmented from './Segmented.svelte'

  let {
    question = undefined,
    title = undefined,
    mode = 'custom',
    asker = 'none',
    intro = false,
    icons = false,
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
    question?: MatchingQuestion
    title?: string
    /** The round it is previewed in. */
    mode?: string
    /** Who asks it: an NPC or the room's draw, an NPC that must be named, the one it came with, or the round. */
    asker?: 'optional' | 'required' | 'fixed' | 'none'
    /** Whether the intro shows, an NPC's line before the question. */
    intro?: boolean
    /** Whether a field may be a picture: a pack question's only. */
    icons?: boolean
    /** Every type offered, in order, and what to do with one another form writes. */
    picker?: { options: { value: string; label: string }[]; onpick: (type: string) => void }
    saveLabel?: string
    /** More fields, under the question's own. */
    fields?: Snippet<[boolean]>
    /** Whether those fields are fine, asked on every Save. */
    onattempt?: () => boolean
    /** Told who asks it whenever that changes, `''` for nobody yet. */
    onnpc?: (npc: string) => void
    /** Told the question whenever it changes: whole, or `undefined` while it has problems. */
    ondraft?: (question: MatchingQuestion | undefined) => void
    /** Shown just above Save. */
    nearSave?: Snippet
    onsave: (question: MatchingQuestion) => void
    oncancel: () => void
  } = $props()

  const PROMPT_MAX = limit(field('matching', 'prompt'), 'maxLength') ?? 0
  const EXPLANATION_MAX = limit(field('matching', 'explanation'), 'maxLength') ?? 0
  const INTRO_MAX = limit(field('matching', 'intro'), 'maxLength') ?? 0

  // The form starts from the question it was opened on and owns the draft from then on.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftOf(question))
  // svelte-ignore state_referenced_locally
  let npc = $state(question?.random_event ?? '')
  $effect(() => onnpc?.(npc))
  let attempted = $state(false)
  const id = $props.id()

  const built = $derived(questionOf(draft))
  const unnamed: Problem = { path: 'random_event', message: 'Pick who asks it.', kind: 'missing' }
  const asked = $derived<MatchingQuestion>(
    asker === 'none' || npc === '' ? built : { ...built, random_event: npc },
  )
  const found = $derived([
    ...problems(built, icons),
    ...(asker === 'required' && npc === '' ? [unnamed] : []),
  ])
  const shown = $derived(attempted ? found : found.filter((problem) => problem.kind === 'limit'))
  const total = $derived(draft.pairs.length + draft.decoys.length)

  /** Paths the form has a place for; anything else is listed under the form. */
  const PLACED =
    /^(payload\.(prompt|fields(\[\d+\](\.(text|icon))?)?|options(\[\d+\](\.(text|detail))?)?|explanation)|random_event)$/
  const unplaced = $derived(
    shown.filter(
      (problem) => !PLACED.test(problem.path) && !(intro && problem.path === 'payload.intro'),
    ),
  )

  function errorsAt(paths: string[]): string[] {
    return shown.filter((problem) => paths.includes(problem.path)).map((problem) => problem.message)
  }

  $effect(() => ondraft?.(found.length === 0 ? asked : undefined))

  function save(): void {
    attempted = true
    const rest = onattempt()
    if (found.length === 0 && rest) onsave(asked)
  }

  // Enter in a field would submit Create's form, and with it the room. Here it saves the
  // question instead, as it would in a form of its own.
  function enter(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return
    event.preventDefault()
    save()
  }

  function enterSaves(node: HTMLElement): () => void {
    node.addEventListener('keydown', enter)
    return () => node.removeEventListener('keydown', enter)
  }
</script>

{#snippet errors(paths: string[])}
  {#each errorsAt(paths) as message (message)}
    <p class="error">{message}</p>
  {/each}
{/snippet}

<!-- A form of its own would nest inside another form, which HTML does not allow, so this is
     a group whose Save button does the submitting. -->
<div class="editor surface" role="group" aria-labelledby="{id}-title" {@attach enterSaves}>
  <div class="layout">
    <div class="fields">
      <h3 id="{id}-title">
        {title ?? (question === undefined ? 'New question' : 'Edit question')}
      </h3>
      {#if asker === 'optional' || asker === 'required'}
        <NpcPicker bind:value={npc} {asker} errors={errorsAt(['random_event'])} />
      {/if}

      {#if picker !== undefined}
        <Segmented
          legend="How players answer"
          options={picker.options}
          bind:value={() => 'matching', (type) => type !== 'matching' && picker?.onpick(type)}
        />
      {/if}

      {#if intro}
        <div class="field">
          <label for="{id}-intro">Intro, a line in the asker's voice before the question</label>
          <textarea id="{id}-intro" rows="2" bind:value={draft.intro}></textarea>
          <p class="note counter">{codePoints(draft.intro.trim())}/{INTRO_MAX}</p>
          {@render errors(['payload.intro'])}
        </div>
      {/if}

      <div class="field">
        <label for="{id}-prompt">Question</label>
        <textarea id="{id}-prompt" rows="2" bind:value={draft.prompt}></textarea>
        <p class="note counter">{codePoints(draft.prompt.trim())}/{PROMPT_MAX}</p>
        {@render errors(['payload.prompt'])}
      </div>

      <fieldset class="field">
        <legend>Pairs: each field and the answer that goes on it</legend>
        {#each draft.pairs as pair, index (index)}
          <div class="pair">
            <div class="inputs">
              <input
                type="text"
                aria-label="Field {index + 1}"
                placeholder="Field {index + 1}, such as Zulrah"
                bind:value={pair.field}
              />
              {#if icons}
                <input
                  type="text"
                  aria-label="Picture of field {index + 1}"
                  placeholder="item:4151 or npc:2042, optional"
                  bind:value={pair.icon}
                />
              {/if}
              <input
                type="text"
                aria-label="Answer for field {index + 1}"
                placeholder="Its answer, such as Zul-Andra"
                bind:value={pair.option}
              />
              <input
                type="text"
                aria-label="Detail of answer {index + 1}"
                placeholder="Shown at the reveal, optional"
                bind:value={pair.detail}
              />
            </div>
            <button
              type="button"
              class="small"
              aria-label="Remove pair {index + 1}"
              disabled={draft.pairs.length <= FIELDS_MIN}
              onclick={() => draft.pairs.splice(index, 1)}>✕</button
            >
          </div>
          {@render errors([`payload.fields[${index}].text`, `payload.fields[${index}].icon`])}
          {@render errors([`payload.options[${index}].text`, `payload.options[${index}].detail`])}
        {/each}
        <button
          type="button"
          class="small"
          disabled={draft.pairs.length >= FIELDS_MAX || total >= OPTIONS_MAX}
          onclick={() => draft.pairs.push({ field: '', icon: '', option: '', detail: '' })}
          >Add a pair</button
        >
        {@render errors(['payload.fields'])}
      </fieldset>

      <fieldset class="field">
        <legend>Left over: answers that go on no field</legend>
        {#each draft.decoys as decoy, index (index)}
          {@const at = draft.pairs.length + index}
          <div class="pair">
            <div class="inputs">
              <input
                type="text"
                aria-label="Left-over answer {index + 1}"
                placeholder="An answer that fits no field"
                bind:value={decoy.option}
              />
              <input
                type="text"
                aria-label="Detail of left-over answer {index + 1}"
                placeholder="Shown at the reveal, optional"
                bind:value={decoy.detail}
              />
            </div>
            <button
              type="button"
              class="small"
              aria-label="Remove left-over answer {index + 1}"
              onclick={() => draft.decoys.splice(index, 1)}>✕</button
            >
          </div>
          {@render errors([`payload.options[${at}].text`, `payload.options[${at}].detail`])}
        {/each}
        <button
          type="button"
          class="small"
          disabled={total >= OPTIONS_MAX}
          onclick={() => draft.decoys.push({ option: '', detail: '' })}
          >Add a left-over answer</button
        >
        <p class="note">
          {FIELDS_MIN} to {FIELDS_MAX} pairs and {OPTIONS_MAX} answers in all, up to {TEXT_MAX} characters
          each and {DETAIL_MAX} for a detail. Left-over answers keep the last field from being a giveaway.
        </p>
        {@render errors(['payload.options'])}
      </fieldset>

      <div class="field">
        <label for="{id}-explanation">Explanation shown after the question finished.</label>
        <textarea id="{id}-explanation" rows="2" bind:value={draft.explanation}></textarea>
        <p class="note counter">{codePoints(draft.explanation.trim())}/{EXPLANATION_MAX}</p>
        {@render errors(['payload.explanation'])}
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
      <p class="note">What players will see, with the answers shuffled</p>
      {#if asker === 'none'}
        <QuestionStage question={previewOf(built, mode)} yourValue={null} onAnswer={() => {}} />
      {:else}
        <RandomEvent question={previewOf(asked, mode)} yourValue={null} onAnswer={() => {}} />
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

  .pair {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .inputs {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
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
