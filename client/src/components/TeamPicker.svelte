<script lang="ts">
  /**
   * Whether a room with its doors shut is a team game, and which gods are its teams. Free for
   * all sends no gods; Teams sends the ticked ones in `TEAMS` order, whatever order they were ticked in, since
   * every list of teams takes that order. The ticks survive the switch going off and on.
   * Too few ticked is said on the room panel, whose button it blocks.
   */
  import { TEAMS, type TeamId } from '../lib/teams'
  import Segmented from './Segmented.svelte'
  import TeamLogo from './TeamLogo.svelte'

  const MODES = [
    { value: false, label: 'Free for all' },
    { value: true, label: 'Teams' },
  ]

  let {
    on = $bindable(),
    picked = $bindable(),
  }: {
    on: boolean
    /** The ticked gods, in `TEAMS` order. */
    picked: TeamId[]
  } = $props()

  function tick(god: TeamId, ticked: boolean): void {
    picked = TEAMS.map((t) => t.id).filter((t) => (t === god ? ticked : picked.includes(t)))
  }
</script>

<div class="teams">
  <Segmented legend="How to play" hideLegend options={MODES} bind:value={on} />
  {#if on}
    <p class="note">
      Everyone picks a god. Speed doesn't count: each team scores its members' average.
    </p>
    <fieldset class="gods">
      <legend>Gods</legend>
      {#each TEAMS as god (god.id)}
        <label class="god" data-team={god.id}>
          <input
            type="checkbox"
            checked={picked.includes(god.id)}
            onchange={(event) => tick(god.id, event.currentTarget.checked)}
          />
          <span class="logo"><TeamLogo team={god.id} /></span>
          <span class="name">{god.name}</span>
        </label>
      {/each}
    </fieldset>
  {/if}
</div>

<style>
  .note {
    margin: 0.5rem 0 0;
  }

  .gods {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0.75rem 0 0;
    padding: 0;
    border: none;
  }

  legend {
    grid-column: 1 / -1;
    padding: 0;
    margin-bottom: 0.1rem;
    font-weight: 600;
  }

  .god {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0 0.45rem;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    background: var(--panel-raised);
    font-weight: 600;
    cursor: pointer;
  }

  .god:has(input:checked) {
    border-color: var(--team-trim);
    box-shadow: inset 0 0 0 1px var(--team-trim);
  }

  .god:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .god input {
    margin: 0;
    flex: none;
    accent-color: var(--team);
  }

  .logo {
    flex: none;
    display: block;
    width: 1.4rem;
    height: 1.4rem;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
