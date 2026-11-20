<script lang="ts">
  /**
   * One suggestion being written, or edited in the operator's queue: the fields of its
   * kind, the wiki page that proves it, and the credit.
   *
   * A question is Create's editor, held to the types its mode offers: an NPC's question
   * names its NPC, a round's names none and is previewed in its round, and one sent with no
   * round is saved with no mode and previewed in none. A round may hold
   * its options to a range, or its proof to a wiki page. A Drop Table question may name an
   * item to picture, and a Who's That NPC? shadow is only the NPC's name, its render four
   * buttons whose right one names the NPC. A shadow, a verse, a place, a picture pin and an
   * item are written in forms of their own (`forms.ts`), inside the same frame; an item's
   * credit is kept but cannot be shown, and neither an item nor a picture pin, whose own
   * screenshot proves it, asks for a source.
   *
   * Nothing is red until the first Save, and Save hands back only a body the server takes.
   * A new question names the pack questions it looks like above Save; the operator, editing
   * one, has the queue's own matches instead.
   */
  import { get } from 'svelte/store'

  import type { CustomQuestion, CustomType } from '../../lib/customQuestions'
  import { NAME_MAX } from '../../lib/names'
  import type { MatchingQuestion } from '../../lib/matching'
  import type { OrderingQuestion } from '../../lib/ordering'
  import { profile } from '../../lib/profile'
  import type { OpenQuestion } from '../../lib/protocol'
  import type { Snippet } from 'svelte'
  import {
    creditProblem,
    hasExtras,
    itemPage,
    needsSource,
    QUESTION_DIFFICULTIES,
    takesDifficulty,
    takesIntro,
    NO_ROUND,
    pictureItemProblem,
    sourceProblems,
    stageMode,
    stepsFor,
    SUGGESTED_TYPE_LABELS,
    wikiProblem,
    type Choice,
    type QuestionContent,
    type QuestionDifficulty,
    type SuggestedType,
    type SuggestionBody,
    type SuggestionContent,
  } from '../../lib/suggestions'
  import CustomQuestionForm from '../CustomQuestionForm.svelte'
  import { SUGGESTION_FORMS, type FormProgress } from './forms'
  import MatchingForm from '../MatchingForm.svelte'
  import OrderingForm from '../OrderingForm.svelte'
  import Segmented from '../Segmented.svelte'
  import SimilarQuestions from './SimilarQuestions.svelte'
  import StepCard from './StepCard.svelte'
  import SuggestSteps from './SuggestSteps.svelte'
  import TryPreview from './TryPreview.svelte'

  let {
    choice,
    initial = undefined,
    asked = [],
    saveLabel = 'Send to Reldo',
    hero = null,
    picture = null,
    onnpc = undefined,
    onsave,
    oncancel,
  }: {
    choice: Choice
    /** The suggestion to edit, or none for a new one. */
    initial?: SuggestionBody
    /**
     * The names a Who's That NPC? question may not give: the game asks about them already.
     * Without them only the server refuses one.
     */
    asked?: readonly string[]
    saveLabel?: string
    /** The selfhoster's hero, who stands on the preview's stage when the host asks. */
    hero?: string | null
    /** A URL of the stored picture a picture pin is drawn on, for the operator's editor. */
    picture?: string | null
    /** Told which NPC asks a random event's question whenever that changes, `''` for none. */
    onnpc?: (npc: string) => void
    onsave: (body: SuggestionBody) => void
    oncancel: () => void
  } = $props()

  const id = $props.id()

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = initial?.content as Partial<QuestionContent> | undefined
  // svelte-ignore state_referenced_locally
  let credit = $state(initial?.credit ?? get(profile)?.name ?? '')
  // svelte-ignore state_referenced_locally
  let shown = $state(choice.kind !== 'item' && (initial?.credit_shown ?? false))
  let wiki = $state(start?.wiki ?? '')
  let sourceUrl = $state(start?.source_url ?? '')
  let pictureItem = $state(start?.picture_item ?? '')
  let subjectName = $state(
    start?.type === 'pick_from_list'
      ? ((start.payload?.subject as { name?: string } | undefined)?.name ?? '')
      : '',
  )
  let difficulty = $state<QuestionDifficulty | undefined>(start?.difficulty)
  // An NPC's question is drawn whatever the room's difficulty, so it is asked for none.
  // svelte-ignore state_referenced_locally
  const tiered = choice.kind === 'question' && takesDifficulty(choice.id)
  // svelte-ignore state_referenced_locally
  const sourced = needsSource(choice)
  let attempted = $state(false)

  const customTypes = $derived(
    choice.types.filter(
      (type): type is CustomType =>
        type !== 'ordering' &&
        type !== 'matching' &&
        type !== 'pick_from_list' &&
        type !== 'map_pin' &&
        type !== 'picture_pin',
    ),
  )
  // The type the form opened on, and the one picked since. A round may sort, match and ask,
  // so picking across those lines swaps one form for another, starting it afresh.
  // svelte-ignore state_referenced_locally
  const opened: SuggestedType | undefined = start?.type ?? choice.types[0]
  let current = $state(opened)
  const sorts = $derived(current === 'ordering')
  const matches = $derived(current === 'matching')
  const forms = $derived(
    Number(customTypes.length > 0) +
      Number(choice.types.includes('ordering')) +
      Number(choice.types.includes('matching')) +
      Number(choice.types.includes('pick_from_list')),
  )
  const picker = $derived(
    forms > 1
      ? {
          options: choice.types.map((type) => ({
            value: type,
            label: choice.typeLabels?.[type] ?? SUGGESTED_TYPE_LABELS[type],
          })),
          onpick: (type: string) => (current = type as SuggestedType),
        }
      : undefined,
  )

  // svelte-ignore state_referenced_locally
  const roundPrompt = choice.prompt
  /** A payload with the round's prompt: a fixed one always, any other only on a new question. */
  function prompted(payload: Record<string, unknown>): Record<string, unknown> {
    if (roundPrompt === undefined || (!roundPrompt.fixed && 'prompt' in payload)) return payload
    return { ...payload, prompt: roundPrompt.text }
  }
  // svelte-ignore state_referenced_locally
  const question: CustomQuestion | undefined =
    start?.type === 'ordering' ||
    start?.type === 'matching' ||
    start?.type === 'pick_from_list' ||
    start?.type === 'map_pin' ||
    start?.type === 'picture_pin'
      ? undefined
      : start?.type === undefined
        ? roundPrompt === undefined
          ? undefined
          : { type: customTypes[0] ?? 'multiple_choice', payload: prompted({}) }
        : {
            type: start.type,
            payload: prompted(start.payload ?? {}),
            ...(start.random_event === undefined ? {} : { random_event: start.random_event }),
          }
  const picked = $derived(
    current === opened ||
      current === undefined ||
      current === 'ordering' ||
      current === 'matching' ||
      current === 'pick_from_list' ||
      current === 'map_pin' ||
      current === 'picture_pin'
      ? question
      : { type: current, payload: prompted({}) },
  )
  const ordering: OrderingQuestion | undefined =
    start?.type === 'ordering'
      ? {
          type: 'ordering',
          payload: start.payload ?? {},
          ...(start.random_event === undefined ? {} : { random_event: start.random_event }),
        }
      : undefined
  const matching: MatchingQuestion | undefined =
    start?.type === 'matching'
      ? {
          type: 'matching',
          payload: start.payload ?? {},
          ...(start.random_event === undefined ? {} : { random_event: start.random_event }),
        }
      : undefined

  const creditError = $derived(creditProblem(credit))
  const wikiError = $derived(wikiProblem(wiki))
  const pictureItemError = $derived(pictureItemProblem(pictureItem))
  const sourceErrors = $derived(sourceProblems(wiki, sourceUrl))
  // svelte-ignore state_referenced_locally
  const checksSimilar = initial === undefined
  let drafted = $state<QuestionContent | undefined>(undefined)
  // A round's own form, while its type is picked; else the shared form for that type.
  // svelte-ignore state_referenced_locally
  const own = choice.editor === undefined ? undefined : SUGGESTION_FORMS[choice.editor]
  const owned = $derived(own !== undefined && (own.type === undefined || current === own.type))
  const similarTo = $derived<QuestionContent | undefined>(
    drafted && { ...drafted, ...(choice.id === NO_ROUND ? {} : { mode: choice.id }) },
  )

  let formProgress = $state<FormProgress>({
    questionDone: false,
    extrasFilled: false,
    extrasValid: true,
  })
  const withExtras = $derived(hasExtras(choice))
  const difficultyError = $derived(
    tiered && difficulty === undefined ? 'Pick how hard it is.' : null,
  )
  const sourcePasses = $derived(
    !sourced ||
      (choice.wikiOnly ? wikiError === null : Object.values(sourceErrors).every((e) => e === null)),
  )
  const creditDone = $derived(creditError === null)
  const steps = $derived(
    stepsFor({
      choice,
      attempted,
      questionDone: formProgress.questionDone,
      difficultyDone: !tiered || difficulty !== undefined,
      extrasFilled:
        formProgress.extrasFilled || (Boolean(choice.pictureItem) && pictureItem.trim() !== ''),
      extrasValid: formProgress.extrasValid && (!choice.pictureItem || pictureItemError === null),
      sourceDone: sourcePasses,
      creditDone,
    }),
  )
  const difficultyStepIndex = $derived(tiered ? 1 : -1)
  const extrasStepIndex = $derived(withExtras ? (tiered ? 2 : 1) : -1)
  const sourceStepIndex = $derived(sourced ? 1 + Number(tiered) + Number(withExtras) : -1)
  const creditStepIndex = $derived(
    sourced ? sourceStepIndex + 1 : 1 + Number(tiered) + Number(withExtras),
  )

  function send(content: SuggestionContent, picture?: string): void {
    const body = { kind: choice.kind, content, credit: credit.trim(), credit_shown: shown }
    onsave(picture === undefined ? body : { ...body, picture })
  }

  /** The fields beside a question: whether they pass, asked on the editor's Save. */
  function questionFieldsPass(): boolean {
    attempted = true
    const tieredPass = !tiered || difficulty !== undefined
    return creditError === null && pictureItemError === null && sourcePasses && tieredPass
  }

  function givenLinks(): { wiki?: string; source_url?: string } {
    const links = { wiki: wiki.trim(), source_url: sourceUrl.trim() }
    return Object.fromEntries(Object.entries(links).filter(([, url]) => url !== ''))
  }

  function saveQuestion(built: QuestionContent, picture?: string): void {
    const given = sourced ? givenLinks() : {}
    const pictured = choice.pictureItem && pictureItem.trim() !== ''
    send(
      {
        ...built,
        ...(choice.id === NO_ROUND ? {} : { mode: choice.id }),
        ...given,
        ...(pictured ? { picture_item: pictureItem.trim() } : {}),
        ...(tiered && difficulty !== undefined ? { difficulty } : {}),
      },
      picture,
    )
  }

  // The page fills in as the name it follows does, until the player writes one of their own.
  function follow(before: string, after: string): void {
    if (wiki.trim() === '' || wiki === itemPage(before)) wiki = itemPage(after)
  }

  function saveOwn(content: SuggestionContent, picture?: string): void {
    if (choice.kind === 'question') saveQuestion(content as QuestionContent, picture)
    else send(content)
  }
