<script lang="ts">
  /**
   * A team's logo: its god's fetched symbol, or the placeholder drawn here.
   *
   * The placeholder is a shield in the god's colours from `app.css`, the same in every
   * theme. It fills its parent, which sets the size. It is decoration: whatever shows a
   * logo names the team beside it.
   */
  import { logoFile, type TeamId } from '../lib/teams'

  let { team }: { team: TeamId } = $props()

  const file = $derived(logoFile(team))
</script>

{#if file !== null}
  <img class="logo" src={file} alt="" />
{:else}
  <svg
    class="logo"
    data-team={team}
    data-placeholder={team}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      class="shield"
      d="M12 1.6 20.8 4.6v6.4c0 5.5-3.7 9.7-8.8 11.4-5.1-1.7-8.8-5.9-8.8-11.4V4.6z"
    />
    {#if team === 'saradomin'}
      <!-- His four-pointed star. -->
      <path class="mark" d="M12 5.5l1.4 4.6 4.6 1.4-4.6 1.4L12 17.5l-1.4-4.6-4.6-1.4 4.6-1.4z" />
    {:else if team === 'zamorak'}
      <!-- A flame. -->
      <path
        class="mark"
        d="M12 5c1 2.5 4 4 4 7.5a4 4 0 0 1-8 0c0-1.8 1-3 2-4 0 1.4.6 2.3 1.4 2.6C11 9 11.4 7 12 5z"
      />
    {:else if team === 'guthix'}
      <!-- A leaf, for balance in nature. -->
      <path
        class="mark"
        fill-rule="evenodd"
        d="M12 5.5c3.5 2.5 4.5 5.5 4 8.5-.4 2.4-2 3.8-4 4.5-2-.7-3.6-2.1-4-4.5-.5-3 .5-6 4-8.5zM11.6 9.5h.8v7.5h-.8z"
      />
    {:else if team === 'armadyl'}
      <!-- A pair of wings. -->
      <path
        class="mark"
        d="M11.3 8.5C9.2 7.1 7.4 6.6 6 7c.4 3.4 2.3 6.4 5.3 8.4zM12.7 8.5c2.1-1.4 3.9-1.9 5.3-1.5-.4 3.4-2.3 6.4-5.3 8.4z"
      />
    {:else if team === 'bandos'}
      <!-- Horns over a head. -->
      <path
        class="mark"
        d="M6.5 6.5c0 4.5 2.5 7.5 5.5 7.5s5.5-3 5.5-7.5c-1 2.5-3 4-5.5 4s-4.5-1.5-5.5-4zM10.3 14.6h3.4v2.9h-3.4z"
      />
    {:else}
      <!-- A ring, his circle with its centre empty. -->
      <path
        class="mark"
        fill-rule="evenodd"
        d="M7 11.5a5 5 0 1 0 10 0 5 5 0 1 0-10 0zM9.6 11.5a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 1 0-4.8 0z"
      />
    {/if}
  </svg>
{/if}

<style>
  .logo {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .shield {
    fill: var(--team);
    stroke: var(--team-trim);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  .mark {
    fill: var(--team-ink);
  }
</style>
