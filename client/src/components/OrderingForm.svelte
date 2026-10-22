<script lang="ts">
  /**
   * An `ordering` question being written, with the question as players will see it beside
   * the fields. It is the form behind Sort It Out suggestions (`routes/Suggest.svelte`).
   *
   * Entries are written first to last under the labels of the two ends. A tie is a box on
   * an entry, "Tied with the one above", so the author never types a rank and none is
   * skipped; the number beside each entry is the place it holds, equal across a tie.
   * `fields` adds the suggestion's own fields below the question's, and `onattempt` checks
   * those on every Save. A round that also takes other types passes them in `picker`, and
   * picking one hands it back. A random event's names its NPC, with `asker`, and offers the
   * intro, with `intro`, and is previewed on the NPC's card.
   *
   * Like `CustomQuestionForm`, nothing is red until the first Save except a limit that is
   * already broken, and Save hands back only a question `problems` passes.
   */
  import { fieldHints } from '../lib/placeholders'
  import type { OpenQuestion } from '../lib/protocol'
  import type { Snippet } from 'svelte'

  import {
    DETAIL_MAX,
    ENDS_MAX,
    ENTRIES_MAX,
    ENTRIES_MIN,
    PICKS_MIN,
    TEXT_MAX,
    draftOf,
    picksMax,
    previewOf,
    problems,
    questionOf,
    ranksOf,
    wordingOf,
    type OrderingQuestion,
  } from '../lib/ordering'
  import { codePoints, field, limit, type Problem } from '../lib/questionSchema'
  import NpcPicker from './NpcPicker.svelte'
  import QuestionStage from './QuestionStage.svelte'
  import RandomEvent from './RandomEvent.svelte'
  import Segmented from './Segmented.svelte'

  let {
    question = undefined,
    title = undefined,
    mode = 'sort_it_out',
    asker = 'none',
    intro = false,
    picker = undefined,
    saveLabel = undefined,
    fields: more = undefined,
    onattempt = () => true,
    onnpc = undefined,
    ondraft = undefined,
    nearSave = undefined,
    preview = undefined,
    onsave,
    oncancel,
  }: {
    /** The question to edit, or none for a new one. */
    question?: OrderingQuestion
    title?: string
    /** The round it is previewed in. */
    mode?: string
    /** Who asks it: an NPC that must be named, or the round. */
    asker?: 'required' | 'none'
    /** Whether the intro shows, an NPC's line before the question. */
    intro?: boolean
    /** Every type the round offers, in order, and what to do with one another form writes. */
    picker?: { options: { value: string; label: string }[]; onpick: (type: string) => void }
    saveLabel?: string
    /** More fields, under the question's own. */
    fields?: Snippet<[boolean]>
    /** Whether those fields are fine, asked on every Save. */
    onattempt?: () => boolean
    /** Told who asks it whenever that changes, `''` for nobody yet. */
    onnpc?: (npc: string) => void
    /** Told the question whenever it changes: whole, or `undefined` while it has problems. */
    ondraft?: (question: OrderingQuestion | undefined) => void
    /** Shown just above Save. */
    nearSave?: Snippet
    /** Draws the preview in place of the stage, from the question as it shows open. */
    preview?: Snippet<[OpenQuestion]>
    onsave: (question: OrderingQuestion) => void
    oncancel: () => void
  } = $props()

  const PROMPT_MAX = limit(field('ordering', 'prompt'), 'maxLength') ?? 0
  const EXPLANATION_MAX = limit(field('ordering', 'explanation'), 'maxLength') ?? 0
  const INTRO_MAX = limit(field('ordering', 'intro'), 'maxLength') ?? 0

  // The form starts from the question it was opened on and owns the draft from then on.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftOf(question))
  // svelte-ignore state_referenced_locally
  let npc = $state(question?.random_event ?? '')
  $effect(() => onnpc?.(npc))
  let attempted = $state(false)
  const id = $props.id()

  const built = $derived(questionOf(draft))
  const hints = $derived(fieldHints(mode))
  const wording = $derived(wordingOf(mode))
  const unnamed: Problem = { path: 'random_event', message: 'Pick who asks it.', kind: 'missing' }
  const found = $derived([
    ...problems(built, wording.detailRequired),
    ...(asker === 'required' && npc === '' ? [unnamed] : []),
  ])
  const asked = $derived(asker === 'required' ? { ...built, random_event: npc } : built)
  const shown = $derived(attempted ? found : found.filter((problem) => problem.kind === 'limit'))
  const ranks = $derived(ranksOf(draft.entries))
  const pickChoices = $derived(
    Array.from(
      { length: Math.max(0, picksMax(draft.entries.length) - PICKS_MIN + 1) },
      (_, i) => PICKS_MIN + i,
    ),
  )

  /** Paths the form has a place for; anything else is listed under the form. */
  const PLACED =
    /^(payload\.(prompt|ends\[\d\]|entries(\[\d+\](\.(text|detail))?)?|picks|explanation)|random_event)$/
  const unplaced = $derived(
    shown.filter(
      (problem) => !PLACED.test(problem.path) && !(intro && problem.path === 'payload.intro'),
    ),
  )

  function errorsAt(path: string): string[] {
    return shown.filter((problem) => problem.path === path).map((problem) => problem.message)
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
    if (event.target.type === 'radio') return
    event.preventDefault()
    save()
  }

  function enterSaves(node: HTMLElement): () => void {
    node.addEventListener('keydown', enter)
    return () => node.removeEventListener('keydown', enter)
  }

  /** `picks` must stay fewer than the entries; lowering it is better than a form that refuses. */
  function fitPicks(): void {
    if (draft.picks === null) return
    const most = picksMax(draft.entries.length)
    draft.picks = most >= PICKS_MIN ? Math.min(draft.picks, most) : null
  }

  function removeEntry(index: number): void {
    draft.entries.splice(index, 1)
    if (draft.entries[0] !== undefined) draft.entries[0].tied = false
    fitPicks()
  }

  function move(index: number, by: -1 | 1): void {
    const entries = draft.entries
    const other = index + by
    if (other < 0 || other >= entries.length) return
    ;[entries[index], entries[other]] = [entries[other]!, entries[index]!]
    // The first has nothing above it to tie with.
    entries[0]!.tied = false
  }
