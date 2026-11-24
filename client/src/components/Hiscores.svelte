<script lang="ts">
  /**
   * The hiscores on the Wise Old Man's scroll (section 11 of ideas/design.md): rank, pet,
   * name and points, with the round's gain under each total and the places moved under
   * each rank, two lines a row so a name keeps the middle at 350px. With `columns`, on a
   * desktop's wide sheet, each row is one line: rank, move, name, the round's gain, points.
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
   *
   * `drops` puts a column of Mystery Boxes between the name and the numbers, one on each
   * finder's row, so the boxes stand under each other; they open from `opening` on, each a
   * beat after the one above.
   */
  import { cubicOut } from 'svelte/easing'
  import { flip } from 'svelte/animate'

  import { arrivalDelay, movement, pointsBefore, SHUFFLE, type Movement } from '../lib/hiscores'
  import { petOf } from '../lib/pets'
  import type { Drop, Standing } from '../lib/protocol'
  import { players } from '../lib/stores'
  import CountUp from './CountUp.svelte'
  import MysteryBox, { BOX_BEAT_MS } from './MysteryBox.svelte'
  import Emoting from './Emoting.svelte'
  import Pet from './Pet.svelte'

  let {
    rows,
    youId = null,
    settled = true,
    pinned = false,
    arriving = false,
    instant = false,
    changes = true,
    columns = false,
    drops = [],
    opening = false,
    boxInstant = false,
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
    /** One line a row, the move and the gain in columns of their own. */
    columns?: boolean
    /** The items this standings dealt, in standings order. */
    drops?: Drop[]
    /** The rows have moved: the boxes open. */
    opening?: boolean
    /** The boxes are shown open: reduced motion, or a screen that missed the drop. */
    boxInstant?: boolean
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

{#snippet moved(move: Movement | null)}
  {#if move !== null}
    <span class="move" class:up={move.up} class:down={!move.up}>
      <span class="sr">{move.up ? 'up ' : 'down '}</span>{move.by}
    </span>
  {/if}
{/snippet}

{#snippet gained(standing: Standing)}
  <span class="gain" class:shown={settled}>
    +{numbers.format(standing.points_gained)}<span class="sr">{' this round'}</span>
  </span>
{/snippet}

{#snippet boxHead()}
  <th scope="col" class="box"><span class="sr">Mystery Box</span></th>
{/snippet}

<table class="hiscores" class:arriving class:columns>
  <thead>
    <tr>
      {#if columns}
        <th scope="col" class="rank">Rank</th>
        {#if changes}<th scope="col" class="moved"><span class="sr">Moved</span></th>{/if}
        <th scope="col" class="name">Name</th>
        {#if drops.length > 0}{@render boxHead()}{/if}
        {#if changes}<th scope="col" class="round">This round</th>{/if}
      {:else}
        <th scope="col" class="rank">
          <span aria-hidden="true">#</span><span class="sr">Rank</span>
        </th>
        <th scope="col" class="name">Name</th>
        {#if drops.length > 0}{@render boxHead()}{/if}
      {/if}
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
          {#if !columns}{@render moved(move)}{/if}
        </td>
        {#if columns && changes}<td class="moved">{@render moved(move)}</td>{/if}
        <td class="name">
          <span class="who">
            <Emoting playerId={standing.player_id}>
              <Pet pet={petFor(standing)} size={28} label="" />
            </Emoting>
            <span>
              {nameOf(standing)}{#if you}{' '}<span class="note">(you)</span>{/if}
            </span>
          </span>
        </td>
        {#if drops.length > 0}
          {@const drop = drops.findIndex((d) => d.player_id === standing.player_id)}
          <td class="box">
            {#if drop >= 0}
              <MysteryBox
                item={drops[drop]?.item ?? ''}
                {opening}
                instant={boxInstant}
                delay={drop * BOX_BEAT_MS}
              />
            {/if}
          </td>
        {/if}
        {#if columns && changes}<td class="round">{@render gained(standing)}</td>{/if}
        <td class="points">
          <span class="total">
            <CountUp
              value={settled ? standing.points : pointsBefore(standing)}
              duration={instant ? 0 : SHUFFLE.count}
            />
          </span>
          {#if changes && !columns}{@render gained(standing)}{/if}
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

  .columns .rank {
    width: 3.5rem;
  }

  .moved {
    width: 3rem;
    text-align: left;
  }

  .box {
    width: 2.5rem;
    text-align: center;
  }

  .round,
  .columns .points {
    width: 7.5rem;
    text-align: right;
  }

  .columns th {
    white-space: nowrap;
  }

  .columns .total {
    font-weight: 700;
  }

  .columns .move,
  .columns .gain {
    font-size: 0.85em;
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
