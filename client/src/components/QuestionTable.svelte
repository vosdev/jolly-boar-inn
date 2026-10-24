<script lang="ts">
  /**
   * The table panel through a question and its reveal (section 9 of ideas/design.md):
   * Answered over Still thinking, then over No answer once it closes. Stacked on a phone
   * it is a strip at the foot, "2 of 9 answered" and the first faces, which opens the
   * panel as a sheet; a new question closes it.
   *
   * In a reveal with its results the panel is the `outcome` instead (section 10), and the
   * strip says "5 of 9 got it right" with the faces of who did.
   */
  import type { Snippet } from 'svelte'

  import { petOf } from '../lib/pets'
  import type { PlayerResult, PlayerView } from '../lib/protocol'
  import { Seating } from '../lib/tableGroups'
  import type { TeamId } from '../lib/teams'
  import Icon from './Icon.svelte'
  import Pet from './Pet.svelte'
  import Sheet from './Sheet.svelte'
  import TablePanel from './TablePanel.svelte'

  let {
    players,
    youId,
    questionId,
    waiting,
    results = null,
    hostOnly = false,
    teams = [],
    stacked = false,
    unanswered = [],
    outcome,
  }: {
    players: PlayerView[]
    youId: string | null
    questionId: string
    /** Who is still to answer, from the live count; null before one arrives. */
    waiting: string[] | null
    /** `question_closed.results`, whose keys are who answered; null while open. */
    results?: Record<string, PlayerResult> | null
    /** Nobody answers this one, so the table is one list. */
    hostOnly?: boolean
    teams?: readonly TeamId[]
    stacked?: boolean
    /** `question_closed.unanswered`, who could have answered and did not. */
    unanswered?: string[]
    /** The reveal's results, which take the panel's place. */
    outcome?: Snippet
  } = $props()

  const FACES = 4

  const isUp = $derived(
    results !== null
      ? (p: PlayerView) => Object.hasOwn(results, p.id)
      : (p: PlayerView) => waiting !== null && !waiting.includes(p.id),
  )
  const seating = new Seating()
  const groups = $derived(seating.seat(players, youId, isUp, questionId, teams))
  const labels = $derived(
    results === null
      ? (['Answered', 'Still thinking'] as const)
      : (['Answered', 'No answer'] as const),
  )
  const single = $derived(hostOnly ? 'At the table' : null)
  const seated = $derived(groups.upper.length + groups.lower.length)
  const faces = $derived(
    [
      ...groups.upper.map((player) => ({ player, dim: false })),
      ...groups.lower.map((player) => ({ player, dim: true })),
    ].slice(0, FACES),
  )
  const revealing = $derived(outcome !== undefined && results !== null)
  const rightIds = $derived(
    results === null ? [] : Object.keys(results).filter((id) => results[id]?.correct === true),
  )
  const everyone = $derived(results === null ? 0 : Object.keys(results).length + unanswered.length)
  const rightFaces = $derived(
    rightIds
      .map((id) => players.find((player) => player.id === id))
      .filter((player) => player !== undefined)
      .slice(0, FACES)
      .map((player) => ({ player, dim: false })),
  )
  const summary = $derived(
    revealing
      ? `${rightIds.length} of ${everyone} got it right`
      : hostOnly
        ? `${seated} at the table`
        : `${groups.upper.length} of ${seated} answered`,
  )
  const title = $derived(revealing ? 'Results' : 'At the table')

  /** The question the sheet was opened on: a new one closes it. */
  let openedOn = $state<string | null>(null)
  const open = $derived(openedOn === questionId)
</script>

{#snippet panel()}
  {#if revealing}
    {@render outcome?.()}
  {:else}
    <TablePanel {groups} {youId} {labels} {single} />
  {/if}
{/snippet}

{#if !stacked}
  {@render panel()}
{:else}
  <button
    type="button"
    class="strip"
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={() => (openedOn = questionId)}
  >
    <span class="faces" aria-hidden="true">
      {#each revealing ? rightFaces : faces as { player, dim } (player.id)}
        <span class="face" class:dim><Pet pet={petOf(player)} size={30} label="" /></span>
      {/each}
    </span>
    <span class="summary">{summary}</span>
    <span class="up"><Icon name="chevron-up" /></span>
  </button>
  {#if open}
    <Sheet label={title} outside onclose={() => (openedOn = null)}>
      <div class="sheet-head">
        <h2>{title}</h2>
        <button type="button" class="glyph" aria-label="Close" onclick={() => (openedOn = null)}>
          <Icon name="close" />
        </button>
      </div>
      {@render panel()}
    </Sheet>
  {/if}
{/if}

<style>
  .strip {
    position: fixed;
    right: 0.75rem;
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
    left: 0.75rem;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 52px;
    padding: 0.35rem 0.75rem;
    background: var(--panel);
    color: var(--ink);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 0.95rem;
    text-align: left;
  }

  .faces {
    display: flex;
  }

  .face {
    display: inline-flex;
    margin-right: -0.4rem;
  }

  .face.dim {
    opacity: 0.4;
    filter: grayscale(0.6);
  }

  .summary {
    flex: 1;
    padding-left: 0.5rem;
  }

  .up {
    display: inline-flex;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .sheet-head h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  /* The sheet is the panel already; the panel inside it draws no second frame. */
  .sheet-head + :global(.table-panel) {
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
  }
</style>
