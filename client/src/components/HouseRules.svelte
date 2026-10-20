<script lang="ts">
  /**
   * Everything about a room that is not its rounds or its random events, as a row each
   * with its current value: Pace, Who can join, and Fine print for the rest. One row is
   * open at a time, so the panel never grows longer than one choice.
   *
   * Closed rows keep their controls in the page, hidden, so a value set in one is still
   * there when another opens.
   */
  import type { RoomAccess } from '../lib/api'
  import { PACES } from '../lib/pace'
  import type { Pace } from '../lib/protocol'
  import Segmented from './Segmented.svelte'
  import Stepper from './Stepper.svelte'

  const OFF_ON = [
    { value: false, label: 'Off' },
    { value: true, label: 'On' },
  ]

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

  /** What a room gets unless the host changes it; Fine print counts the differences. */
  const STANDARD = {
    standingsSeconds: 10,
    hideRounds: false,
    closeWhenAllAnswered: true,
    nameWrongAnswers: true,
  }

  let {
    pace = $bindable(),
    access = $bindable(),
    standingsSeconds = $bindable(),
    hideRounds = $bindable(),
    closeWhenAllAnswered = $bindable(),
    nameWrongAnswers = $bindable(),
    surprise,
  }: {
    pace: Pace
    access: RoomAccess
    standingsSeconds: number
    hideRounds: boolean
    closeWhenAllAnswered: boolean
    nameWrongAnswers: boolean
    /** A surprise room hides its rounds anyway, so it has no switch for that. */
    surprise: boolean
  } = $props()

  let open = $state<'pace' | 'access' | 'fine' | null>(null)
  const id = $props.id()

  const changed = $derived(
    [
      standingsSeconds !== STANDARD.standingsSeconds,
      !surprise && hideRounds !== STANDARD.hideRounds,
      closeWhenAllAnswered !== STANDARD.closeWhenAllAnswered,
      nameWrongAnswers !== STANDARD.nameWrongAnswers,
    ].filter(Boolean).length,
  )

  function toggle(row: 'pace' | 'access' | 'fine'): void {
    open = open === row ? null : row
  }
</script>

{#snippet head(row: 'pace' | 'access' | 'fine', label: string, value: string)}
  <button
    type="button"
    class="rule"
    aria-expanded={open === row}
    aria-controls="{id}-{row}"
    onclick={() => toggle(row)}
  >
    <span class="label">{label}</span>
    <span class="value">{value}</span>
    <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  </button>
{/snippet}

<section class="panel rules" aria-labelledby="{id}-title">
  <h2 id="{id}-title">House rules</h2>

  {@render head('pace', 'Pace', PACES.find((option) => option.value === pace)?.label ?? pace)}
  <div class="open" id="{id}-pace" hidden={open !== 'pace'}>
    <Segmented legend="Pace" hideLegend options={PACES} bind:value={pace} />
    <p class="note">{PACES.find((option) => option.value === pace)?.note}</p>
  </div>

  {@render head(
    'access',
    'Who can join',
    ACCESS.find((option) => option.value === access)?.label ?? access,
  )}
  <div class="open" id="{id}-access" hidden={open !== 'access'}>
    <Segmented legend="Access" hideLegend options={ACCESS} bind:value={access} />
    <p class="note">{ACCESS.find((option) => option.value === access)?.note}</p>
  </div>

  {@render head('fine', 'Fine print', changed === 0 ? 'Standard' : `${changed} changed`)}
  <div class="open fine" id="{id}-fine" hidden={open !== 'fine'}>
    <Stepper
      label="Standings between rounds, seconds"
      noun="standings seconds"
      value={standingsSeconds}
      min={0}
      max={30}
      step={5}
      onchange={(value) => (standingsSeconds = value)}
    />
    {#if !surprise}
      <div>
        <Segmented legend="Surprise rounds" options={OFF_ON} bind:value={hideRounds} />
        <p class="note">Hide the game modes in the lobby from the players</p>
      </div>
    {/if}
    <Segmented
      legend="Close when everyone has answered"
      options={OFF_ON}
      bind:value={closeWhenAllAnswered}
    />
    <Segmented legend="Name who got it wrong" options={OFF_ON} bind:value={nameWrongAnswers} />
  </div>
</section>

<style>
  .rules {
    padding-bottom: calc(0.5rem - var(--border-give));
  }

  h2 {
    margin-bottom: 0.25rem;
  }

  .rule {
    width: 100%;
    min-height: 3rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0 0.15rem;
    background: transparent;
    border: none;
    border-top: 1px solid var(--line);
    border-radius: 0;
    text-align: left;
  }

  h2 + .rule {
    border-top: none;
  }

  .rule:hover:not(:disabled) {
    border-color: var(--line);
  }

  .label {
    flex: 1;
    font-weight: 600;
  }

  .value {
    color: var(--muted);
    font-size: 0.95rem;
  }

  .chevron {
    flex: none;
    fill: none;
    stroke: var(--muted);
    stroke-width: 2.4;
    stroke-linecap: round;
    transition: transform 0.15s;
  }

  [aria-expanded='true'] .chevron {
    transform: rotate(90deg);
  }

  .open {
    padding: 0 0.15rem 0.9rem;
  }

  .open .note {
    margin: 0.35rem 0 0;
  }

  .fine {
    display: grid;
    gap: 0.75rem;
  }

  .fine .note {
    margin-top: 0.3rem;
  }

  .open[hidden] {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }
</style>
