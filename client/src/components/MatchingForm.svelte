<script lang="ts">
  /**
   * A `matching` question being written, with the question as players will see it beside
   * the fields. Create, `/suggest` and `/admin` all write it here.
   *
   * Each pair is a field and the answer that belongs on it, side by side, so `answer`
   * follows and the author never types an index. Decoys follow, answers that belong on no
   * field, up to the gems there are in all. With `icons`, a field may be an `item:` or
   * `npc:` picture as well as or instead of a name: only a pack question shows one. Sort
   * into bins writes the bins instead, then each entry with the bin it goes in.
   * `fields` adds a caller's own fields below the question's, and `onattempt` checks those
   * on every Save. A caller that also takes other types passes them in `picker`, and
   * picking one hands it back. Who asks it is `asker`, as in `CustomQuestionForm`.
   *
   * Like the other forms, nothing is red until the first Save except a limit that is
   * already broken, and Save hands back only a question `problems` passes.
   */
  import type { OpenQuestion } from '../lib/protocol'
  import type { Snippet } from 'svelte'

  import {
    BINS_MAX,
    BINS_MIN,
    DETAIL_MAX,
    ENTRIES_MAX,
    ENTRIES_MIN,
    FIELDS_MAX,
    FIELDS_MIN,
    OPTIONS_MAX,
    TEXT_MAX,
    blankEntry,
    draftOf,
    previewOf,
    problems,
    questionOf,
    type MatchingQuestion,
  } from '../lib/matching'
  import { QuestionForm } from '../lib/questionForm.svelte'
  import QuestionFormShell from './QuestionFormShell.svelte'
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
    head = undefined,
    inQuestion = undefined,
    inExtras = undefined,
    stepQuestion = undefined,
    stepDifficulty = undefined,
    stepExtras = undefined,
    fields: more = undefined,
    onattempt = () => true,
    onnpc = undefined,
    ondraft = undefined,
    onprogress = undefined,
    nearSave = undefined,
    preview = undefined,
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
    /** Shown above the editor's columns, such as `/suggest`'s progress line. */
    head?: Snippet
    /** Extra fields inside the core question step. */
    inQuestion?: Snippet
    /** Extra fields inside the optional extras step. */
    inExtras?: Snippet<[boolean]>
    /** Wraps the core question fields in a step card when given. */
    stepQuestion?: Snippet<[Snippet]>
    /** Renders the difficulty step card when given. */
    stepDifficulty?: Snippet
    /** Wraps the optional extras fields in a step card when given. */
    stepExtras?: Snippet<[Snippet]>
    /** More fields, under the question's own. */
    fields?: Snippet<[boolean]>
    /** Whether those fields are fine, asked on every Save. */
    onattempt?: () => boolean
    /** Told who asks it whenever that changes, `''` for nobody yet. */
    onnpc?: (npc: string) => void
    /** Told the question whenever it changes: whole, or `undefined` while it has problems. */
    ondraft?: (question: MatchingQuestion | undefined) => void
    /** Told whether the core question and optional extras pass, as the player types. */
    onprogress?: (state: {
      questionDone: boolean
      extrasFilled: boolean
      extrasValid: boolean
    }) => void
    /** Shown just above Save. */
    nearSave?: Snippet
    /** Draws the preview in place of the stage, from the question as it shows open. */
    preview?: Snippet<[OpenQuestion]>
    onsave: (question: MatchingQuestion) => void
    oncancel: () => void
  } = $props()

  // The form starts from the question it was opened on and owns the draft from then on.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftOf(question))
  // svelte-ignore state_referenced_locally
  let npc = $state(question?.random_event ?? '')
  $effect(() => onnpc?.(npc))
  const id = $props.id()

  const built = $derived(questionOf(draft))
  const asked = $derived<MatchingQuestion>(
    asker === 'none' || npc === '' ? built : { ...built, random_event: npc },
  )
  const total = $derived(draft.pairs.length + draft.decoys.length)

  const KINDS = [
    { value: false, label: 'Match pairs' },
    { value: true, label: 'Sort into bins' },
  ]

  /** Bin `index` gone, its entries to the first bin and the later bins' down one. */
  function removeBin(index: number): void {
    draft.bins.splice(index, 1)
    for (const entry of draft.entries) {
      if (entry.bin === index) entry.bin = 0
      else if (entry.bin > index) entry.bin -= 1
    }
  }

  /** Paths the form has a place for; anything else is listed under the form. */
  const PLACED =
    /^(payload\.(prompt|fields(\[\d+\](\.(text|icon))?)?|options(\[\d+\](\.(text|detail))?)?|explanation)|random_event)$/

  const form = new QuestionForm({
    asked: () => asked,
    problems: () => problems(built, icons),
    unnamed: () => asker === 'required' && npc === '',
    placed: (path) => PLACED.test(path) || (intro && path === 'payload.intro'),
    extras: new Set(['payload.intro', 'payload.explanation']),
    extrasFilled: () => (intro && draft.intro.trim() !== '') || draft.explanation.trim() !== '',
    onattempt: () => onattempt(),
    onsave: (question) => onsave(question),
    ondraft: () => ondraft,
    onprogress: () => onprogress,
  })
  const errorsAt = (paths: string[]): string[] => form.errorsAt(paths)