</script>

{#snippet problem(message: string | null, show: boolean)}
  {#if show && message !== null}
    <p class="error">{message}</p>
  {/if}
{/snippet}

{#snippet wikiField(show: boolean)}
  <div class="field">
    <label for="{id}-wiki">Relevant Wiki page</label>
    <input
      id="{id}-wiki"
      type="text"
      inputmode="url"
      placeholder="https://oldschool.runescape.wiki/w/…"
      bind:value={wiki}
    />
    <p class="note hint">All submissions are fact-checked against the OSRS wiki.</p>
    {@render problem(wikiError, show)}
  </div>
{/snippet}

{#snippet creditFields(show: boolean)}
  <div class="field">
    <label for="{id}-credit">Your name</label>
    <input id="{id}-credit" type="text" maxlength={NAME_MAX} bind:value={credit} />
    <p class="note hint">Letters, digits, spaces, _ and -, up to {NAME_MAX}.</p>
    {@render problem(creditError, show)}
  </div>
  <label class="check">
    <input type="checkbox" bind:checked={shown} disabled={choice.kind === 'item'} />
    Show my name to players when this comes up in a game
  </label>
  {#if choice.kind === 'item'}
    <p class="note hint">
      More or Less, The Price is Right and Pixel Hunt do not support displaying the author of a
      question. Reldo still sees your name.
    </p>
  {/if}
{/snippet}

{#snippet difficultyField(show: boolean)}
  {#if tiered}
    <div class="field">
      <Segmented legend="How hard is it?" options={QUESTION_DIFFICULTIES} bind:value={difficulty} />
      {@render problem(difficultyError, show)}
    </div>
  {/if}
{/snippet}

{#snippet inQuestionFields()}
  {#if choice.questionHint}
    <p class="note hint">{choice.questionHint}</p>
  {/if}
{/snippet}

{#snippet inExtrasFields(show: boolean)}
  {#if choice.pictureItem}
    <div class="field">
      <label for="{id}-picture">Item to show, if any</label>
      <input id="{id}-picture" type="text" bind:value={pictureItem} />
      <p class="note hint">Its name, as the wiki spells it. Players see its picture.</p>
      {@render problem(pictureItemError, show)}
    </div>
  {/if}
{/snippet}

{#snippet progressHead()}
  <SuggestSteps {steps} />
{/snippet}

{#snippet stepQuestionCard(body: Snippet)}
  <StepCard number={1} step={steps[0]!}>
    {@render body()}
  </StepCard>
{/snippet}

{#snippet stepDifficultyCard()}
  {#if tiered}
    <StepCard number={difficultyStepIndex + 1} step={steps[difficultyStepIndex]!}>
      {@render difficultyField(attempted)}
    </StepCard>
  {/if}
{/snippet}

{#snippet stepExtrasCard(body: Snippet)}
  <StepCard number={extrasStepIndex + 1} step={steps[extrasStepIndex]!}>
    {@render body()}
  </StepCard>
{/snippet}

{#snippet questionFields(show: boolean)}
  {#if sourced}
    <StepCard number={sourceStepIndex + 1} step={steps[sourceStepIndex]!}>
      {#if choice.wikiOnly}
        {@render wikiField(show)}
      {:else}
        {@render sourceFields(show)}
      {/if}
    </StepCard>
  {/if}
  <StepCard number={creditStepIndex + 1} step={steps[creditStepIndex]!}>
    {@render creditFields(show)}
  </StepCard>
{/snippet}

{#snippet sourceFields(show: boolean)}
  <div class="field">
    <label for="{id}-wiki">Relevant Wiki page</label>
    <input
      id="{id}-wiki"
      type="text"
      inputmode="url"
      placeholder="https://oldschool.runescape.wiki/w/…"
      bind:value={wiki}
    />
    <p class="note hint">All submissions are fact-checked against the OSRS wiki.</p>
    {@render problem(sourceErrors.wiki, show)}
  </div>
  <div class="field">
    <label for="{id}-source">Another source, if the wiki can’t show it</label>
    <input
      id="{id}-source"
      type="text"
      inputmode="url"
      placeholder="https://…"
      bind:value={sourceUrl}
    />
    <p class="note hint">
      A clip or page that proves it, such as what a streamer said. Either one is enough.
    </p>
    {@render problem(sourceErrors.source_url ?? sourceErrors.either, show)}
  </div>
{/snippet}

{#snippet tryPreview(open: OpenQuestion, answerable: boolean = true)}
  <TryPreview content={similarTo} question={open} {answerable} {hero} />
{/snippet}

{#snippet similar()}
  {#if checksSimilar}
    <SimilarQuestions content={similarTo} />
  {/if}
{/snippet}

{#if own !== undefined && owned}
  <div class="editor surface" role="group" aria-labelledby="{id}-title">
    <SuggestSteps {steps} />
    <div class={['layout', own.stacks && 'stacks']}>
      <own.form
        {id}
        {choice}
        content={initial?.content}
        {picture}
        bind:name={subjectName}
        {asked}
        {picker}
        {saveLabel}
        stepQuestion={stepQuestionCard}
        stepDifficulty={stepDifficultyCard}
        stepExtras={stepExtrasCard}
        fields={questionFields}
        nearSave={similar}
        preview={tryPreview}
        onattempt={questionFieldsPass}
        onsubject={follow}
        ondraft={(question) => (drafted = question)}
        onprogress={(state) => (formProgress = state)}
        onsave={saveOwn}
        {oncancel}
      />
    </div>
  </div>
{:else if choice.kind === 'question' && sorts}
  <OrderingForm
    question={ordering}
    title={choice.label}
    mode={stageMode(choice.id)}
    asker={choice.id === 'random_event' ? 'required' : 'none'}
    intro={takesIntro(choice.id)}
    {picker}
    {saveLabel}
    head={progressHead}
    inQuestion={inQuestionFields}
    inExtras={inExtrasFields}
    stepQuestion={stepQuestionCard}
    stepDifficulty={tiered ? stepDifficultyCard : undefined}
    stepExtras={withExtras ? stepExtrasCard : undefined}
    fields={questionFields}
    onattempt={questionFieldsPass}
    {onnpc}
    ondraft={(question) => (drafted = question)}
    onprogress={(state) => (formProgress = state)}
    nearSave={similar}
    preview={tryPreview}
    onsave={saveQuestion}
    {oncancel}
  />
{:else if choice.kind === 'question' && matches}
  <MatchingForm
    question={matching}
    title={choice.label}
    mode={stageMode(choice.id)}
    asker={choice.id === 'random_event' ? 'required' : 'none'}
    intro={takesIntro(choice.id)}
    {picker}
    {saveLabel}
    head={progressHead}
    inQuestion={inQuestionFields}
    inExtras={inExtrasFields}
    stepQuestion={stepQuestionCard}
    stepDifficulty={tiered ? stepDifficultyCard : undefined}
    stepExtras={withExtras ? stepExtrasCard : undefined}
    fields={questionFields}
    onattempt={questionFieldsPass}
    {onnpc}
    ondraft={(question) => (drafted = question)}
    onprogress={(state) => (formProgress = state)}
    nearSave={similar}
    preview={tryPreview}
    onsave={saveQuestion}
    {oncancel}
  />
{:else if choice.kind === 'question'}
  <CustomQuestionForm
    question={picked}
    title={choice.label}
    types={customTypes}
    asker={choice.id === 'random_event' ? 'required' : 'none'}
    mode={stageMode(choice.id)}
    quote={choice.quote ?? false}
    explanation={choice.explanation ?? true}
    promptFixed={roundPrompt?.fixed ?? false}
    optionRange={choice.options}
    wording={choice.wording}
    intro={takesIntro(choice.id)}
    {picker}
    {saveLabel}
    head={progressHead}
    inQuestion={inQuestionFields}
    inExtras={inExtrasFields}
    stepQuestion={stepQuestionCard}
    stepDifficulty={tiered ? stepDifficultyCard : undefined}
    stepExtras={withExtras ? stepExtrasCard : undefined}
    fields={questionFields}
    onattempt={questionFieldsPass}
    {onnpc}
    ondraft={(question) => (drafted = question)}
    onprogress={(state) => (formProgress = state)}
    nearSave={similar}
    preview={tryPreview}
    onsave={saveQuestion}
    {oncancel}
  />
{/if}

<style>
  /* The step line's labels never wrap, so a size container holds them to the width there is. */
  .editor {
    container-type: inline-size;
    padding: 1rem;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel-raised);
  }

  /* On a phone the preview stands under the fields rather than squeezing beside them. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }

  @container (min-width: 40rem) {
    .layout:not(.stacks) {
      grid-template-columns: 3fr 2fr;
    }
  }

  /* A map too narrow to find anything on is no use: it stands over the preview until both fit. */
  @container (min-width: 46rem) {
    .layout.stacks {
      grid-template-columns: 3fr 2fr;
    }
  }

  .hint {
    margin: 0.3rem 0 0;
  }
</style>
