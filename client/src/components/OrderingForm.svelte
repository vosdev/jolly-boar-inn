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
  import { QuestionForm } from '../lib/questionForm.svelte'
  import { codePoints } from '../lib/questionSchema'
  import QuestionFormShell from './QuestionFormShell.svelte'
  import Segmented from './Segmented.svelte'

  let {
    question = undefined,
    title = undefined,
    mode = 'sort_it_out',
    asker = 'none',
    intro = false,
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
    ondraft?: (question: OrderingQuestion | undefined) => void
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
    onsave: (question: OrderingQuestion) => void
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
  const wording = $derived(wordingOf(mode))
  const asked = $derived(asker === 'required' ? { ...built, random_event: npc } : built)
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
  const form = new QuestionForm({
    asked: () => asked,
    problems: () => problems(built),
    unnamed: () => asker === 'required' && npc === '',
    placed: (path) => PLACED.test(path) || (intro && path === 'payload.intro'),
    extras: new Set(['payload.intro', 'payload.explanation']),
    extrasFilled: () => (intro && draft.intro.trim() !== '') || draft.explanation.trim() !== '',
    onattempt: () => onattempt(),
    onsave: (question) => onsave(question),
    ondraft: () => ondraft,
    onprogress: () => onprogress,
  })
  const errorsAt = (path: string): string[] => form.errorsAt(path)

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

{#snippet chooser()}
  {#if picker !== undefined}
    <Segmented
      legend="How players answer"
      options={picker.options}
      bind:value={() => 'ordering', (type) => type !== 'ordering' && picker?.onpick(type)}
    />
  {/if}
{/snippet}

{#snippet payload()}
  <div class="pair">
    <div class="field">
      <label for="{id}-first">First end</label>
      <input id="{id}-first" type="text" placeholder={wording.ends[0]} bind:value={draft.ends[0]} />
      <p class="note counter">{codePoints(draft.ends[0].trim())}/{ENDS_MAX}</p>
      {@render errors('payload.ends[0]')}
    </div>
    <div class="field">
      <label for="{id}-last">Last end</label>
      <input id="{id}-last" type="text" placeholder={wording.ends[1]} bind:value={draft.ends[1]} />
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
            onclick={() => move(index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            class="small"
            aria-label="Move entry {index + 1} down"
            disabled={index === draft.entries.length - 1}
            onclick={() => move(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            class="small"
            aria-label="Remove entry {index + 1}"
            disabled={draft.entries.length <= ENTRIES_MIN}
            onclick={() => removeEntry(index)}
          >
            ✕
          </button>
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
    >
      Add an entry
    </button>
    <p class="note">
      {ENTRIES_MIN} to {ENTRIES_MAX} entries, up to {TEXT_MAX} characters each and {DETAIL_MAX}
      for a detail. Tied entries take the same place, and players may put them either way round.
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
{/snippet}

<QuestionFormShell
  {id}
  type="ordering"
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
  promptLabel={wording.prompt}
  {payload}
  bind:explanationText={draft.explanation}
  {head}
  {inQuestion}
  {inExtras}
  {stepQuestion}
  {stepDifficulty}
  {stepExtras}
  fields={more}
  {nearSave}
  previewNote="What players will see, with the entries shuffled"
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

  :global(.fields) .note {
    margin: 0.3rem 0 0;
  }
</style>
