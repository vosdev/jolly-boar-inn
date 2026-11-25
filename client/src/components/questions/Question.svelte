<script lang="ts">
  /**
   * One question on screen: the mode's stem, then the type's view under it.
   *
   * It draws the same question twice in its life — open, from `OpenQuestion.view`, and
   * closed, from `question_closed.reveal` — and both times the pair is picked from the
   * `OpenQuestion`, because the reveal frame names neither a type nor a mode. `reveal`
   * being null is what says which of the two this is.
   *
   * It adds no markup of its own around the pair, only what every mode shows the same way:
   * a pack question's `picture` under the stem (large, in a mode whose `picture` says so, and
   * its shadow or its build-up (Pixel Hunt's, or any of Certer's) until the reveal when the question is picked from the list; on
   * the buttons it is the render among look-alikes), and after the view the note for somebody who
   * cannot answer and the reveal's `explanation` where the author gave one. A mode with no stem, which is `more_less`, renders exactly
   * the view it rendered before stems existed, with nothing in between to shift a pixel.
   *
   * The stem also gets the question's schedule, counted on `lib/clock.ts`'s server clock.
   *
   * A type this build has no view for gets the honest fallback in place of the whole
   * question, stem included: a sentence with no way to answer it reads as a broken
   * screen, where "this version cannot show it" reads as what it is. A stem or view that
   * throws gets the same treatment from the boundary, for a payload this build misreads:
   * without it the error takes the whole room screen down with the question.
   *
   * `held` is the question's hold while the scroll types it in: the stem is up, and the
   * view waits for the question's `answerable_at`, drawn but invisible and out of reach, so
   * the panel is its full size from the first frame and nothing moves when the answers
   * fade in. Left out, for a question with no hold, the view gets no wrapper at all. A map
   * is the stage's backdrop, so it stays in sight through the hold, still out of reach.
   * `QuestionStage` and `RandomEvent` do the counting and say when, and how much of the
   * stem is typed (`shown`). `RandomEvent` puts the `explanation` on its scroll itself
   * (`explain` false).
   *
   * `frame` lays the two halves out: it gets the stem and the answers as snippets, which
   * is how the stage puts one on the scroll and the other under the line, and the picture
   * alone, for a frame that types the prompt itself instead of the stem: an event's card. The answers are
   * null for a question with nothing to answer on, whose fallback is then the stem. With
   * no frame they simply follow each other, which is a random event's card. A question
   * that throws keeps its frame, with the fallback for a stem, so the stage and whatever
   * the frame draws around it stay up.
   */
  import type { Snippet } from 'svelte'

  import { serverNow } from '../../lib/clock'
  import { BOOK, afterUse } from '../../lib/heldItems'
  import { rulesOf } from '../../lib/modeRules'
  import { MODES } from '../../lib/modes'
  import type { Build } from '../../lib/pixelHunt'
  import type { OpenQuestion, PlayerResult } from '../../lib/protocol'
  import { randomEventFor } from '../../lib/randomEvents'
  import { room } from '../../lib/stores'
  import { viewFor } from './index'
  import type { StemTiming } from './props'
  import QuestionPicture from './QuestionPicture.svelte'

  let {
    question,
    pictureUrl = null,
    reveal = null,
    yourValue,
    booked = false,
    result = null,
    results = null,
    onAnswer,
    held = undefined,
    shown = undefined,
    explain = true,
    frame,
  }: {
    /** The question as it was sent open. After close it is still what picks the pair. */
    question: OpenQuestion
    /** A picture from the bundle rather than `/pictures/`, for a sample: no server names one. */
    pictureUrl?: string | null
    /** `question_closed.reveal`, or null while the question is open. */
    reveal?: Record<string, unknown> | null
    yourValue: unknown
    /** The Book of Knowledge answered for you: its line takes the answers' place while open. */
    booked?: boolean
    result?: PlayerResult | null
    /** `question_closed.results`, every player's row; null while open. */
    results?: Record<string, PlayerResult> | null
    onAnswer: (value: unknown) => void
    /** The answers are not being taken yet; undefined for a question with no hold. */
    held?: boolean
    /** How many letters of each of the stem's lines are typed; undefined shows it whole. */
    shown?: number[]
    /** Show the reveal's `explanation` under the view. */
    explain?: boolean
    frame?: Snippet<[Snippet, Snippet | null, Snippet | null]>
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
  const sketched = $derived(
    question.random_event !== null && randomEventFor(question.random_event).sketches === true,
  )
  const picture = $derived(sketched ? 'build' : MODES[question.mode]?.picture)
  const pictured = $derived(picture !== undefined)
  const withheld = $derived(picture === 'reveal' && !revealed)
  const listed = $derived(question.type === 'pick_from_list')
  const shadowed = $derived(picture === 'shadow' && listed)
  const build: Build | null = $derived(
    picture === 'build' && listed
      ? {
          room: $room?.code ?? '',
          questionId: question.question_id,
          index: question.index,
          answerableAt: question.answerable_at ?? question.opened_at,
          endsAt: question.ends_at,
          day: $room?.daily?.day,
          sketch: sketched,
        }
      : null,
  )
  const subjectName = $derived.by(() => {
    const subject = data.subject as { name?: unknown } | undefined
    if (typeof subject?.name === 'string') return subject.name
    const options = data.options as unknown[] | undefined
    const right = options?.[data.answer_index as number]
    return typeof right === 'string' ? right : null
  })
  const timing: StemTiming = $derived({
    answerableAt: question.answerable_at ?? question.opened_at,
    endsAt: question.ends_at,
    now: serverNow,
    steps: rulesOf(question.mode)?.steps ?? null,
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
  {:else}
    {#if Stem !== null}
      <Stem {data} {revealed} {timing} {shown} />
    {/if}
    {@render figure()}
  {/if}
{/snippet}

{#snippet figure()}
  {#if View !== null}
    <QuestionPicture
      name={withheld ? null : question.picture}
      url={withheld ? null : pictureUrl}
      large={pictured && !withheld}
      shadow={shadowed}
      {build}
      lifted={revealed}
      late={picture === 'reveal'}
      caption={pictured && revealed ? subjectName : null}
    />
  {/if}
{/snippet}

{#snippet broken()}
  <p>This question can't be shown in this version. Refresh to update.</p>
{/snippet}

{#snippet answers()}
  {#if View !== null && held !== undefined}
    <div
      class="gate"
      class:held
      class:backdrop={question.type === 'map_pin'}
      inert={held}
      aria-hidden={held ? 'true' : undefined}
    >
      {@render view()}
    </div>
  {:else if View !== null}
    {@render view()}
  {/if}
{/snippet}

{#snippet view()}
  {#if View !== null && booked && !revealed}
    <div class="booked">
      <p>{afterUse(BOOK)}</p>
      <button type="button" disabled>Answered</button>
    </div>
  {:else if View !== null}
    <View
      {data}
      {revealed}
      {yourValue}
      canAnswer={question.you_can_answer}
      {result}
      {results}
      {timing}
      stacked={MODES[question.mode]?.stacked}
      mapIcons={rulesOf(question.mode)?.map_icons}
      mapLabels={rulesOf(question.mode)?.map_labels}
      removed={question.removed}
      {onAnswer}
    />
    {#if !question.you_can_answer && !revealed}
      <p class="note unscored">This one is not scored for you — sit back and watch.</p>
    {/if}
    {#if revealed && result?.by_book === true}
      <p class="note by-book">Answered by the Book of Knowledge</p>
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
      {@render frame(stem, View === null ? null : answers, figure)}
    {:else}
      {@render stem()}
      {@render answers()}
    {/if}
    {#snippet failed()}
      {#if frame}
        {@render frame(broken, null, null)}
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

  .gate.held:not(.backdrop) {
    opacity: 0;
  }

  .gate.backdrop {
    position: relative;
    height: 100%;
  }

  /* The map leaves no room below it. */
  .gate.backdrop .unscored {
    position: absolute;
    z-index: 1000;
    right: 0.75rem;
    bottom: 0.75rem;
    margin: 0;
    padding: 0.25rem 0.6rem;
    background: var(--panel);
    color: var(--surface-ink);
    border-radius: var(--radius);
  }

  @media (prefers-reduced-motion: reduce) {
    .gate {
      transition: none;
    }
  }

  .unscored,
  .by-book,
  .explanation {
    margin: 1rem 0 0;
  }

  .booked {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .booked p {
    margin: 0;
    font-weight: 650;
  }

  .booked button {
    min-height: 44px;
  }

  .explanation {
    overflow-wrap: anywhere;
  }
</style>
