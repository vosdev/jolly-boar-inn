<script lang="ts">
  /**
   * One question on screen: the mode's stem, then the type's view under it.
   *
   * It draws the same question twice in its life — open, from `OpenQuestion.view`, and
   * closed, from `question_closed.reveal` — and both times the pair is picked from the
   * `OpenQuestion`, because the reveal frame names neither a type nor a mode. `reveal`
   * being null is what says which of the two this is.
   *
   * It adds no markup of its own around the pair, and after it only what every type says
   * the same way: the note for somebody who cannot answer, and the reveal's `explanation`
   * where the author gave one. A mode with no stem, which is `more_less`, renders exactly
   * the view it rendered before stems existed, with nothing in between to shift a pixel.
   *
   * The stem also gets the question's schedule, counted on `lib/clock.ts`'s server clock,
   * for a stem that shows more of itself as time runs out.
   *
   * A type this build has no view for gets the honest fallback in place of the whole
   * question, stem included: a sentence with no way to answer it reads as a broken
   * screen, where "this version cannot show it" reads as what it is. A stem or view that
   * throws gets the same treatment from the boundary, for a payload this build misreads:
   * without it the error takes the whole room screen down with the question.
   *
   * `held` is a random event's hold: the stem is up, and the view waits for the
   * question's `answerable_at`, drawn but invisible and out of reach, so the panel is its
   * full size from the first frame and nothing moves when the answers fade in. Left out,
   * for a question with no hold, the view gets no wrapper at all.
   * `RandomEvent` does the counting and says when, and it puts the `explanation` on its
   * scroll itself (`explain` false).
   *
   * `frame` lays the two halves out: it gets the stem and the answers as snippets, which
   * is how the stage puts one on the scroll and the other under the line. The answers are
   * null for a question with nothing to answer on, whose fallback is then the stem. With
   * no frame they simply follow each other, which is a random event's card. A question
   * that throws keeps its frame, with the fallback for a stem, so the stage and whatever
   * the frame draws around it stay up.
   */
  import type { Snippet } from 'svelte'

  import { serverNow } from '../../lib/clock'
  import type { OpenQuestion, PlayerResult } from '../../lib/protocol'
  import { viewFor } from './index'
  import type { StemTiming } from './props'

  let {
    question,
    reveal = null,
    yourValue,
    result = null,
    onAnswer,
    held = undefined,
    explain = true,
    frame,
  }: {
    /** The question as it was sent open. After close it is still what picks the pair. */
    question: OpenQuestion
    /** `question_closed.reveal`, or null while the question is open. */
    reveal?: Record<string, unknown> | null
    yourValue: unknown
    result?: PlayerResult | null
    onAnswer: (value: unknown) => void
    /** The answers are not being taken yet; undefined for a question with no hold. */
    held?: boolean
    /** Show the reveal's `explanation` under the view. */
    explain?: boolean
    frame?: Snippet<[Snippet, Snippet | null]>
  } = $props()

  const pair = $derived(viewFor(question.type, question.mode))
  const Stem = $derived(pair.stem)
  const View = $derived(pair.view)
  const revealed = $derived(reveal !== null)
  const data = $derived(reveal ?? question.view)
  const explanation = $derived(
    explain && revealed && typeof data.explanation === 'string' && data.explanation !== ''
      ? data.explanation
      : null,
  )
  const timing: StemTiming = $derived({
    answerableAt: question.answerable_at ?? question.opened_at,
    endsAt: question.ends_at,
    steps: typeof question.view.steps === 'number' ? question.view.steps : null,
    now: serverNow,
  })
</script>

{#snippet stem()}
  {#if View === null}
    {#if revealed}
      <p class="note">That question is closed.</p>
    {:else}
      <!-- A pack from a newer server than this build knows would otherwise show nothing
           at all, which reads as a broken room rather than a missing component. -->
      <p>This question is a <code>{question.type}</code>, which this version cannot show.</p>
      <p class="note">Sit this one out — the game carries on.</p>
    {/if}
  {:else if Stem !== null}
    <Stem {data} {revealed} {timing} />
  {/if}
{/snippet}

{#snippet broken()}
  <p>This question can't be shown in this version. Refresh to update.</p>
{/snippet}

{#snippet answers()}
  {#if View !== null && held !== undefined}
    <div class="gate" class:held inert={held} aria-hidden={held ? 'true' : undefined}>
      {@render view()}
    </div>
  {:else if View !== null}
    {@render view()}
  {/if}
{/snippet}

{#snippet view()}
  {#if View !== null}
    <View
      {data}
      {revealed}
      {yourValue}
      canAnswer={question.you_can_answer}
      {result}
      {onAnswer}
    />
    {#if !question.you_can_answer && !revealed}
      <p class="note unscored">This one is not scored for you — sit back and watch.</p>
    {/if}
    {#if explanation !== null}
      <p class="explanation">{explanation}</p>
    {/if}
  {/if}
{/snippet}

<!-- Keyed on the question so a view with state of its own — the combobox's search, its
     selection — starts clean for each question even if nothing between them unmounts it. -->
{#key question.question_id}
<svelte:boundary onerror={(error) => console.error('The question could not be drawn:', error)}>
{#if frame}
  {@render frame(stem, View === null ? null : answers)}
{:else}
  {@render stem()}
  {@render answers()}
{/if}
{#snippet failed()}
  {#if frame}
    {@render frame(broken, null)}
  {:else}
    {@render broken()}
  {/if}
{/snippet}
</svelte:boundary>
{/key}

<style>
  .gate {
    transition: opacity 200ms ease-out;
  }

  .gate.held {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .gate {
      transition: none;
    }
  }

  .unscored,
  .explanation {
    margin: 1rem 0 0;
  }

  .explanation {
    overflow-wrap: anywhere;
  }
</style>
