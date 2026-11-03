<script lang="ts">
  /**
   * A map question's results: how many pinned the place, then every pin nearest first with its
   * pet, distance and points, and last who placed none. `MapPin` draws the same rows on the map.
   */
  import { pinRows, type PinTarget } from '../lib/pins'
  import { petOf } from '../lib/pets'
  import type { PlayerResult } from '../lib/protocol'
  import { players } from '../lib/stores'
  import Pet from './Pet.svelte'

  let {
    reveal,
    results,
    unanswered,
    nameOf,
    youId,
  }: {
    /** `question_closed.reveal`. */
    reveal: Record<string, unknown>
    results: Record<string, PlayerResult>
    unanswered: string[]
    nameOf: (id: string) => string | null
    youId: string | null
  } = $props()

  const count = new Intl.NumberFormat()

  const targets = $derived((reveal.targets ?? []) as PinTarget[])
  const reach = $derived((reveal.reach ?? 1) as number)
  const rows = $derived(pinRows(results, targets, reach))
  const everyone = $derived(rows.length + unanswered.length)
  const allIn = $derived(rows.filter((row) => row.inside === targets.length).length)
  const place = $derived(
    targets.length === 1 ? `inside ${targets[0]?.name}` : `got all ${targets.length}`,
  )

  function tiles(off: number): string {
    const whole = Math.round(off)
    return `${count.format(whole)} ${whole === 1 ? 'tile' : 'tiles'}`
  }

  function detail(row: (typeof rows)[number]): string {
    if (targets.length === 1) return tiles(row.off)
    return `${row.inside} of ${targets.length} inside, ${tiles(row.off)} on average`
  }

  const petFor = (id: string): string => {
    const player = $players.find((one) => one.id === id)
    return player === undefined ? '' : petOf(player)
  }

  const missing = $derived(
    unanswered
      .map((id) => nameOf(id))
      .filter((name) => name !== null)
      .join(', '),
  )
</script>

{#if everyone === 0}
  <p class="got">Nobody answered this one.</p>
{:else}
  <p class="got"><strong class="number">{allIn} of {everyone}</strong> {place}</p>
  <ol class="ranking">
    {#each rows as row (row.id)}
      <li class="pinned" class:you={row.id === youId}>
        <span class="pet"><Pet pet={petFor(row.id)} size={32} label="" /></span>
        <span class="who">
          {row.id === youId ? 'You' : (nameOf(row.id) ?? '?')}
          <small>{detail(row)}</small>
        </span>
        <span class="number">+{count.format(row.points)}</span>
      </li>
    {/each}
  </ol>
  {#if missing !== ''}
    <p class="missing">No pin: {missing}</p>
  {/if}
{/if}

<style>
  p {
    margin: 0;
  }

  .got {
    font-size: 1.1rem;
  }

  .ranking {
    display: grid;
    gap: 0.35rem;
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
  }

  .pinned {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: center;
  }

  .pet {
    width: 2rem;
    height: 2rem;
  }

  .who {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }

  .you {
    font-weight: 700;
  }

  small {
    display: block;
    color: var(--muted);
    font-size: 0.85em;
  }

  .number {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .missing {
    margin-top: 0.6rem;
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
