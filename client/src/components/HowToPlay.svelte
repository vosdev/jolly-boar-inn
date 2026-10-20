<script lang="ts">
  /**
   * How to play, as a sheet: a row per way of answering, each with a small drawing of its
   * control, and the scoring in one line. From the lobby it shows only what the room
   * plays (`lib/howToPlay.ts`); from Home, everything.
   *
   * The drawings are pictures, hidden from a screen reader, which the sentence beside
   * each says in full. Their Submit is the real button's colour, so it is the thing that
   * is recognised when the real one turns up.
   */
  import { onMount } from 'svelte'

  import type { ModePacing } from '../lib/api'
  import {
    SCORING_LINE,
    allTypes,
    loadModes,
    roomTypes,
    rowsFor,
    type HowToRow,
  } from '../lib/howToPlay'
  import type { RoomSettings } from '../lib/protocol'
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

{#snippet submit()}<span class="submit">Submit</span>{/snippet}

<Sheet labelledby="{id}-title" {onclose}>
  <h2 id="{id}-title">How to play</h2>
  {#if modes === null}
    <p class="note">Loading…</p>
  {:else}
    <ul class="rows">
      {#each rows as row (row.title)}
        <li>
          <div class="drawing {row.drawing}" aria-hidden="true">
            {#if row.drawing === 'tap'}
              <span class="bar sapphire"></span>
              <span class="bar emerald pressed"></span>
              <span class="bar ruby"></span>
            {:else if row.drawing === 'ticks'}
              <span class="bar sapphire ticked">✓</span>
              <span class="bar emerald"></span>
              <span class="bar ruby ticked">✓</span>
              {@render submit()}
            {:else if row.drawing === 'order'}
              <span class="bar ruby">1</span>
              <span class="bar sapphire">2</span>
              <span class="bar emerald">3</span>
              {@render submit()}
            {:else if row.drawing === 'list'}
              <span class="list">
                <span class="option picked">Zulrah</span>
                <span class="option">Zulu</span>
              </span>
              <span class="box">Zul</span>
              {@render submit()}
            {:else}
              <span class="box">{row.drawing === 'number' ? '1.6m' : 'Zulrah'}</span>
              {@render submit()}
            {/if}
          </div>
          <div class="words">
            <h3>{row.title}</h3>
            <p>
              {#each row.text.split(/(Submit)/) as part, index (index)}
                {#if part === 'Submit'}<strong>Submit</strong>{:else}{part}{/if}
              {/each}
            </p>
          </div>
        </li>
      {/each}
    </ul>
    <p class="scoring">{SCORING_LINE}</p>
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

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .words p {
    margin: 0.15rem 0 0;
  }

  .drawing {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 5.5rem;
    padding: 0.4rem;
    font-size: 0.65rem;
    line-height: 1;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
  }

  .bar,
  .box,
  .submit,
  .option {
    display: flex;
    align-items: center;
    height: 1rem;
    padding: 0 0.3rem;
    border-radius: 3px;
  }

  .bar {
    color: var(--gem-ink);
    font-weight: 700;
  }

  .sapphire {
    background: var(--gem-sapphire);
  }

  .emerald {
    background: var(--gem-emerald);
  }

  .ruby {
    background: var(--gem-ruby);
  }

  .pressed {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }

  .box {
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
  }

  .submit {
    justify-content: center;
    color: var(--accent-ink);
    background: var(--accent);
    font-weight: 700;
  }

  .list {
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 3px;
  }

  .option {
    color: var(--ink);
  }

  .option.picked {
    background: color-mix(in srgb, var(--accent) 20%, var(--panel));
  }

  .scoring {
    margin: 1rem 0 0;
    font-weight: 700;
  }

  .done {
    width: 100%;
    margin-top: 1rem;
  }
</style>
