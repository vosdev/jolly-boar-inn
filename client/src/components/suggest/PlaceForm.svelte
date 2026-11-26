<script lang="ts">
  /**
   * A place on the map: a name, a box and a reach. The name fills in its wiki page, and the
   * operator alone may reword what its round asks. A described round asks the player's own
   * description instead, which may not name the place, and what ties the two for the reveal.
   */
  import { boundsOf, type PinTarget } from '../../lib/pins'
  import type { MapBounds } from '../../lib/map'
  import { DEFAULT_REACH } from '../../lib/mapBox'
  import { fieldHints } from '../../lib/placeholders'
  import {
    descriptionProblem,
    explainedProblem,
    placeProblem,
    placePrompt,
    questionPreview,
    type QuestionContent,
  } from '../../lib/suggestions'
  import type { SuggestionFormProps } from './forms'
  import PlaceField from './PlaceField.svelte'

  let {
    id,
    choice,
    content,
    placed,
    saveLabel,
    stepQuestion,
    stepDifficulty,
    fields,
    nearSave,
    preview,
    onattempt,
    onsubject,
    ondraft,
    onprogress,
    onsave,
    oncancel,
  }: SuggestionFormProps = $props()

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = content as Partial<QuestionContent> | undefined
  // svelte-ignore state_referenced_locally
  const fresh = content === undefined
  const startPlace = (start?.payload?.targets as PinTarget[] | undefined)?.[0]
  let name = $state(startPlace?.name ?? '')
  let box = $state<MapBounds | null>(startPlace === undefined ? null : boundsOf(startPlace))
  let reach = $state((start?.payload?.reach as number | undefined) ?? DEFAULT_REACH)
  let asks = $state(startPlace === undefined ? '' : ((start?.payload?.prompt as string) ?? ''))
  let described = $state((start?.payload?.prompt as string | undefined) ?? '')
  let explanation = $state((start?.payload?.explanation as string | undefined) ?? '')
  let attempted = $state(false)
  // svelte-ignore state_referenced_locally
  const hints = fieldHints(choice.id)

  const nameError = $derived(placeProblem(name))
  const boxError = $derived(box === null ? 'Tap the map to mark the place.' : null)
  const askedText = $derived(
    choice.described ? described.trim() : fresh ? placePrompt(name) : asks.trim(),
  )
  const askError = $derived(
    choice.described
      ? descriptionProblem(described, name)
      : askedText === ''
        ? 'Required: what the round asks.'
        : null,
  )
  const explanationError = $derived(choice.described ? explainedProblem(explanation) : null)
  const done = $derived(
    nameError === null && boxError === null && askError === null && explanationError === null,
  )
  const question = $derived<QuestionContent>({
    type: 'map_pin',
    mode: choice.id,
    payload: {
      prompt: askedText,
      targets:
        box === null
          ? []
          : [
              {
                name: name.trim(),
                min_x: box.minX,
                max_x: box.maxX,
                min_y: box.minY,
                max_y: box.maxY,
              },
            ],
      ...(reach === DEFAULT_REACH ? {} : { reach }),
      ...(choice.described ? { explanation: explanation.trim() } : {}),
    },
  })

  $effect(() => ondraft(done ? question : undefined))
  $effect(() => onprogress({ questionDone: done, extrasFilled: false, extrasValid: true }))

  function rename(next: string): void {
    onsubject(name, next)
    name = next
  }

  function save(): void {
    attempted = true
    if (!onattempt() || !done) return
    onsave(question)
  }
</script>

{#snippet problem(message: string | null, show: boolean)}
  {#if show && message !== null}
    <p class="error">{message}</p>
  {/if}
{/snippet}

{#snippet body()}
  <div class="field">
    <label for="{id}-place">Place, as the wiki spells it</label>
    <input
      id="{id}-place"
      type="text"
      value={name}
      oninput={(event) => rename(event.currentTarget.value)}
    />
    {@render problem(nameError, attempted)}
  </div>
  {#if choice.described}
    <div class="field">
      <label for="{id}-described">What Hans sees, without naming the place</label>
      <textarea id="{id}-described" rows="3" placeholder={hints.prompt} bind:value={described}
      ></textarea>
      {@render problem(askError, attempted)}
    </div>
    <div class="field">
      <label for="{id}-explanation">What gives it away, for the reveal</label>
      <textarea
        id="{id}-explanation"
        rows="2"
        placeholder={hints.explanation}
        bind:value={explanation}></textarea>
      {@render problem(explanationError, attempted)}
    </div>
  {:else if !fresh}
    <div class="field">
      <label for="{id}-asks">What the round asks</label>
      <input id="{id}-asks" type="text" bind:value={asks} />
      {@render problem(askError, attempted)}
    </div>
  {/if}
  <PlaceField
    {box}
    {reach}
    {name}
    {placed}
    onbox={(next) => (box = next)}
    onreach={(next) => (reach = next)}
  />
  {@render problem(boxError, attempted)}
{/snippet}

<div class="fields">
  <h3 id="{id}-title">{choice.label}</h3>
  {@render stepQuestion(body)}
  {@render stepDifficulty()}
  {@render fields(attempted)}
  {@render nearSave()}
  <div class="row actions">
    <button type="button" class="primary" onclick={save}>{saveLabel}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</div>
<section class="preview" aria-label="Preview">
  <p class="note">What players will see</p>
  {@render preview(questionPreview(question), true)}
</section>

<style>
  .fields,
  .preview {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.75rem;
  }

  .actions {
    margin-top: 1rem;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
  }
</style>
