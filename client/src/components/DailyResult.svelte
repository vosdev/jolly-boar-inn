<script lang="ts">
  /**
   * The end of a daily: the day, right answers, points and a row of results, how many of the
   * day's other players it beat and the streak, and a copy button for the share text
   * (`lib/daily.ts`). The comparison tile is left out while the server sends none. `navigator.clipboard` needs a secure
   * context, so a refused copy shows the text in a field to copy by hand.
   */
  import { tick } from 'svelte'

  import { SQUARES, beatenShare, shareText, type DailyResult } from '../lib/daily'

  let {
    result,
    streak,
    onHome,
  }: {
    result: DailyResult
    /** Days finished in a row up to the result's, from this browser's scores. */
    streak: number
    onHome: () => void
  } = $props()

  const share = $derived(beatenShare(result))

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
  <div class="tiles" class:alone={share === null}>
    {#if share !== null}
      <p class="tile">
        <strong>{share}%</strong>
        <span>of today's {result.others?.toLocaleString('en-US')} players beaten</span>
      </p>
    {/if}
    <p class="tile">
      <strong>{streak}</strong>
      <span>{streak === 1 ? 'day' : 'days'} in a row</span>
    </p>
  </div>
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

  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin: 0 0 1rem;
  }

  .tiles.alone {
    grid-template-columns: minmax(0, 1fr);
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 1rem 0.75rem 0.9rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
  }

  .tile strong {
    font-family: var(--font-numeric);
    font-size: 2.5rem;
    line-height: 1;
    color: var(--ok);
  }

  .tile span {
    color: var(--muted);
    font-size: 0.875rem;
  }

  textarea {
    width: 100%;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }

  .row {
    justify-content: center;
  }
</style>
