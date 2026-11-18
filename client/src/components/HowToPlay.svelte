<script lang="ts">
  /**
   * How to play, as a sheet: a row per way of answering (`AnswerRows`), the scoring in one
   * line, and how teams score. From the lobby it shows only what the room plays
   * (`lib/howToPlay.ts`), and a team room's scoring is the teams'; with no room, everything.
   */
  import { onMount } from 'svelte'

  import type { ModePacing } from '../lib/api'
  import {
    ITEMS_LINE,
    SCORING_LINE,
    TEAMS_PARAGRAPH,
    allTypes,
    loadModes,
    roomTypes,
    rowsFor,
    showsItems,
    showsTeams,
    type HowToRow,
  } from '../lib/howToPlay'
  import type { RoomSettings } from '../lib/protocol'
  import AnswerRows from './AnswerRows.svelte'
  import Sheet from './Sheet.svelte'

  let {
    room = null,
    onclose,
  }: {
    /** The lobby's room, to show only its types; null shows every type. */
    room?: { settings: RoomSettings; total: number } | null
    onclose: () => void
  } = $props()

  const id = $props.id()
  let modes = $state<ModePacing[] | null>(null)

  onMount(() => {
    loadModes().then(
      (loaded) => (modes = loaded),
      () => (modes = []),
    )
  })

  const rows = $derived<HowToRow[]>(
    modes === null
      ? []
      : rowsFor(room === null ? allTypes(modes) : roomTypes(room.settings, room.total, modes)),
  )
</script>

<Sheet labelledby="{id}-title" {onclose}>
  <h2 id="{id}-title">How to play</h2>
  {#if modes === null}
    <p class="note">Loading…</p>
  {:else}
    <AnswerRows {rows} />
    {#if showsItems(room?.settings ?? null)}
      <p class="items">{ITEMS_LINE}</p>
    {/if}
    {#if room === null || !showsTeams(room.settings)}
      <p class="scoring">{SCORING_LINE}</p>
    {/if}
    {#if showsTeams(room?.settings ?? null)}
      <p class="teams"><strong>Teams.</strong> {TEAMS_PARAGRAPH}</p>
    {/if}
  {/if}
  <button type="button" class="primary done" onclick={onclose}>Got it</button>
</Sheet>

<style>
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }

  .note {
    margin: 0;
  }

  .items {
    margin: 1rem 0 0;
  }

  .scoring {
    margin: 1rem 0 0;
    font-weight: 700;
  }

  .teams {
    margin: 0.75rem 0 0;
  }

  .done {
    width: 100%;
    margin-top: 1rem;
  }
</style>
