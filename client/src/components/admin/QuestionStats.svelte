<script lang="ts">
  /**
   * The Questions tab's Stats view: how players score on each pack question, against its
   * tier's band, and the tier that would fit it better.
   *
   * Set queues an ordinary tier edit, which waits in Pending changes like any other; the
   * suggestion is measured against the tier the packs hold, so a queued one shows as
   * "Set to" until it is discarded or applied.
   */
  import { onMount } from 'svelte'

  import { getQuestionStats } from '../../lib/admin'
  import type { QuestionChange } from '../../lib/questionEdits'
  import {
    band,
    enough,
    inScope,
    MIN_ANSWERS,
    MIN_GAMES,
    RAN_OUT_FLAG,
    ranOut,
    scored,
    STATS_SORTS,
    statsRows,
    suggestion,
    type QuestionStats,
    type StatsFilter,
    type StatsSort,
  } from '../../lib/questionStats'
  import { packAnswer, questionLine, reportModeName, type PackQuestion } from '../../lib/reports'
  import {
    QUESTION_DIFFICULTIES,
    SUGGESTED_TYPE_LABELS,
    type QuestionDifficulty,
    type SuggestedType,
  } from '../../lib/suggestions'

  let {
    token,
    modes,
    changes,
    busy,
    onset,
    ondiscard,
    onfail,
  }: {
    token: string
    modes: string[]
    changes: ReadonlyMap<string, QuestionChange>
    busy: boolean
    onset: (question: PackQuestion, tier: QuestionDifficulty) => void
    ondiscard: (change: QuestionChange) => void
    onfail: (error: unknown, otherwise: string) => void
  } = $props()

  let all = $state<QuestionStats[] | null>(null)
  let filter = $state<StatsFilter>({ mode: '', tier: '', onlySuggestions: false })
  let sort = $state<StatsSort>('band')

  const TIER_LABELS = Object.fromEntries(
    QUESTION_DIFFICULTIES.map((tier) => [tier.value, tier.label]),
  ) as Record<QuestionDifficulty, string>

  const rows = $derived(all === null ? [] : statsRows(all, filter, sort))
  const suggested = $derived(
    all === null ? 0 : inScope(all, filter).filter((row) => suggestion(row) !== null).length,
  )

  onMount(async () => {
    try {
      all = await getQuestionStats(token)
    } catch (error) {
      onfail(error, 'the stats did not load')
    }
  })

  function typeLabel(type: string): string {
    return SUGGESTED_TYPE_LABELS[type as SuggestedType] ?? type
  }

  /** The tier a queued edit would give the question, when it differs from the packs'. */
  function queuedTier(question: PackQuestion): QuestionDifficulty | undefined {
    const change = changes.get(question.id)
    if (change?.action !== 'edit') return undefined
    const tier = change.question?.difficulty
    return tier !== question.difficulty ? tier : undefined
  }
</script>

<p class="note">
  How players score on each hand-written question: games with two or more players, admins' answers
  left out. A tier is suggested once a question has {MIN_ANSWERS} answers from
  {MIN_GAMES} games and its scored share leaves its tier's band.
</p>

