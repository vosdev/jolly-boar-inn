<script lang="ts">
  /**
   * Ways of answering, a row each: a small drawing of the control and the sentence that
   * says how, every Submit in bold. The lobby's How to play sheet and Home's How to play
   * page both list them.
   *
   * The drawings are pictures, hidden from a screen reader, which the sentence beside
   * each says in full. Their Submit or Lock in is the real button's colour, so it is the
   * thing that is recognised when the real one turns up.
   */
  import type { HowToRow } from '../lib/howToPlay'

  let { rows, columns = false }: { rows: HowToRow[]; columns?: boolean } = $props()
</script>

{#snippet submit(label = 'Submit')}<span class="submit">{label}</span>{/snippet}

<ul class="rows" class:columns>
  {#each rows as row (row.title)}
    <li>
      <div class="drawing {row.drawing}" aria-hidden="true">
        {#if row.drawing === 'tap'}
          <span class="bar sapphire"></span>
          <span class="bar emerald pressed"></span>
          <span class="bar ruby"></span>
        {:else if row.drawing === 'basket'}
          <span class="box held">
            <span class="bar sapphire"></span>
            <span class="bar ruby"></span>
          </span>
          <span class="bar emerald"></span>
          {@render submit()}
        {:else if row.drawing === 'order'}
          <span class="bar ruby">1</span>
          <span class="bar sapphire">2</span>
          <span class="bar emerald">3</span>
          {@render submit()}
        {:else if row.drawing === 'match'}
          <span class="pair"><span class="box">Zulrah</span><span class="bar ruby"></span></span>
          <span class="pair">
            <span class="box">Kraken</span><span class="bar sapphire"></span>
          </span>
          {@render submit()}
        {:else if row.drawing === 'list'}
          <span class="list">
            <span class="option picked">Zulrah</span>
            <span class="option">Zulu</span>
          </span>
          <span class="box">Zul</span>
          {@render submit()}
        {:else if row.drawing === 'pin'}
          <span class="spot"><span class="tack"></span></span>
          {@render submit('Lock in')}
        {:else if row.drawing === 'slider'}
          <span class="value">1.6m</span>
          <span class="rail"><span class="thumb"></span></span>
          {@render submit()}
        {:else}
          <span class="box">{row.drawing === 'number' ? '1.6m' : 'Zulrah'}</span>
          {@render submit()}
        {/if}
      </div>
      <div class="words">
        <h3>{row.title}</h3>
        <p>
          {#each row.text.split(/(Submit|Lock in)/) as part, index (index)}
            {#if part === 'Submit' || part === 'Lock in'}<strong>{part}</strong>{:else}{part}{/if}
          {/each}
        </p>
      </div>
    </li>
  {/each}
</ul>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Two across where a row has the room, for the trail's wide sheet. */
  @media (min-width: 48rem) {
    .rows.columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
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

  /* The basket: two gems dropped in, one left out under it. */
  .box.held {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    height: auto;
    padding: 2px;
    border-style: dashed;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
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

  /* A patch of map with the pin pushed in, its point on the spot. */
  .spot {
    position: relative;
    height: 2.1rem;
    background: color-mix(in srgb, var(--gem-emerald) 35%, var(--panel));
    border: 1px solid var(--line);
    border-radius: 3px;
  }

  .tack {
    position: absolute;
    top: 0.3rem;
    left: 50%;
    width: 0.7rem;
    height: 0.7rem;
    background: var(--gem-ruby);
    border: 1px solid var(--ink);
    border-radius: 50% 50% 50% 0;
    transform: translateX(-50%) rotate(-45deg);
  }

  .value {
    align-self: center;
    font-weight: 700;
  }

  .rail {
    position: relative;
    height: 4px;
    margin: 0.35rem 0.3rem;
    background: var(--bg-muted);
    border: 1px solid var(--line);
    border-radius: 2px;
  }

  .thumb {
    position: absolute;
    top: 50%;
    left: 65%;
    width: 0.7rem;
    height: 0.7rem;
    background: var(--accent);
    border: 2px solid var(--panel);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
</style>
