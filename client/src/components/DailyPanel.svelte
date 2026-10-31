<script lang="ts">
  /**
   * Home's one place for the daily: today's to play, finish or read back, and Your dailies,
   * the earlier days this browser finished (`lib/daily.ts`). `today` is null when the server
   * did not answer, and then only the list is left.
   *
   * Today's score sits at the top, so the list starts at the day before.
   */
  import type { DailyToday } from '../lib/api'
  import { lastDaily, numberOn, type DailyScore } from '../lib/daily'
  import { dailyDate, expiresIn } from '../lib/dates'
  import Icon from './Icon.svelte'
  import ScoreRing from './ScoreRing.svelte'

  let {
    today,
    scores,
    now,
    onplay,
  }: {
    today: DailyToday | null
    /** Newest first. */
    scores: DailyScore[]
    now: number
    onplay: () => void
  } = $props()

  const PAGE = 5
  const last = lastDaily()
  const running = last !== null && !last.finished ? last : null

  const score = $derived(scores.find((one) => one.day === today?.day) ?? null)
  const earlier = $derived(scores.filter((one) => one !== score))
  let page = $state(0)
  const pages = $derived(Math.ceil(earlier.length / PAGE))
  const shown = $derived(earlier.slice(page * PAGE, (page + 1) * PAGE))

  function points(value: number): string {
    return value.toLocaleString('en-US')
  }
</script>

<section class="panel daily" aria-labelledby="daily-heading">
  <div class="today">
    {#if running === null && score !== null}
      <ScoreRing correct={score.correct} total={score.total} />
    {/if}
    <div class="what">
      <h2 id="daily-heading">Daily challenge</h2>
      {#if today !== null}
        {#if running !== null}
          <p>You left this one unfinished.</p>
        {:else if score !== null}
          <p><strong>Daily #{score.number}: {points(score.points)} points</strong></p>
          <p>
            A new daily challenge will be available {expiresIn(Date.parse(today.next_at), now)}.
          </p>
        {:else}
          <ul class="facts">
            <li><Icon name="person" />By yourself</li>
            <li>10 questions</li>
            <li>One try</li>
          </ul>
        {/if}
      {/if}
    </div>
    {#if today !== null}
      {#if running !== null}
        <button type="button" class="primary" onclick={onplay}>
          Finish Daily #{numberOn(running.day, today)}
        </button>
      {:else if score !== null}
        <button type="button" onclick={onplay}>Your result</button>
      {:else}
        <button type="button" class="primary" onclick={onplay}>Play Daily #{today.number}</button>
      {/if}
    {/if}
  </div>

  {#if earlier.length > 0}
    <div class="history">
      <h3>Your dailies</h3>
      <ul class="players">
        {#each shown as one (one.day)}
          <li>
            <ScoreRing correct={one.correct} total={one.total} small />
            <span class="name">
              <span class="number">#{one.number}</span>
              <span class="when">{dailyDate(one.day)}</span>
            </span>
            <span class="result">
              <strong>{one.correct}/{one.total}</strong>
              <span class="when">{points(one.points)}</span>
            </span>
          </li>
        {/each}
      </ul>
      {#if pages > 1}
        <nav class="paging" aria-label="Your dailies pages">
          <button type="button" class="small" disabled={page === 0} onclick={() => page--}>
            Newer
          </button>
          <span class="when">Page {page + 1} of {pages}</span>
          <button type="button" class="small" disabled={page === pages - 1} onclick={() => page++}>
            Older
          </button>
        </nav>
      {/if}
    </div>
  {/if}
</section>

<style>
  .daily {
    container-type: inline-size;
  }

  .today {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
  }

  .what {
    flex: 1 1 12rem;
    min-width: 0;
  }

  h2 {
    margin: 0;
  }

  .what p {
    margin: 0.2rem 0 0;
    color: var(--muted);
  }

  .what strong {
    color: var(--ink);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.5rem;
    margin: 0.45rem 0 0;
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .history {
    margin-top: 0.9rem;
    padding-top: 0.75rem;
    border-top: var(--border-width) solid var(--line);
  }

  h3 {
    margin: 0 0 0.15rem;
    font-size: 1rem;
  }

  /* Across, newest first, once the panel has the width for two: the first row of each has
     nothing above it to rule off. */
  @container (min-width: 36rem) {
    .history ul {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 2.5rem;
    }

    .history li:nth-child(2) {
      border-top: none;
    }
  }

  .number {
    display: block;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    letter-spacing: 0.08em;
    font-weight: 600;
  }

  .when {
    display: block;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .result {
    margin-left: auto;
    text-align: right;
    line-height: 1.25;
  }

  .result strong {
    display: block;
  }

  .paging {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .paging .when {
    font-size: inherit;
  }
</style>
