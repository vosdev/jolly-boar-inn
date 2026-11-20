<script lang="ts">
  /**
   * The end of a daily: the day, right answers, points and a row of results, and a copy
   * button for the share text (`lib/daily.ts`). `navigator.clipboard` needs a secure
   * context, so a refused copy shows the text in a field to copy by hand.
   */
  import { tick } from 'svelte'

  import { SQUARES, shareText, type DailyResult } from '../lib/daily'

  let { result, onHome }: { result: DailyResult; onHome: () => void } = $props()

  const text = $derived(shareText(result, location.origin))
  const WORDS = { right: 'right', partial: 'partly right', missed: 'missed' } as const

  let copied = $state(false)
  let shown = $state(false)
  let field: HTMLTextAreaElement | undefined = $state()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => (copied = false), 2000)
    } catch {
      shown = true
      await tick()
      field?.select()
    }
  }
</script>

<section class="panel result">
  <h1>Daily #{result.number}</h1>
  <p class="score">
    <span><strong>{result.correct}/{result.results.length}</strong> right</span>
    <span><strong>{result.points.toLocaleString('en-US')}</strong> points</span>
  </p>
  <ol class="squares" aria-label="Your answers">
    {#each result.results as one, index (index)}
      <li title="Question {index + 1}: {WORDS[one]}">
        <span aria-hidden="true">{SQUARES[one]}</span>
        <span class="sr">Question {index + 1}: {WORDS[one]}</span>
      </li>
    {/each}
  </ol>
  {#if shown}
    <textarea readonly rows="3" bind:this={field} value={text} aria-label="Your result"></textarea>
  {/if}
  <div class="row">
    <button type="button" class="primary" onclick={copy}>
      {copied ? 'Copied' : 'Copy result'}
    </button>
    <button type="button" onclick={onHome}>Home</button>
  </div>
</section>

<style>
  .result {
    max-width: 30rem;
    margin-inline: auto;
    text-align: center;
  }

  .score {
    display: flex;
    justify-content: center;
    gap: 1.5rem;
    font-size: 1.1rem;
  }

  .squares {
    display: flex;
    justify-content: center;
    gap: 0.2rem;
    padding: 0;
    margin: 1rem 0;
    flex-wrap: wrap;
    list-style: none;
    font-size: 1.25rem;
  }

  textarea {
    width: 100%;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }

  .row {
    justify-content: center;
  }
</style>
