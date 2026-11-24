<script lang="ts">
  /**
   * The TV's panel beside an open question: how many have answered, of how many can, the
   * pets and names of everyone still thinking, so the room knows whom to hurry, and under
   * them a row of the faces that have answered, which play their emotes.
   *
   * The ids are the server's `waiting`, which comes with every count; a player who drops
   * leaves the panel at once rather than at the next answer, since the TV cannot hurry a
   * phone that has gone to sleep. The answered are the connected players not waiting, as on
   * a phone's table, and only while somebody can answer. Never what anyone answered: that
   * is the reveal's.
   */
  import { petOf } from '../lib/pets'
  import type { PlayerView } from '../lib/protocol'
  import { answerCount, players } from '../lib/stores'
  import Emoting from './Emoting.svelte'
  import Pet from './Pet.svelte'
  import TvPanel from './TvPanel.svelte'

  const waiting = $derived(
    ($answerCount?.waiting ?? [])
      .map((id) => $players.find((player) => player.id === id))
      .filter((player): player is PlayerView => player !== undefined && player.connected),
  )
  const answered = $derived(
    $answerCount === null || $answerCount.of === 0
      ? []
      : $players.filter(
          (player) =>
            player.role !== 'tv' && player.connected && !$answerCount.waiting.includes(player.id),
        ),
  )
</script>

<TvPanel>
  {#if $answerCount !== null && $answerCount.of > 0}
    <p class="count">
      <strong class="number">{$answerCount.answered} of {$answerCount.of}</strong>
      answered
    </p>
  {/if}
  {#if waiting.length > 0}
    <p class="head">Waiting on</p>
    <ul class="waiting">
      {#each waiting as player (player.id)}
        <li>
          <Pet pet={petOf(player)} size={56} label="" />
          <span class="pet-name">{player.display_name}</span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if answered.length > 0}
    <p class="head">Answered</p>
    <ul class="answered" aria-label="Answered">
      {#each answered as player (player.id)}
        <li>
          <Emoting playerId={player.id}>
            <Pet pet={petOf(player)} size={40} label={player.display_name} />
          </Emoting>
        </li>
      {/each}
    </ul>
  {/if}
</TvPanel>

<style>
  .count {
    margin: 0;
    font-size: 1.1rem;
    line-height: 1.2;
  }

  .number {
    display: block;
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-size: 1.8rem;
  }

  .head {
    margin: 0.9rem 0 0.6rem;
    padding-top: 0.7rem;
    border-top: var(--border-width) solid var(--line);
    font-weight: 700;
    color: var(--muted);
  }

  .waiting {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
    gap: 0.8rem 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .waiting li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  /* Rows far enough apart that an emote's line over one face clears the row above. */
  .answered {
    display: flex;
    flex-wrap: wrap;
    gap: 1.6rem 0.6rem;
    margin: 0;
    padding: 1rem 0 0;
    list-style: none;
  }

  .pet-name {
    max-width: 100%;
    font-weight: 700;
    text-align: center;
    overflow-wrap: anywhere;
  }
</style>
