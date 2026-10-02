<script lang="ts">
  /**
   * The standings: a podium for the top five, then the OSRS hiscores (section 7.3).
   *
   * One component for both places standings appear — the `standings` phase between rounds
   * and the final screen — so the two can never draw the same numbers differently. What
   * differs is `final`: between rounds the table is everyone the podium does not already
   * show, and your own row stays pinned to the bottom of the screen when it would be below
   * the fold; at the end the table is everyone, top five included, because that is where a
   * name too long for its step is read in full. `lib/podium.ts` does the arranging.
   *
   * Order and `rank` are the server's (section 6: points desc, then correct answers desc,
   * then `joined_at` asc, dense rank). Nothing is sorted or re-ranked here — two clients
   * disagreeing about who is second is exactly the bug this avoids.
   *
   * Names and heads come from the live player list when the player is in it: a
   * rename or a re-roll mid-game arrives in `room_updated` straight away, and the
   * standings frames only at the next close. The row, its rank and its points are the
   * standing's either way — a rename never moves anybody.
   *
   * The gold, silver and bronze medals the table used to carry are gone. The trophies do
   * that job now, and a "Gold" third place beside a gold first-place medal would
   * contradict itself.
   */
  import { headOf } from '../lib/heads'
  import { podium, tableRows, type Step } from '../lib/podium'
  import type { Standing } from '../lib/protocol'
  import { players } from '../lib/stores'
  import { tierName, trophyArt } from '../lib/trophies'
  import Head from './Head.svelte'

  let {
    standings,
    youId = null,
    final = false,
    title = null,
  }: {
    standings: Standing[]
    youId?: string | null
    /** The final screen: the table lists everyone, and nothing is pinned. */
    final?: boolean
    title?: string | null
  } = $props()

  const steps = $derived(podium(standings))
  const rows = $derived(tableRows(standings, final))
  const numbers = new Intl.NumberFormat()
  const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

  function nameOf(standing: Standing): string {
    return $players.find((p) => p.id === standing.player_id)?.display_name ?? standing.display_name
  }

  function headFor(standing: Standing): number {
    const player = $players.find((p) => p.id === standing.player_id)
    return headOf(player ?? { id: standing.player_id, avatar: standing.avatar })
  }

  /** What a screen reader hears for a step, full names and all: the step itself may
      have cut them to two lines. */
  function stepLabel(step: Step): string {
    const place = `${ORDINALS[step.rank - 1]}, ${tierName(step.tier)} trophy`
    if (step.standings.length === 0) return `${place}: nobody`
    const names = step.standings.map(nameOf).join(', ')
    return `${place}: ${names}, ${numbers.format(step.standings[0]?.points ?? 0)} points`
  }
</script>

