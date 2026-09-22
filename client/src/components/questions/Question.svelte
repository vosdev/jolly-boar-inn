<script lang="ts">
  /**
   * One question on screen: the mode's stem, then the type's view under it.
   *
   * It draws the same question twice in its life — open, from `OpenQuestion.view`, and
   * closed, from `question_closed.reveal` — and both times the pair is picked from the
   * `OpenQuestion`, because the reveal frame names neither a type nor a mode. `reveal`
   * being null is what says which of the two this is.
   *
   * It adds no markup of its own around the pair. A mode with no stem, which is
   * `more_less`, renders exactly the view it rendered before stems existed, into the same
   * panel, with nothing in between to shift a pixel.
   *
   * A type this build has no view for gets the honest fallback in place of the whole
   * question, stem included: a sentence with no way to answer it reads as a broken
   * screen, where "this version cannot show it" reads as what it is.
   *
   * `held` is a random event's hold (T22): the stem is up, and the view waits for the
   * question's `answerable_at`. `RandomEvent` does the counting and says when.
   */
  import type { OpenQuestion, PlayerResult } from '../../lib/protocol'
  import { viewFor } from './index'

  let {
    question,
    reveal = null,
    yourValue,
    result = null,
    onAnswer,
    held = false,
  }: {
    /** The question as it was sent open. After close it is still what picks the pair. */
    question: OpenQuestion
    /** `question_closed.reveal`, or null while the question is open. */
    reveal?: Record<string, unknown> | null
    yourValue: unknown
    result?: PlayerResult | null
    onAnswer: (value: unknown) => void
    /** Draw the stem only: the answers are not being taken yet. */
    held?: boolean
  } = $props()

  const pair = $derived(viewFor(question.type, question.mode))
  const Stem = $derived(pair.stem)
  const View = $derived(pair.view)
  const revealed = $derived(reveal !== null)
  const data = $derived(reveal ?? question.view)
</script>

<!-- Keyed on the question so a view with state of its own — the combobox's search, its
     selection — starts clean for each question even if nothing between them unmounts it. -->
{#key question.question_id}
{#if View === null}
  {#if revealed}
    <p class="note">That question is closed.</p>
  {:else}
    <!-- A pack from a newer server than this build knows would otherwise show nothing
         at all, which reads as a broken room rather than a missing component. -->
    <p>This question is a <code>{question.type}</code>, which this version cannot show.</p>
    <p class="note">Sit this one out — the game carries on.</p>
  {/if}
{:else}
  {#if Stem !== null}
    <Stem {data} {revealed} />
  {/if}
  {#if held}
    <p class="note" role="status">The answers appear in a moment.</p>
  {:else}
    <View
      {data}
      {revealed}
      {yourValue}
      canAnswer={question.you_can_answer}
      {result}
      {onAnswer}
    />
  {/if}
{/if}
{/key}