</script>

{#snippet errors(paths: string[])}
  {#each errorsAt(paths) as message (message)}
    <p class="error">{message}</p>
  {/each}
{/snippet}

{#snippet chooser()}
  {#if picker !== undefined}
    <Segmented
      legend="How players answer"
      options={picker.options}
      bind:value={() => 'matching', (type) => type !== 'matching' && picker?.onpick(type)}
    />
  {/if}
{/snippet}

{#snippet payload()}
  <Segmented legend="Match or sort" options={KINDS} bind:value={draft.sorting} />

  {#if draft.sorting}
    <fieldset class="field">
      <legend>Bins: where the entries go</legend>
      {#each draft.bins as bin, index (index)}
        <div class="pair">
          <div class="inputs">
            <input
              type="text"
              aria-label="Bin {index + 1}"
              placeholder="Bin {index + 1}, such as Saradomin"
              bind:value={bin.option}
            />
            <input
              type="text"
              aria-label="Detail of bin {index + 1}"
              placeholder="Shown at the reveal, optional"
              bind:value={bin.detail}
            />
          </div>
          <button
            type="button"
            class="small"
            aria-label="Remove bin {index + 1}"
            disabled={draft.bins.length <= BINS_MIN}
            onclick={() => removeBin(index)}>✕</button
          >
        </div>
        {@render errors([`payload.options[${index}].text`, `payload.options[${index}].detail`])}
      {/each}
      <button
        type="button"
        class="small"
        disabled={draft.bins.length >= BINS_MAX}
        onclick={() => draft.bins.push({ option: '', detail: '' })}>Add a bin</button
      >
      {@render errors(['payload.options'])}
    </fieldset>

    <fieldset class="field">
      <legend>Entries: each and the bin it goes in</legend>
      {#each draft.entries as entry, index (index)}
        <div class="pair">
          <div class="inputs">
            <input
              type="text"
              aria-label="Entry {index + 1}"
              placeholder="Entry {index + 1}, such as Saradomin brew"
              bind:value={entry.field}
            />
            {#if icons}
              <input
                type="text"
                aria-label="Picture of entry {index + 1}"
                placeholder="item:4151 or npc:2042, optional"
                bind:value={entry.icon}
              />
            {/if}
            <select aria-label="Bin of entry {index + 1}" bind:value={entry.bin}>
              {#each draft.bins as bin, at (at)}
                <option value={at}>{bin.option.trim() || `Bin ${at + 1}`}</option>
              {/each}
            </select>
          </div>
          <button
            type="button"
            class="small"
            aria-label="Remove entry {index + 1}"
            disabled={draft.entries.length <= ENTRIES_MIN}
            onclick={() => draft.entries.splice(index, 1)}>✕</button
          >
        </div>
        {@render errors([`payload.fields[${index}].text`, `payload.fields[${index}].icon`])}
      {/each}
      <button
        type="button"
        class="small"
        disabled={draft.entries.length >= ENTRIES_MAX}
        onclick={() => draft.entries.push(blankEntry())}>Add an entry</button
      >
      <p class="note">
        {BINS_MIN} to {BINS_MAX} bins and {ENTRIES_MIN} to {ENTRIES_MAX} entries, up to {TEXT_MAX}
        characters each and {DETAIL_MAX} for a detail. A bin may stay empty.
      </p>
      {@render errors(['payload.fields'])}
    </fieldset>
  {:else}
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
        onclick={() => draft.decoys.push({ option: '', detail: '' })}>Add a left-over answer</button
      >
      <p class="note">
        {FIELDS_MIN} to {FIELDS_MAX} pairs and {OPTIONS_MAX} answers in all, up to {TEXT_MAX} characters
        each and {DETAIL_MAX} for a detail. Left-over answers keep the last field from being a giveaway.
      </p>
      {@render errors(['payload.options'])}
    </fieldset>
  {/if}
{/snippet}

<QuestionFormShell
  {id}
  type="matching"
  {mode}
  {form}
  fresh={question === undefined}
  {title}
  {saveLabel}
  {asker}
  bind:npc
  {chooser}
  {intro}
  bind:introText={draft.intro}
  bind:prompt={draft.prompt}
  promptLabel="Question"
  {payload}
  bind:explanationText={draft.explanation}
  enterOnRadio
  {head}
  {inQuestion}
  {inExtras}
  {stepQuestion}
  {stepDifficulty}
  {stepExtras}
  fields={more}
  {nearSave}
  previewNote="What players will see, with the answers shuffled"
  shown={asker === 'none' ? previewOf(built, mode) : previewOf(asked, mode)}
  {preview}
  {oncancel}
/>

<style>
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

  :global(.fields) .note {
    margin: 0.3rem 0 0;
  }
</style>
