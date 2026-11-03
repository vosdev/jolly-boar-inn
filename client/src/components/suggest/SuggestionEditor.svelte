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
   * buttons whose right one names the NPC: the preview shows no picture for any of them,
   * since it exists only once imported. A shadow of an NPC the game already asks about is
   * refused before it is sent, given the list beside the editor. A Forgetful Bard question is a
   * verse and its item, from the list or typed if the list lacks it; the item fills in its wiki
   * page, and the preview's reveal has no picture, which a room alone may name. A place on the
   * map is a name, a box and a reach, and the operator alone may reword what its round asks. An item is only a name, since the import script finds its id; nothing
   * on the wiki is needed to check one. Beside it the roster, searchable, so nobody writes
   * up an item the game already has; its credit is kept but cannot be shown.
   *
   * Nothing is red until the first Save, and Save hands back only a body the server takes.
   * A new question names the pack questions it looks like above Save; the operator, editing
   * one, has the queue's own matches instead.
   */
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'

  import type { CustomQuestion, CustomType } from '../../lib/customQuestions'
  import { boundsOf } from '../../lib/pins'
  import type { PinTarget } from '../../lib/pins'
  import { fieldHints } from '../../lib/placeholders'
  import type { MapBounds } from '../../lib/map'
  import { DEFAULT_REACH } from '../../lib/mapBox'
  import { NAME_MAX } from '../../lib/names'
  import type { MatchingQuestion } from '../../lib/matching'
  import type { OrderingQuestion } from '../../lib/ordering'
  import { profile } from '../../lib/profile'
  import type { OpenQuestion } from '../../lib/protocol'
  import { codePoints } from '../../lib/questionSchema'
  import type { Snippet } from 'svelte'
  import {
    creditProblem,
    hasExtras,
    INTRO_ROUNDS,
    itemPage,
    onList,
    plainItems,
    QUESTION_DIFFICULTIES,
    takesDifficulty,
    itemProblem,
    NO_ROUND,
    npcNameProblem,
    pictureItemProblem,
    placeProblem,
    placePrompt,
    questionPreview,
    sourceProblems,
    stageMode,
    stepsFor,
    SUGGESTED_TYPE_LABELS,
    VERSE_MAX,
    verseItemProblem,
    verseProblem,
    wikiProblem,
    type Choice,
    type ItemContent,
    type QuestionContent,
    type QuestionDifficulty,
    type SuggestedType,
    type SuggestionBody,
    type SuggestionContent,
  } from '../../lib/suggestions'
  import { loadVocab, search, type VocabEntry } from '../../lib/vocab'
  import CustomQuestionForm from '../CustomQuestionForm.svelte'
  import ItemPicker from './ItemPicker.svelte'
  import MatchingForm from '../MatchingForm.svelte'
  import PlaceField from './PlaceField.svelte'
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
    /** Told which NPC asks a random event's question whenever that changes, `''` for none. */
    onnpc?: (npc: string) => void
    onsave: (body: SuggestionBody) => void
    oncancel: () => void
  } = $props()

  const id = $props.id()

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = initial?.content as Partial<QuestionContent & ItemContent> | undefined
  // svelte-ignore state_referenced_locally
  let credit = $state(initial?.credit ?? get(profile)?.name ?? '')
  // svelte-ignore state_referenced_locally
  let shown = $state(choice.kind !== 'item' && (initial?.credit_shown ?? false))
  let wiki = $state(start?.wiki ?? '')
  let sourceUrl = $state(start?.source_url ?? '')
  let name = $state(start?.name ?? '')
  let pictureItem = $state(start?.picture_item ?? '')
  let difficulty = $state<QuestionDifficulty | undefined>(start?.difficulty)
  // An NPC's question is drawn whatever the room's difficulty, so it is asked for none.
  // svelte-ignore state_referenced_locally
  const tiered = choice.kind === 'question' && takesDifficulty(choice.id)
  let npcName = $state(
    start?.type === 'pick_from_list'
      ? ((start.payload?.subject as { name?: string })?.name ?? '')
      : '',
  )
  // svelte-ignore state_referenced_locally
  let verse = $state(choice.verse ? ((start?.payload?.prompt as string | undefined) ?? '') : '')
  const startPlace = (start?.payload?.targets as PinTarget[] | undefined)?.[0]
  let placeName = $state(startPlace?.name ?? '')
  let box = $state<MapBounds | null>(startPlace === undefined ? null : boundsOf(startPlace))
  let reach = $state((start?.payload?.reach as number | undefined) ?? DEFAULT_REACH)
  let asks = $state(startPlace === undefined ? '' : ((start?.payload?.prompt as string) ?? ''))
  let attempted = $state(false)
  let roster = $state<readonly VocabEntry[] | 'loading' | 'failed'>('loading')
  let rosterQuery = $state('')

  onMount(() => {
    if (choice.kind !== 'item' && !choice.verse) return
    loadVocab('items').then(
      (list) => (roster = list.entries),
      () => (roster = 'failed'),
    )
  })

  const customTypes = $derived(
    choice.types.filter(
      (type): type is CustomType =>
        type !== 'ordering' &&
        type !== 'matching' &&
        type !== 'pick_from_list' &&
        type !== 'map_pin',
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
    start?.type === 'map_pin'
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
      current === 'map_pin'
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
  const verseError = $derived(verseProblem(verse, npcName))
  const verseItemError = $derived(verseItemProblem(npcName))
  const npcError = $derived(
    choice.verse ? (verseError ?? verseItemError) : npcNameProblem(npcName, asked),
  )
  const npcQuestion = $derived<QuestionContent>({
    type: 'pick_from_list',
    payload: {
      prompt: choice.verse ? verse.trim() : (roundPrompt?.text ?? ''),
      subject: { name: npcName.trim() },
    },
    mode: choice.id,
  })
  const verseItems = $derived(typeof roster === 'string' ? [] : plainItems(roster))
  const listed = $derived(choice.verse === true && onList(npcName, verseItems))
  const namedPreview = $derived.by(() => {
    const open = questionPreview(npcQuestion)
    return listed ? { ...open, view: { ...open.view, vocab: 'items' } } : open
  })
  const sourceErrors = $derived(sourceProblems(wiki, sourceUrl))
  // svelte-ignore state_referenced_locally
  const checksSimilar = initial === undefined
  let drafted = $state<CustomQuestion | OrderingQuestion | MatchingQuestion | undefined>(undefined)
  const naming = $derived(
    (choice.named === true || choice.verse === true) && current === 'pick_from_list',
  )
  const placing = $derived(current === 'map_pin')
  const placeError = $derived(placeProblem(placeName))
  const boxError = $derived(box === null ? 'Tap the map to mark the place.' : null)
  const askedText = $derived(initial === undefined ? placePrompt(placeName) : asks.trim())
  const askError = $derived(askedText === '' ? 'Required: what the round asks.' : null)
  const placeDone = $derived(placeError === null && boxError === null && askError === null)
  const placeQuestion = $derived<QuestionContent>({
    type: 'map_pin',
    mode: choice.id,
    payload: {
      prompt: askedText,
      targets:
        box === null
          ? []
          : [
              {
                name: placeName.trim(),
                min_x: box.minX,
                max_x: box.maxX,
                min_y: box.minY,
                max_y: box.maxY,
              },
            ],
      ...(reach === DEFAULT_REACH ? {} : { reach }),
    },
  })
  const similarTo = $derived<QuestionContent | undefined>(
    placing
      ? placeDone
        ? placeQuestion
        : undefined
      : naming
        ? npcError === null
          ? npcQuestion
          : undefined
        : drafted && { ...drafted, ...(choice.id === NO_ROUND ? {} : { mode: choice.id }) },
  )
  const itemError = $derived(itemProblem({ name }, typeof roster === 'string' ? [] : roster))
  const rosterFound = $derived(typeof roster === 'string' ? [] : search(roster, rosterQuery))

  let formProgress = $state({ questionDone: false, extrasFilled: false, extrasValid: true })
  const withExtras = $derived(hasExtras(choice))
  const difficultyError = $derived(
    tiered && difficulty === undefined ? 'Pick how hard it is.' : null,
  )
  const sourcePasses = $derived(
    choice.wikiOnly ? wikiError === null : Object.values(sourceErrors).every((e) => e === null),
  )
  const creditDone = $derived(creditError === null)
  const steps = $derived(
    stepsFor({
      choice,
      attempted,
      questionDone:
        choice.kind === 'item'
          ? itemError === null
          : placing
            ? placeDone
            : naming
              ? npcError === null
              : formProgress.questionDone,
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
  const sourceStepIndex = $derived(
    choice.kind === 'item' ? -1 : 1 + Number(tiered) + Number(withExtras),
  )
  const creditStepIndex = $derived(choice.kind === 'item' ? 1 : sourceStepIndex + 1)

  function send(content: SuggestionContent): void {
    onsave({ kind: choice.kind, content, credit: credit.trim(), credit_shown: shown })
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

  function saveQuestion(built: CustomQuestion | OrderingQuestion | MatchingQuestion): void {
    const given = givenLinks()
    const pictured = choice.pictureItem && pictureItem.trim() !== ''
    send({
      ...built,
      ...(choice.id === NO_ROUND ? {} : { mode: choice.id }),
      ...given,
      ...(pictured ? { picture_item: pictureItem.trim() } : {}),
      ...(tiered && difficulty !== undefined ? { difficulty } : {}),
    })
  }

  function saveNpc(): void {
    attempted = true
    if (
      creditError !== null ||
      !sourcePasses ||
      npcError !== null ||
      (tiered && difficulty === undefined)
    ) {
      return
    }
    send({ ...npcQuestion, ...givenLinks(), ...(difficulty !== undefined ? { difficulty } : {}) })
  }

  function savePlace(): void {
    attempted = true
    if (
      creditError !== null ||
      !sourcePasses ||
      !placeDone ||
      (tiered && difficulty === undefined)
    ) {
      return
    }
    send({ ...placeQuestion, ...givenLinks(), ...(difficulty !== undefined ? { difficulty } : {}) })
  }

  // The place's page fills in as its name does, until the player writes one of their own.
  function namePlace(next: string): void {
    if (wiki.trim() === '' || wiki === itemPage(placeName)) wiki = itemPage(next)
    placeName = next
  }

  // The item's page fills in until the player writes one of their own.
  function pickItem(next: string): void {
    if (wiki.trim() === '' || wiki === itemPage(npcName)) wiki = itemPage(next)
    npcName = next
  }

  function saveItem(): void {
    attempted = true
    if (creditError !== null || itemError !== null) return
    const content: ItemContent = { name: name.trim() }
    send(content)
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
  {#if choice.named}
    <p class="note hint">Players see the right answer's render. Name it as the wiki does.</p>
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
  <StepCard number={sourceStepIndex + 1} step={steps[sourceStepIndex]!}>
    {#if choice.wikiOnly}
      {@render wikiField(show)}
    {:else}
      {@render sourceFields(show)}
    {/if}
  </StepCard>
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

{#snippet tryPreview(open: OpenQuestion)}
  <TryPreview content={similarTo} question={open} {hero} />
{/snippet}

{#snippet similar()}
  {#if checksSimilar}
    <SimilarQuestions content={similarTo} />
  {/if}
{/snippet}

{#snippet buttons(save: () => void)}
  <div class="row actions">
    <button type="button" class="primary" onclick={save}>{saveLabel}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
{/snippet}

{#if naming}
  <div class="editor surface" role="group" aria-labelledby="{id}-title">
    <SuggestSteps {steps} />
    <div class="layout">
      <div class="fields">
        <h3 id="{id}-title">{choice.label}</h3>
        <StepCard number={1} step={steps[0]!}>
          {#if picker}
            <div class="field">
              <Segmented
                legend="How players answer"
                options={picker.options}
                bind:value={() => current ?? '', picker.onpick}
              />
            </div>
          {/if}
          {#if choice.verse}
            <div class="field">
              <label for="{id}-verse">The verse Falo sings</label>
              <textarea
                id="{id}-verse"
                rows="3"
                placeholder={fieldHints(choice.id).prompt}
                bind:value={verse}></textarea>
              <p class="note hint counter">{codePoints(verse.trim())}/{VERSE_MAX}</p>
              {@render problem(verseError, attempted)}
            </div>
            <ItemPicker
              entries={verseItems}
              name={npcName}
              label="The item it describes"
              problem={attempted ? verseItemError : null}
              onname={pickItem}
            />
            {#if npcName.trim() !== '' && !listed && verseItemError === null && typeof roster !== 'string'}
              <p class="note hint">Not on the list yet: Reldo adds it if your verse is approved.</p>
            {/if}
          {:else}
            <div class="field">
              <label for="{id}-npc">Monster or NPC, as the wiki spells it</label>
              <input id="{id}-npc" type="text" bind:value={npcName} />
              {@render problem(npcError, attempted)}
            </div>
          {/if}
        </StepCard>
        {#if tiered}
          <StepCard number={difficultyStepIndex + 1} step={steps[difficultyStepIndex]!}>
            {@render difficultyField(attempted)}
          </StepCard>
        {/if}
        <StepCard number={sourceStepIndex + 1} step={steps[sourceStepIndex]!}>
          {#if choice.verse}
            {@render sourceFields(attempted)}
          {:else}
            {@render wikiField(attempted)}
          {/if}
        </StepCard>
        <StepCard number={creditStepIndex + 1} step={steps[creditStepIndex]!}>
          {@render creditFields(attempted)}
        </StepCard>
        {@render similar()}
        {@render buttons(saveNpc)}
      </div>
      <section class="preview" aria-label="Preview">
        <p class="note">What players will see</p>
        <TryPreview content={similarTo} question={namedPreview} answerable={listed} {hero} />
      </section>
    </div>
  </div>
{:else if placing}
  <div class="editor surface" role="group" aria-labelledby="{id}-title">
    <SuggestSteps {steps} />
    <div class="layout stacks">
      <div class="fields">
        <h3 id="{id}-title">{choice.label}</h3>
        <StepCard number={1} step={steps[0]!}>
          <div class="field">
            <label for="{id}-place">Place, as the wiki spells it</label>
            <input
              id="{id}-place"
              type="text"
              value={placeName}
              oninput={(event) => namePlace(event.currentTarget.value)}
            />
            {@render problem(placeError, attempted)}
          </div>
          {#if initial !== undefined}
            <div class="field">
              <label for="{id}-asks">What the round asks</label>
              <input id="{id}-asks" type="text" bind:value={asks} />
              {@render problem(askError, attempted)}
            </div>
          {/if}
          <PlaceField
            {box}
            {reach}
            name={placeName}
            onbox={(next) => (box = next)}
            onreach={(next) => (reach = next)}
          />
          {@render problem(boxError, attempted)}
        </StepCard>
        {@render stepDifficultyCard()}
        <StepCard number={sourceStepIndex + 1} step={steps[sourceStepIndex]!}>
          {@render wikiField(attempted)}
        </StepCard>
        <StepCard number={creditStepIndex + 1} step={steps[creditStepIndex]!}>
          {@render creditFields(attempted)}
        </StepCard>
        {@render similar()}
        {@render buttons(savePlace)}
      </div>
      <section class="preview" aria-label="Preview">
        <p class="note">What players will see</p>
        <TryPreview content={similarTo} question={questionPreview(placeQuestion)} {hero} />
      </section>
    </div>
  </div>
{:else if choice.kind === 'question' && sorts}
  <OrderingForm
    question={ordering}
    title={choice.label}
    mode={stageMode(choice.id)}
    asker={choice.id === 'random_event' ? 'required' : 'none'}
    intro={INTRO_ROUNDS.includes(choice.id)}
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
    intro={INTRO_ROUNDS.includes(choice.id)}
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
    intro={INTRO_ROUNDS.includes(choice.id)}
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
{:else}
  <div class="editor surface" role="group" aria-labelledby="{id}-title">
    <SuggestSteps {steps} />
    <div class="layout">
      <div class="fields">
        <h3 id="{id}-title">{choice.label}</h3>
        <StepCard number={1} step={steps[0]!}>
          <p class="note item-note">
            An item players will recognise, for More or Less, The Price is Right and Pixel Hunt.
            Untradeable items are welcome: the price rounds use alch and shop prices too.
          </p>
          <div class="field">
            <label for="{id}-item">Item name, as the wiki spells it</label>
            <input id="{id}-item" type="text" bind:value={name} />
            {@render problem(itemError, attempted)}
          </div>
        </StepCard>
        <StepCard number={2} step={steps[1]!}>
          {@render creditFields(attempted)}
        </StepCard>
        {@render buttons(saveItem)}
      </div>
      <section class="roster" aria-labelledby="{id}-roster">
        <h4 id="{id}-roster">Already in the game</h4>
        <input
          type="search"
          aria-label="Search the items already in the game"
          placeholder="Search"
          bind:value={rosterQuery}
        />
        {#if roster === 'loading'}
          <p class="note">Fetching the list…</p>
        {:else if roster === 'failed'}
          <p class="note">The list didn't load. An item the game has is still turned away.</p>
        {:else if rosterFound.length === 0}
          <p class="note">None of them match.</p>
        {:else}
          <ul>
            {#each rosterFound as entry (entry.id)}
              <li>{entry.name}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </div>
{/if}

<style>
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
    text-align: right;
  }

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

  .fields {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.75rem;
  }

  .hint {
    margin: 0.3rem 0 0;
  }

  .item-note {
    margin: 0 0 0.75rem;
  }

  .actions {
    margin-top: 1rem;
  }

  .roster,
  .preview {
    min-width: 0;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
  }

  .roster h4 {
    margin: 0 0 0.5rem;
  }

  .roster input {
    width: 100%;
  }

  /* The fields beside it set the height; the list scrolls inside that rather than
     stretching the editor to every item on the roster. */
  .roster ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    max-height: 20rem;
    overflow-y: auto;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel);
  }

  .roster li {
    padding: 0.3rem 0.7rem;
  }

  .roster li + li {
    border-top: var(--border-width) solid var(--line);
  }
</style>