<section class="panel standings" aria-label={title ?? 'Standings'}>
  {#if title !== null}
    <h2>{title}</h2>
  {/if}

  <ol class="podium">
    {#each steps as step (step.rank)}
      {@const art = trophyArt(step.tier)}
      {@const you = step.standings.some((standing) => standing.player_id === youId)}
      <li
        class="step rank-{step.rank}"
        class:empty={step.standings.length === 0}
        class:you
        data-rank={step.rank}
      >
        <span class="sr">{stepLabel(step)}</span>
        <div class="top" aria-hidden="true">
          <!-- A placeholder is one plain cup, tinted for its tier: deliberate, not a
               missing picture, and a render in assets/trophies/ replaces it. -->
          <span class="trophy" class:placeholder={art.placeholder} data-tier={step.tier}>
            <img src={art.url} alt="" draggable="false" />
          </span>
          {#if step.shown.length > 0}
            <span class="heads">
              {#each step.shown as standing (standing.player_id)}
                <Head head={headFor(standing)} size={48} label="" />
              {/each}
            </span>
            {#if step.more > 0}
              <span class="more">+{step.more}</span>
            {/if}
            <span class="names">{step.standings.map(nameOf).join(', ')}</span>
            <span class="points">{numbers.format(step.standings[0]?.points ?? 0)}</span>
          {/if}
        </div>
        <div class="block" aria-hidden="true">
          <span class="tier">{tierName(step.tier)}</span>
          <span class="number">{step.rank}</span>
        </div>
      </li>
    {/each}
  </ol>

  {#if rows.length > 0}
    <table class="hiscores">
      <thead>
        <tr>
          <th scope="col" class="rank">Rank</th>
          <th scope="col" class="name">Name</th>
          <th scope="col" class="points">Points</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as standing (standing.player_id)}
          {@const you = standing.player_id === youId}
          <tr class:you class:pinned={you && !final}>
            <td class="rank">{standing.rank}</td>
            <td class="name">
              <span class="who">
                <Head head={headFor(standing)} size={32} label="" />
                <span>
                  {nameOf(standing)}{#if you}<span class="note"> (you)</span>{/if}
                </span>
              </span>
            </td>
            <td class="points">{numbers.format(standing.points)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  /* --- The podium ------------------------------------------------------------------ */

  .podium {
    list-style: none;
    margin: 0 0 1.25rem;
    padding: 0;
    display: flex;
    align-items: flex-end;
    gap: 0.25rem;
  }

  .step {
    /* Five equal columns however long the names in them: the names give way, never the
       podium, so a 375px screen never scrolls sideways. */
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    animation: rise 250ms ease-out both;
  }

  .top {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    width: 100%;
    padding-bottom: 0.35rem;
  }

  .trophy {
    display: block;
    width: 3.5rem;
    height: 3.5rem;
  }

  .trophy img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .empty .trophy {
    opacity: 0.35;
  }

  /* Up to three heads, overlapped so a tie still fits a fifth of a phone. */
  .heads {
    display: flex;
    justify-content: center;
  }

  .heads > :global(* + *) {
    margin-left: -2rem;
  }

  .more {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .names {
    width: 100%;
    font-size: 0.8rem;
    line-height: 1.2;
    overflow-wrap: anywhere;
    /* Two lines, then an ellipsis. The full name is in the step's label, and in the
       final screen's table. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .you .names {
    font-weight: 700;
  }

  .step .points {
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
  }

  .block {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 0.3rem 0 0.35rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .tier {
    max-width: 100%;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .number {
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  /* Lower from the centre: first tallest, fifth lowest. */
  .rank-1 .block {
    height: 5.5rem;
  }

  .rank-2 .block {
    height: 4.5rem;
  }

  .rank-3 .block {
    height: 3.75rem;
  }

  .rank-4 .block {
    height: 3.25rem;
  }

  /* The lowest still holds its tier and its number. */
  .rank-5 .block {
    height: 2.9rem;
  }

  /* The steps rise once when the standings open, and nothing else moves. */
  @keyframes rise {
    from {
      transform: translateY(1rem);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step {
      animation: none;
    }
  }

  /* --- The hiscores ---------------------------------------------------------------- */

  .hiscores {
    width: 100%;
    border-collapse: collapse;
  }

  .hiscores th {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 0 0 0.35rem;
    border-bottom: 1px solid var(--line);
  }

  .hiscores td {
    padding: 0.4rem 0;
    border-top: 1px solid var(--line);
  }

  .hiscores tbody tr:first-child td {
    border-top: none;
  }

  .hiscores .rank {
    width: 2.75rem;
    text-align: left;
    font-variant-numeric: tabular-nums;
  }

  .hiscores .name {
    text-align: left;
    overflow-wrap: anywhere;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .who > :global(:first-child) {
    flex: none;
  }

  .hiscores .points {
    width: 5rem;
    text-align: right;
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
  }

  tr.you td {
    background: var(--panel-raised);
    font-weight: 600;
  }

  /* Your own row, between rounds: in its place when it is on screen, held at the bottom
     of the screen when it would be below the fold, so it never needs a scroll. */
  tr.pinned td {
    position: sticky;
    bottom: 0;
    box-shadow: 0 -1px 0 var(--line);
  }

  @media (max-width: 26rem) {
    .trophy {
      width: 2.5rem;
      height: 2.5rem;
    }

    .heads > :global(* + *) {
      margin-left: -2.5rem;
    }

    /* "PLATINUM" across a fifth of a phone. */
    .tier {
      font-size: 0.55rem;
      letter-spacing: 0.02em;
    }
  }
</style>
