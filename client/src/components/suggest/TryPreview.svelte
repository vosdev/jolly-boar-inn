<script lang="ts">
  /**
   * A question being written as players will meet it, open or revealed, with a toggle
   * between the two. An answer given while it is open is graded by the server and shows on
   * the reveal with what it earned, speed not counting.
   *
   * The server's view replaces the local one once the question is whole and has stood still
   * for a moment, because an answer is a position in the server's shuffle, not the order
   * it was written in. Until then the local view shows and answering it does nothing, and
   * the reveal cannot be chosen. Any change to the question drops the answer and goes back
   * to the question.
   */
  import { untrack } from 'svelte'

  import { ApiFailure, tryQuestion } from '../../lib/api'
  import type { OpenQuestion, PlayerResult } from '../../lib/protocol'
  import type { QuestionContent, Trial } from '../../lib/suggestions'
  import { PREVIEW_ID } from '../../lib/resultRows'
  import QuestionStage from '../QuestionStage.svelte'
  import Segmented from '../Segmented.svelte'

  let {
    content,
    question,
    answerable = true,
    hero = null,
  }: {
    /** The question to try, or undefined while it is not whole. */
    content: QuestionContent | undefined
    /** The local view, shown until the server's arrives. */
    question: OpenQuestion
    /** False for an answer not on the list yet, which nobody can pick. */
    answerable?: boolean
    /** Stands in for the host, as on the card the question was picked from. */
    hero?: string | null
  } = $props()

  const DEBOUNCE_MS = 800
  const SIDES = [
    { value: 'question' as const, label: 'Question' },
    { value: 'reveal' as const, label: 'Reveal' },
  ]

  const key = $derived(content === undefined ? null : JSON.stringify(content))
  let side = $state<'question' | 'reveal'>('question')
  let trial = $state<{ key: string; trial: Trial } | null>(null)
  let answer = $state<{ key: string; value: unknown; result: PlayerResult } | null>(null)
  let limited = $state(false)

  $effect(() => {
    const wanted = key
    side = 'question'
    if (wanted === null) return
    const sent = untrack(() => content) as QuestionContent
    const timer = setTimeout(() => {
      tryQuestion(sent).then(
        (got) => {
          limited = false
          trial = { key: wanted, trial: got }
        },
        (error) => (limited = error instanceof ApiFailure && error.code === 'rate_limited'),
      )
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })

  // What the server said about an older version of the question is not shown for this one.
  const current = $derived(trial !== null && trial.key === key ? trial.trial : null)
  const given = $derived(answer !== null && answer.key === key ? answer : null)
  // A trial names no picture, so a picture pin keeps the one the page draws, and a minimap
  // the spot it draws from the tiles.
  const own = $derived({
    ...(typeof question.view.picture === 'string' ? { picture: question.view.picture } : {}),
    ...(question.view.minimap === undefined ? {} : { minimap: question.view.minimap }),
  })
  const shown = $derived<OpenQuestion>(
    current === null ? question : { ...question, view: { ...current.view, ...own } },
  )
  const revealed = $derived(current === null ? null : { ...current.reveal, ...own })

  function onAnswer(value: unknown): void {
    if (current === null || !answerable || key === null) return
    const wanted = key
    tryQuestion(content as QuestionContent, value).then(
      (got) => {
        if (got.result === null || wanted !== key) return
        answer = { key: wanted, value: got.result.value, result: got.result }
        side = 'reveal'
      },
      (error) => (limited = error instanceof ApiFailure && error.code === 'rate_limited'),
    )
  }
</script>

<div class="try">
  <Segmented
    legend="Show"
    hideLegend
    options={SIDES}
    bind:value={side}
    disabled={current === null}
  />
  {#if limited}
    <p class="note">Too many tries for now; the preview stays as it is.</p>
  {/if}
  {#if side === 'reveal' && current !== null}
    {#key `reveal ${key} ${given === null}`}
      <QuestionStage
        question={shown}
        reveal={revealed}
        yourValue={given?.value ?? null}
        result={given?.result ?? null}
        results={given === null ? {} : { [PREVIEW_ID]: given.result }}
        onAnswer={() => {}}
        {hero}
        narrow
      />
    {/key}
  {:else}
    {#key `question ${current === null ? 'local' : key}`}
      <QuestionStage question={shown} yourValue={null} {onAnswer} {hero} />
    {/key}
  {/if}
</div>

<style>
  .try {
    display: grid;
    gap: 0.5rem;
  }

  .note {
    margin: 0;
  }
</style>
