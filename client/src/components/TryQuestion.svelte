<script lang="ts">
  /**
   * How to play's Try a question: one sample played in place, with the room's parts. The
   * timer bar, the host over the theme's sheet with the question on it, the answers under
   * the line, and the reveal: the host's line for how you did in the dialogue box, with
   * your points on its chip.
   *
   * It is the page's alone. Nothing goes to the server, so a sample counts in no stats;
   * the grading and the points are `lib/samples.ts`'s copy of the room's. Answering
   * reveals at once, since there is no table to wait for.
   */
  import { get } from 'svelte/store'

  import { serverNow } from '../lib/clock'
  import { MODES, hostOf, pickLines } from '../lib/modes'
  import { verdictFor } from '../lib/award'
  import type { OpenQuestion, PlayerResult } from '../lib/protocol'
  import {
    samplePicture,
    sampleResult,
    sampleReveal,
    sampleSeconds,
    type Sample,
  } from '../lib/samples'
  import PointsSlot from './PointsSlot.svelte'
  import Question from './questions/Question.svelte'
  import Said from './stage/Said.svelte'
  import Stage from './stage/Stage.svelte'
  import TimerBar from './TimerBar.svelte'

  let {
    sample,
    next,
    onnext,
  }: {
    sample: Sample
    /** The mode to try after this one. */
    next: string
    onnext: (mode: string) => void
  } = $props()

  let startedAt = $state(get(serverNow))
  let revealed = $state(false)
  let result = $state<PlayerResult | null>(null)

  const seconds = $derived(sampleSeconds(sample))
  const endsAt = $derived(new Date(startedAt + seconds * 1000).toISOString())
  const host = $derived(hostOf(sample.mode))
  const question: OpenQuestion = $derived({
    question_id: `sample:${sample.mode}`,
    index: 0,
    total: 1,
    type: sample.type,
    mode: sample.mode,
    segment: { mode: sample.mode, index: 0, total: 1, start: 0, count: 1 },
    view: sample.view,
    picture: null,
    random_event: null,
    opened_at: new Date(startedAt).toISOString(),
    answerable_at: new Date(startedAt).toISOString(),
    ends_at: endsAt,
    you_can_answer: true,
    answered: 0,
    of: 1,
    waiting: [],
    item_used: false,
  })
  const lines = $derived(
    pickLines(host, question, { verdict: revealed ? verdictFor(result, true) : null }),
  )
  const nextLabel = $derived(MODES[next]?.label ?? '')

  $effect(() => {
    if (!revealed && $serverNow >= startedAt + seconds * 1000) revealed = true
  })

  function answer(value: unknown): void {
    if (revealed) return
    result = sampleResult(sample, value, get(serverNow) - startedAt)
    revealed = true
  }

  function again(): void {
    result = null
    revealed = false
    startedAt = get(serverNow)
  }
</script>

{#snippet line()}
  <p>{revealed ? lines.reveal : lines.ask}</p>
{/snippet}

{#snippet chip()}
  <PointsSlot {result} canAnswer chip />
{/snippet}

{#if !revealed}
  <TimerBar {endsAt} totalSeconds={seconds} label="left to answer" />
{/if}
<Question
  {question}
  pictureUrl={samplePicture(sample)}
  reveal={revealed ? sampleReveal(sample) : null}
  yourValue={result?.value ?? null}
  {result}
  onAnswer={answer}
>
  {#snippet frame(stem, answers)}
    <Stage host={host.host.id} bubble="on" paper={stem}>
      {#snippet said()}
        {#if revealed}
          <Said name={host.host.name} {line} {chip} />
        {:else}
          <Said name={host.host.name} {line} />
        {/if}
      {/snippet}
      {@render answers?.()}
      {#if revealed}
        <p class="after">
          <button type="button" onclick={again}>Again</button>
          {#if next !== sample.mode}
            <button type="button" class="primary" onclick={() => onnext(next)}>
              Try {nextLabel}
            </button>
          {/if}
        </p>
      {/if}
    </Stage>
  {/snippet}
</Question>

<style>
  .after {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
    margin: 1rem 0 0;
  }
</style>
