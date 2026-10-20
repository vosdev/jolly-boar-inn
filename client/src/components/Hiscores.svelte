<script lang="ts">
  /**
   * The hiscores on the Wise Old Man's scroll (section 11 of ideas/design.md): rank, pet,
   * name and points, with the round's gain under each total and the places moved under
   * each rank, two lines a row so a name keeps the middle at 350px.
   *
   * A past game shows neither: it is the result, not the last round.
   *
   * `rows` is the order to draw, and a new order moves the rows rather than jumping them.
   * Until `settled` a row shows where it stood before the round: its rank then and its
   * total then, which count up to the new ones once it settles.
   *
   * Names and pets come from the live player list when the player is in it, as a rename
   * or a re-roll mid-game arrives there first; the row's rank and points are the
   * standing's either way.
   */
  import { cubicOut } from 'svelte/easing'
  import { flip } from 'svelte/animate'

  import { arrivalDelay, movement, pointsBefore, SHUFFLE } from '../lib/hiscores'
  import { petOf } from '../lib/pets'
  import type { Standing } from '../lib/protocol'
  import { players } from '../lib/stores'
  import CountUp from './CountUp.svelte'
  import Pet from './Pet.svelte'

  let {
    rows,
    youId = null,
    settled = true,
    pinned = false,
    arriving = false,
    instant = false,
    changes = true,
  }: {
    rows: Standing[]
    youId?: string | null
    /** The new ranks, totals, gains and moves; otherwise the ones before the round. */
    settled?: boolean
    /** Hold your row at the screen's foot when it would be below the fold. */
    pinned?: boolean
    /** The rows arrive top to bottom, as the final's table unrolls. */
    arriving?: boolean
    /** No counting and no moving: reduced motion. */
    instant?: boolean
    /** The round's gains and moves; a past game has the totals alone. */
    changes?: boolean
  } = $props()

  const numbers = new Intl.NumberFormat()

  function nameOf(standing: Standing): string {
    return $players.find((p) => p.id === standing.player_id)?.display_name ?? standing.display_name
  }

  function petFor(standing: Standing): string {
    const player = $players.find((p) => p.id === standing.player_id)
    return petOf(player ?? { id: standing.player_id, avatar: standing.avatar })
  }
</script>

<table class="hiscores" class:arriving>
  <thead>
    <tr>
      <th scope="col" class="rank"><span aria-hidden="true">#</span><span class="sr">Rank</span></th
      >
      <th scope="col" class="name">Name</th>
      <th scope="col" class="points">Points</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as standing, i (standing.player_id)}
      {@const you = standing.player_id === youId}
      {@const move = settled && changes ? movement(standing) : null}
      <tr
        class:you
        class:pinned={you && pinned}
        style:animation-delay={arriving ? `${arrivalDelay(i + 1, rows.length + 1)}ms` : null}
        animate:flip={{ duration: instant ? 0 : SHUFFLE.move, easing: cubicOut }}
      >
        <td class="rank">
          <span class="number">{settled ? standing.rank : (standing.previous_rank ?? '–')}</span>
          {#if move !== null}
            <span class="move" class:up={move.up} class:down={!move.up}
              ><span class="sr">{move.up ? 'up ' : 'down '}</span>{move.by}</span
            >
          {/if}
        </td>
        <td class="name">
          <span class="who">
            <Pet pet={petFor(standing)} size={28} label="" />
            <span
              >{nameOf(standing)}{#if you}{' '}<span class="note">(you)</span>{/if}</span
            >
          </span>
        </td>
        <td class="points">
          <span class="total"
            ><CountUp
              value={settled ? standing.points : pointsBefore(standing)}
              duration={instant ? 0 : SHUFFLE.count}
            /></span
          >
          {#if changes}
            <span class="gain" class:shown={settled}
              >+{numbers.format(standing.points_gained)}<span class="sr">{' this round'}</span
              ></span
            >
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .hiscores {
    width: 100%;
    border-collapse: collapse;
    font-size: max(0.95rem, 1.05rem * var(--scroll-text, 1));
    font-variant-numeric: tabular-nums;
  }

  th {
    padding: 0 0.25rem 0.3rem;
    font-weight: normal;
    color: var(--muted);
    border-bottom: 2px solid color-mix(in srgb, var(--scroll-edge) 60%, transparent);
  }

  td {
    padding: 0.3rem 0.25rem;
    border-top: 1px solid color-mix(in srgb, var(--scroll-edge) 35%, transparent);
    vertical-align: middle;
  }

  tbody tr:first-child td {
    border-top: none;
  }

  tr {
    position: relative;
  }

  .rank {
    width: 2.6rem;
    text-align: left;
  }

  .name {
    text-align: left;
    overflow-wrap: anywhere;
  }

  .points {
    width: 4.6rem;
    text-align: right;
  }

  .number,
  .total {
    display: block;
  }

  .move,
  .gain {
    display: block;
    min-height: 1.1em;
    font-size: 0.8em;
    color: var(--muted);
  }

  .move::before {
    font-size: 0.8em;
    margin-right: 1px;
  }

  .up::before {
    content: '▲';
  }

  .down::before {
    content: '▼';
  }

  /* Laid out from the start, so the row does not grow when the gain appears. */
  .gain {
    visibility: hidden;
  }

  .gain.shown {
    visibility: visible;
    animation: appear 250ms ease-out;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .who > :global(:first-child) {
    flex: none;
  }

  /* "(you)" goes whole: the name may wrap, the note never splits. */
  .note {
    white-space: nowrap;
    color: var(--muted);
  }

  tr.you td {
    background: color-mix(in srgb, var(--scroll-paper), white 30%);
  }

  /* Your own row, between rounds: in its place when it is on screen, held at the foot of
     the screen when it would be below the fold, so it never needs a scroll. */
  tr.pinned td {
    position: sticky;
    bottom: 0;
    z-index: 2;
    box-shadow: 0 -2px 0 var(--scroll-edge);
  }

  .arriving tr {
    animation: arrive 350ms ease-out both;
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .arriving tr,
    .gain.shown {
      animation: none;
    }
  }
</style>
