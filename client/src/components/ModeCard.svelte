<script lang="ts">
  /**
   * One game mode on the create form: its host's chathead, name and hint, and once it
   * is picked, its round's settings on the card itself.
   *
   * A tap anywhere on the card picks it, except on its buttons and the steppers' rows of
   * controls, where a near miss would otherwise drop the round being set. The box in the
   * corner is the same choice for a keyboard and a screen reader. Picked, the box becomes
   * the round's number in the running order, with the arrows that change it beside it,
   * or a plain dot when the order is random and a number would promise something the
   * room will not keep.
   *
   * A mode still being built is the same card, faded, with a lock where its host would
   * stand and nothing to press.
   */
  import type { ModeBounds } from '../lib/api'
  import { hostOf } from '../lib/modes'
  import { npcArt } from '../lib/npcs'
  import type { ModeSettings } from '../lib/protocol'
  import Stepper from './Stepper.svelte'

  const SECONDS_STEP = 5

  let {
    id,
    label,
    hint,
    upcoming = false,
    round = null,
    position = null,
    count = 0,
    shuffled = false,
    questions = null,
    seconds = null,
    onpick,
    onset,
    onmove,
  }: {
    id: string
    label: string
    hint: string | null
    upcoming?: boolean
    /** This mode's round, or null while it is not picked. */
    round?: ModeSettings | null
    /** The round's place in the running order, from 0. */
    position?: number | null
    /** How many rounds are picked, so the last can say it cannot move later. */
    count?: number
    shuffled?: boolean
    questions?: ModeBounds | null
    seconds?: ModeBounds | null
    onpick?: (on: boolean) => void
    onset?: (field: 'questions' | 'seconds', value: number) => void
    onmove?: (by: number) => void
  } = $props()

  const art = $derived(npcArt(hostOf(id).host.id))
  const titleId = $derived(`mode-${id}`)
  /** Numbered, with arrows to renumber it: only among several rounds in the host's order. */
  const ordered = $derived(round !== null && !shuffled && count > 1 && position !== null)

  function pickFromCard(event: MouseEvent): void {
    if (upcoming || !(event.target instanceof Element)) return
    if (event.target.closest('button, label, input, .controls')) return
    onpick?.(round === null)
  }
</script>

<!-- The box in the corner is the card's keyboard and screen reader control; this is
     only a bigger target for a pointer. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<li
  class="card"
  class:on={round !== null}
  class:upcoming
  aria-labelledby={titleId}
  onclick={pickFromCard}
>
  <div class="about">
    <div class="face" aria-hidden="true">
      {#if upcoming}
        <span class="lock">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
      {:else}
        <img class={art.cut} src={art.url} alt="" draggable="false" />
      {/if}
    </div>
    <div class="corner">
      {#if upcoming}
        <span class="tag">Coming soon</span>
      {:else}
        {#if ordered}
          <button
            type="button"
            class="square"
            aria-label="Move {label} earlier"
            disabled={position === 0}
            onclick={() => onmove?.(-1)}>↑</button
          >
          <button
            type="button"
            class="square"
            aria-label="Move {label} later"
            disabled={position === count - 1}
            onclick={() => onmove?.(1)}>↓</button
          >
        {/if}
        <label class="pick">
          <input
            type="checkbox"
            aria-labelledby={titleId}
            aria-describedby={ordered ? `${titleId}-order` : undefined}
            checked={round !== null}
            onchange={(event) => onpick?.(event.currentTarget.checked)}
          />
          <span class="badge" aria-hidden="true">{ordered ? (position ?? 0) + 1 : ''}</span>
        </label>
        {#if ordered}<span class="sr" id="{titleId}-order">Round {(position ?? 0) + 1} of {count}</span>{/if}
      {/if}
    </div>
    <h3 id={titleId}>{label}</h3>
    {#if hint}<p class="note">{hint}</p>{/if}
  </div>
  {#if round !== null}
    <div class="settings">
      {#if questions}
        <Stepper
          label="Questions"
          noun="questions"
          value={round.questions}
          min={questions.min}
          max={questions.max}
          onchange={(value) => onset?.('questions', value)}
        />
      {/if}
      {#if seconds}
        <Stepper
          label="Seconds"
          noun="seconds"
          value={round.seconds}
          min={seconds.min}
          max={seconds.max}
          step={SECONDS_STEP}
          onchange={(value) => onset?.('seconds', value)}
        />
      {/if}
    </div>
  {/if}
</li>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
  }

  /* The picked outline is drawn inside the border, so picking a card never moves the
     grid around it. */
  .card.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .card:not(.upcoming) {
    cursor: pointer;
  }

  .card.upcoming {
    background: transparent;
    border-style: dashed;
    opacity: 0.6;
  }

  /* The host stands at the top left, as on the stage, with the name beside it and the
     hint running on under both. */
  .about {
    flex: 1;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'face corner'
      'face title'
      'hint hint';
    column-gap: 0.75rem;
    padding: calc(0.75rem - var(--border-give)) calc(0.75rem - var(--border-give))
      calc(1rem - var(--border-give)) calc(1rem - var(--border-give));
  }

  /* One box for every host, however tall its chathead, so the names line up across a row. */
  .face {
    grid-area: face;
    align-self: end;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    width: 3.5rem;
    height: 4.25rem;
  }

  .face img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    filter: drop-shadow(0 3px 0 rgb(0 0 0 / 0.25));
  }

  /* A wiki render is the whole NPC, facing left: only its head, cut square and turned
     the way chatheads face. */
  .face .render {
    aspect-ratio: 1;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  .lock {
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 3.5rem;
    border: var(--border-width) dashed var(--line);
    border-radius: 50%;
  }

  .lock svg {
    fill: none;
    stroke: var(--muted);
    stroke-width: 2;
    stroke-linecap: round;
  }

  .corner {
    grid-area: corner;
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-height: 2.75rem;
  }

  /* 36px drawn, 44px to tap. */
  .corner .square {
    position: relative;
  }

  .corner .square::after {
    content: '';
    position: absolute;
    inset: -4px;
  }

  .corner .tag {
    margin-top: 0.25rem;
  }

  h3 {
    grid-area: title;
    align-self: end;
    font-size: 1.1rem;
    line-height: 1.25;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .about .note {
    grid-area: hint;
    margin: 0.5rem 0 0;
  }

  /* A 44px target, drawn as a box, and as the round's badge once ticked. A little apart
     from the arrows, which are one slip away from unticking it. */
  .pick {
    margin-left: 0.35rem;
    width: 2.75rem;
    height: 2.75rem;
    margin-bottom: 0;
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .pick > * {
    grid-area: 1 / 1;
  }

  .pick input {
    appearance: none;
    margin: 0;
    width: 1.75rem;
    height: 1.75rem;
    border: var(--border-width) solid var(--line);
    border-radius: 4px;
    background: var(--panel-raised);
    cursor: pointer;
  }

  .pick input:checked {
    border-color: var(--accent);
    border-radius: 50%;
    background: var(--accent);
  }

  .badge {
    color: var(--accent-ink);
    font-family: var(--font-numeric);
    font-weight: 700;
    font-size: 0.95rem;
    pointer-events: none;
  }

  .settings {
    border-top: 1px solid var(--line);
    padding: 0.75rem calc(1rem - var(--border-give));
    display: grid;
    gap: 0.5rem;
  }

  .square {
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    display: grid;
    place-items: center;
    font-size: 1.1rem;
    line-height: 1;
  }
</style>
