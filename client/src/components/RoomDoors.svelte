<script lang="ts">
  /**
   * The room panel of a lobby with its doors shut: who can join, whether its rounds are a
   * surprise, and Open the doors. All of it is settled by opening, since rounds already
   * shown cannot be hidden again, so the panel goes with the doors.
   */
  import type { RoomAccess } from '../lib/api'
  import Segmented from './Segmented.svelte'
  import Switch from './Switch.svelte'

  const ACCESS: { value: RoomAccess; label: string; note: string }[] = [
    { value: 'code', label: 'Room code', note: 'Anyone you give the room code to can join.' },
    {
      value: 'link',
      label: 'Invite link',
      note: "The room code alone won't let anyone in; they need the link, or be manually approved by you.",
    },
    {
      value: 'public',
      label: 'Public',
      note: "Listed on this site's homepage, where anyone can join it.",
    },
  ]

  let {
    access = $bindable(),
    hideRounds = $bindable(),
    busy,
    blocked,
    failure,
    onopen,
  }: {
    access: RoomAccess
    hideRounds: boolean
    busy: boolean
    /** What stops the doors opening, in words, or null when nothing does. */
    blocked: string | null
    failure: string | null
    onopen: () => void
  } = $props()

  const id = $props.id()
</script>

<section class="panel doors" aria-labelledby="{id}-title">
  <h2 id="{id}-title">Your room</h2>
  <Segmented legend="Who can join" hideLegend options={ACCESS} bind:value={access} />
  <p class="note">{ACCESS.find((option) => option.value === access)?.note}</p>
  <Switch label="Surprise rounds" checked={hideRounds} onclick={() => (hideRounds = !hideRounds)} />
  <p class="note">Hide the game modes in the lobby from the players.</p>
  {#if blocked !== null}
    <p class="note">{blocked}</p>
  {/if}
  <button type="button" class="primary open" disabled={busy || blocked !== null} onclick={onopen}>
    {busy ? 'Opening…' : 'Open the doors'}
  </button>
  {#if failure !== null}
    <p class="banner bad">{failure}</p>
  {/if}
  <p class="note">These stay as they are once the doors are open. Rooms keep for 72 hours.</p>
</section>

<style>
  .doors {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
  }

  .doors :global(.segments) {
    flex: 1;
    flex-wrap: nowrap;
  }

  .doors :global(.segments label) {
    flex: 1;
    padding-inline: 0.3rem;
    text-align: center;
  }

  .open {
    min-height: 3rem;
    font-size: 1rem;
  }

  .banner {
    margin: 0;
  }
</style>