<div class="filters">
  <div class="field">
    <label for="stats-mode">Round</label>
    <select id="stats-mode" bind:value={filter.mode}>
      <option value="">All rounds</option>
      {#each modes as each (each)}
        <option value={each}>{reportModeName(each)}</option>
      {/each}
    </select>
  </div>
  <div class="field">
    <label for="stats-tier">Tier</label>
    <select id="stats-tier" bind:value={filter.tier}>
      <option value="">All</option>
      {#each QUESTION_DIFFICULTIES as tier (tier.value)}
        <option value={tier.value}>{tier.label}</option>
      {/each}
    </select>
  </div>
  <div class="field">
    <label for="stats-sort">Sort</label>
    <select id="stats-sort" bind:value={sort}>
      {#each STATS_SORTS as each (each.value)}
        <option value={each.value}>{each.label}</option>
      {/each}
    </select>
  </div>
  <label class="check">
    <input type="checkbox" bind:checked={filter.onlySuggestions} />
    Only suggestions ({suggested})
  </label>
</div>

{#if all === null}
  <p class="note">Loading…</p>
{:else if rows.length === 0}
  <p class="note">No question matches.</p>
{:else}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">Question</th>
          <th scope="col">Round</th>
          <th scope="col">Tier</th>
          <th scope="col">Answers</th>
          <th scope="col">Scored</th>
          <th scope="col" title="Time ran out, or the host skipped the question">No answer</th>
          <th scope="col">Suggested</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.question.id)}
          {@const question = row.question}
          {@const fits = band(question)}
          {@const share = scored(row)}
          {@const late = ranOut(row)}
          {@const tier = suggestion(row)}
          {@const change = changes.get(question.id)}
          {@const queued = queuedTier(question)}
          <tr class:dim={!enough(row)}>
            <td class="question">
              <div class="prompt">{questionLine(question)}</div>
              <div class="answer">{packAnswer(question)} · {typeLabel(question.type)}</div>
            </td>
            <td class="mode">{reportModeName(question.mode)}</td>
            <td>
              {#if question.difficulty === undefined}
                <span class="muted">—</span>
              {:else}
                <span class="chip {question.difficulty}">{TIER_LABELS[question.difficulty]}</span>
              {/if}
            </td>
            <td class="num">{row.answers} <span class="muted">in {row.games} games</span></td>
            <td>
              {#if share === null}
                <span class="muted">—</span>
              {:else}
                <div class="scored">
                  {#if fits !== null}
                    <div
                      class="track"
                      role="img"
                      aria-label="{share}% scored; its band is {fits.low} to {fits.high}%"
                    >
                      <span
                        class="band"
                        style:left="{fits.low}%"
                        style:width="{fits.high - fits.low}%"
                      ></span>
                      <span class="mark" style:left="{share}%"></span>
                    </div>
                  {/if}
                  <span class="num share">{share}%</span>
                </div>
              {/if}
            </td>
            <td class="num">
              {#if late === null}
                <span class="muted">—</span>
              {:else}
                <span class:warn={late >= RAN_OUT_FLAG}>{late}%</span>
              {/if}
            </td>
            <td>
              {#if change?.action === 'delete'}
                <span class="chip hard">To delete</span>
              {:else if queued !== undefined && change !== undefined}
                <div class="act">
                  <span class="chip queued">Set to {TIER_LABELS[queued]}</span>
                  <button type="button" disabled={busy} onclick={() => ondiscard(change)}>
                    Discard
                  </button>
                </div>
              {:else if tier !== null}
                <div class="act">
                  <span class="chip {tier}">{TIER_LABELS[tier]}</span>
                  <button type="button" disabled={busy} onclick={() => onset(question, tier)}>
                    Set
                  </button>
                </div>
              {:else if fits === null}
                <span class="muted">—</span>
              {:else if !enough(row)}
                <span class="muted">Too few answers</span>
              {:else}
                <span class="muted">Fits its tier</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<p class="legend">
  <span><span class="swatch"></span>Its tier's band: no suggestion inside it.</span>
  <span>
    Easy 55–100%, medium 30–80%, hard 0–60%; 10 higher for multiple choice, pick all, ordering and
    matching, where a guess scores.
  </span>
  <span><span class="warn">{RAN_OUT_FLAG}%</span> or more did not answer.</span>
</p>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0 1rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    margin-bottom: 1rem;
  }

  .scroll {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--surface-muted) var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel-raised);
  }

  table {
    width: 100%;
    min-width: 60rem;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    padding: 0.55rem 0.75rem;
    border-top: 1px solid var(--line);
    text-align: left;
    vertical-align: middle;
  }

  th {
    border-top: none;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .question {
    max-width: 20rem;
  }

  .prompt {
    font-weight: 500;
  }

  .answer,
  .mode,
  .muted {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .mode {
    white-space: nowrap;
  }

  .num {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .dim td {
    opacity: 0.7;
  }

  .scored,
  .act {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .share {
    min-width: 3ch;
    font-weight: 600;
  }

  .track {
    position: relative;
    flex: none;
    width: 8rem;
    height: 0.75rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--line) 25%, transparent);
    overflow: hidden;
  }

  .band,
  .swatch {
    background: color-mix(in srgb, var(--ok) 35%, transparent);
  }

  .band {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--ink);
  }

  .swatch {
    display: inline-block;
    width: 1.4rem;
    height: 0.6rem;
    margin-right: 0.4rem;
    border-radius: 999px;
    vertical-align: middle;
  }

  .warn {
    color: var(--warn);
    font-weight: 700;
  }

  .chip {
    display: inline-block;
    padding: 0.05rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .chip.easy {
    border-color: var(--ok);
    color: var(--ok);
  }

  .chip.medium {
    border-color: var(--warn);
    color: var(--warn);
  }

  .chip.hard {
    border-color: var(--bad);
    color: var(--bad);
  }

  .chip.queued {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }

  .act button {
    min-height: 2.25rem;
    padding: 0.2rem 0.7rem;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    margin: 1rem 0 0;
    color: var(--muted);
    font-size: 0.82rem;
  }
</style>
