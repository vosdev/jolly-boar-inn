<script lang="ts">
  /**
   * Under a reveal's buttons: how many of the room got it right, and, if the host turned
   * it on, who got it wrong.
   *
   * Everything here comes from `question_closed.results`, which already carries every
   * player's row; nothing new crosses the wire. "Right" is `correct`, full credit. Partial
   * credit gets a line per band under it, so a closest-number question, where almost
   * nobody is exact, does not read as "0 of 6". There the bands are ranks, not accuracy:
   * the closest guess earns 0.9 however far off it was, so it says "closest" rather than
   * "90% right". "Wrong" is under the lowest band, which is also where closest number
   * stops paying. Pick all that apply instead counts right picks against the reveal's
   * `answer_indices`, a line per outcome, because its credit punishes misses and extras
   * alike and half the right options can sit far under 70%; only a player with no right
   * pick is wrong. Ordering likewise has a line per number of entries in place, read off
   * `credit`, and with `picks` also those out of place, read off the value; no credit is
   * wrong. A player who did not
   * answer is neither:
   * sitting a question out is not getting it wrong (the points slot makes the same
   * distinction).
   *
   * The names are the room's taste, so they are `settings.name_wrong_answers`, off unless
   * the host asks. The count is always there: it is the answer to "was that a hard one?",
   * which is what people ask each other across the table while the reveal runs.
   *
   * Last, the player who suggested the question, when they asked to be named. It sits off
   * the scroll and under everything else, so the reveal reads the same with or without it.
   */
  import type { PlayerResult } from '../lib/protocol'
  import { inPlace, placement } from './questions/types/Ordering.svelte'

  let {
    type,
    reveal,
    results,
    nameOf,
    youId,
    showNames,
    suggestedBy = null,
  }: {
    /** The question's type, which decides what partial credit means. */
    type: string
    /** `question_closed.reveal`: pick all that apply's right options, ordering's entries. */
    reveal: Record<string, unknown>
    results: Record<string, PlayerResult>
    /** A player's name by id; null for somebody the room no longer knows. */
    nameOf: (id: string) => string | null
    youId: string | null
    showNames: boolean
    /** `question_closed.suggested_by`. */
    suggestedBy?: string | null
  } = $props()

  // Highest first: a player counts once, in the first band their credit reaches.
  const BANDS = [0.9, 0.8, 0.7]
  const LOWEST = BANDS[BANDS.length - 1] ?? 0
  // Closest number's ladder (`closest_number.LADDER` on the server), one rung per band.
  const RANKS = ['closest', 'second closest', 'third closest']

  interface Line {
    key: string
    count: number
    said: string
  }

  const ranked = $derived(type === 'closest_number')
  const picking = $derived(type === 'pick_all_that_apply')
  const ordering = $derived(type === 'ordering')
  const places = $derived(
    typeof reveal.picks === 'number'
      ? reveal.picks
      : ((reveal.entries as unknown[] | undefined)?.length ?? 0),
  )
  /** An ordering answer's places right and, with `picks`, its right picks out of place. */
  function placed(credit: number, value: unknown): { inPlace: number; outOfPlace: number } {
    return 'picks' in reveal
      ? placement(reveal, value)
      : { inPlace: inPlace(credit, places), outOfPlace: 0 }
  }
  const rows = $derived(Object.entries(results))
  const right = $derived(rows.filter(([, result]) => result.correct).length)
  const was = (count: number) => (count === 1 ? 'was' : 'were')

  const answers = $derived(new Set((reveal.answer_indices as number[] | undefined) ?? []))
  /** A pick-all answer's right picks and, unless `picks` made it pick that many, its wrong ones. */
  function picked(value: unknown): { hits: number; extras: number } {
    const indices = Array.isArray(value) ? (value as number[]) : []
    const hits = indices.filter((index) => answers.has(index)).length
    return { hits, extras: 'picks' in reveal ? 0 : indices.length - hits }
  }

  const bands = $derived.by((): Line[] => {
    if (ordering) {
      const lines = new Map<string, Line & { credit: number; hits: number }>()
      for (const [, { correct, credit, value }] of rows) {
        if (correct || credit === 0) continue
        const { inPlace: hits, outOfPlace } = placed(credit, value)
        const key = `${hits}/${outOfPlace}`
        const said = `had ${hits} of ${places} in place${outOfPlace > 0 ? `, ${outOfPlace} out of place` : ''}`
        const line = lines.get(key) ?? { key, count: 0, said, credit, hits }
        line.count += 1
        lines.set(key, line)
      }
      return [...lines.values()].sort((a, b) => b.credit - a.credit || b.hits - a.hits)
    }
    if (picking) {
      const lines = new Map<string, Line & { credit: number; hits: number }>()
      for (const [, { correct, credit, value }] of rows) {
        const { hits, extras } = picked(value)
        if (correct || hits === 0) continue
        const key = `${hits}/${extras}`
        const said = `got ${hits} of ${answers.size} right${extras > 0 ? `, ${extras} wrong` : ''}`
        const line = lines.get(key) ?? { key, count: 0, said, credit, hits }
        line.count += 1
        lines.set(key, line)
      }
      return [...lines.values()].sort((a, b) => b.credit - a.credit || b.hits - a.hits)
    }
    return BANDS.map((least, index) => {
      const count = rows.filter(
        ([, { correct, credit }]) =>
          !correct && credit >= least && credit < (BANDS[index - 1] ?? Infinity),
      ).length
      return {
        key: String(least),
        count,
        said: ranked
          ? `${was(count)} ${RANKS[index]}`
          : `${was(count)} at least ${Math.round(least * 100)}% right`,
      }
    }).filter((band) => band.count > 0)
  })
  const wrong = $derived(
    rows
      .filter(([, result]) =>
        ordering
          ? !result.correct && result.credit === 0
          : picking
            ? !result.correct && picked(result.value).hits === 0
            : !result.correct && result.credit < LOWEST,
      )
      .map(([id]) => ({ id, name: nameOf(id) ?? 'Someone who left', you: id === youId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
</script>

<div class="tally">
  {#if rows.length === 0}
    <p class="count">Nobody answered this one.</p>
  {:else}
    <p class="count">
      <strong class="number">{right} of {rows.length}</strong>
      {ranked ? 'guessed it exactly' : 'got it right'}
    </p>
    {#each bands as band (band.key)}
      <p class="count band">
        <strong class="number">{band.count} of {rows.length}</strong>
        {band.said}
      </p>
    {/each}
    {#if showNames && wrong.length > 0}
      <p class="wrong">
        <span class="label">Got it wrong:</span>
        {#each wrong as player, index (player.id)}
          <span class="who" class:you={player.you}>{player.name}{player.you ? ' (you)' : ''}</span
          >{index < wrong.length - 1 ? ', ' : ''}
        {/each}
      </p>
    {/if}
  {/if}
  {#if suggestedBy !== null}
    <p class="credit">Question by {suggestedBy}</p>
  {/if}
</div>

<style>
  .tally {
    margin: 1rem 0 0;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
    font-size: 0.95rem;
  }

  p {
    margin: 0;
  }

  .count {
    color: var(--muted);
  }

  .band {
    margin-top: 0.2rem;
  }

  .number {
    color: var(--ink);
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
  }

  .wrong {
    margin-top: 0.35rem;
    overflow-wrap: anywhere;
  }

  .label {
    color: var(--muted);
  }

  .who.you {
    font-weight: 600;
  }

  .credit {
    margin-top: 0.35rem;
    color: var(--muted);
    font-style: italic;
    overflow-wrap: anywhere;
  }
</style>