</script>

{#snippet errors(path: string)}
  {#each errorsAt(path) as message (message)}
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
      {#if asker === 'required'}
        <NpcPicker bind:value={npc} {asker} errors={errorsAt('random_event')} />
      {/if}

      {#if picker !== undefined}
        <Segmented
          legend="How players answer"
          options={picker.options}
          bind:value={() => 'ordering', (type) => type !== 'ordering' && picker?.onpick(type)}
        />
      {/if}

      {#if intro}
        <div class="field">
          <label for="{id}-intro">Intro, a line in the asker's voice before the question</label>
          <textarea id="{id}-intro" rows="2" bind:value={draft.intro}></textarea>
          <p class="note counter">{codePoints(draft.intro.trim())}/{INTRO_MAX}</p>
          {@render errors('payload.intro')}
        </div>
      {/if}

      <div class="field">
        <label for="{id}-prompt">{wording.prompt}</label>
        <textarea id="{id}-prompt" rows="2" placeholder={hints.prompt} bind:value={draft.prompt}
        ></textarea>
        <p class="note counter">{codePoints(draft.prompt.trim())}/{PROMPT_MAX}</p>
        {@render errors('payload.prompt')}
      </div>

      <div class="pair">
        <div class="field">
          <label for="{id}-first">First end</label>
          <input
            id="{id}-first"
            type="text"
            placeholder={wording.ends[0]}
            bind:value={draft.ends[0]}
          />
          <p class="note counter">{codePoints(draft.ends[0].trim())}/{ENDS_MAX}</p>
          {@render errors('payload.ends[0]')}
        </div>
        <div class="field">
          <label for="{id}-last">Last end</label>
          <input
            id="{id}-last"
            type="text"
            placeholder={wording.ends[1]}
            bind:value={draft.ends[1]}
          />
          <p class="note counter">{codePoints(draft.ends[1].trim())}/{ENDS_MAX}</p>
          {@render errors('payload.ends[1]')}
        </div>
      </div>

      <fieldset class="field">
        <legend>Entries, first to last</legend>
        {#each draft.entries as entry, index (index)}
          <div class="entry">
            <span class="place" aria-hidden="true">{ranks[index]}</span>
            <div class="inputs">
              <input type="text" aria-label="Entry {index + 1}" bind:value={entry.text} />
              <input
                type="text"
                aria-label="Detail of entry {index + 1}"
                placeholder={wording.detail}
                bind:value={entry.detail}
              />
              {#if index > 0}
                <label class="check">
                  <input type="checkbox" bind:checked={entry.tied} />
                  Tied with the one above
                </label>
              {/if}
            </div>
            <span class="moves">
              <button
                type="button"
                class="small"
                aria-label="Move entry {index + 1} up"
                disabled={index === 0}
                onclick={() => move(index, -1)}>↑</button
              >
              <button
                type="button"
                class="small"
                aria-label="Move entry {index + 1} down"
                disabled={index === draft.entries.length - 1}
                onclick={() => move(index, 1)}>↓</button
              >
              <button
                type="button"
                class="small"
                aria-label="Remove entry {index + 1}"
                disabled={draft.entries.length <= ENTRIES_MIN}
                onclick={() => removeEntry(index)}>✕</button
              >
            </span>
          </div>
          {@render errors(`payload.entries[${index}]`)}
          {@render errors(`payload.entries[${index}].text`)}
          {@render errors(`payload.entries[${index}].detail`)}
        {/each}
        <button
          type="button"
          class="small"
          disabled={draft.entries.length >= ENTRIES_MAX}
          onclick={() => draft.entries.push({ text: '', detail: '', tied: false })}
          >Add an entry</button
        >
        <p class="note">
          {ENTRIES_MIN} to {ENTRIES_MAX} entries, up to {TEXT_MAX} characters each and {DETAIL_MAX}
          for a detail. Tied entries take the same place, and players may put them either way round.
          {#if wording.detailRequired}Entries that came out on one day are tied.{/if}
        </p>
        {@render errors('payload.entries')}
      </fieldset>

      {#if pickChoices.length > 0}
        <div class="field">
          <label for="{id}-picks">Players order</label>
          <select
            id="{id}-picks"
            bind:value={
              () => (draft.picks === null ? '' : String(draft.picks)),
              (value) => (draft.picks = value === '' ? null : Number(value))
            }
          >
            <option value="">Every entry</option>
            {#each pickChoices as count (count)}
              <option value={String(count)}>Only the first {count}</option>
            {/each}
          </select>
          <p class="note">
            With fewer, the rest are decoys: players must pick the right ones as well as order them.
          </p>
          {@render errors('payload.picks')}
        </div>
      {/if}

      <div class="field">
        <label for="{id}-explanation">Explanation shown after the question finished.</label>
        <textarea
          id="{id}-explanation"
          rows="2"
          placeholder={hints.explanation}
          bind:value={draft.explanation}></textarea>
        <p class="note counter">{codePoints(draft.explanation.trim())}/{EXPLANATION_MAX}</p>
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
      <p class="note">What players will see, with the entries shuffled</p>
      {#if preview}
        {@render preview(asker === 'none' ? previewOf(built, mode) : previewOf(asked, mode))}
      {:else if asker === 'none'}
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
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .entry {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .place {
    flex: none;
    width: 1.6rem;
    padding-top: 0.45rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .inputs {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.35rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }

  .moves {
    flex: none;
    display: flex;
    gap: 0.25rem;
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
