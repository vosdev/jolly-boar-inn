<script lang="ts">
  /**
   * One game mode on the Rounds tab: its host's chathead, name and hint, and a box
   * in the corner that a tick fills. Picking is all a card does; how long its round is and
   * where it plays are set on the Rules step, so picking never grows a card or moves the
   * grid under the host's finger.
   *
   * A tap anywhere on the card picks it. The box is the same choice for a keyboard and a
   * screen reader.
   */
  import { hostOf } from '../lib/modes'
  import { npcArt } from '../lib/npcs'

  let {
    id,
    label,
    hint,
    picked,
    onpick,
  }: {
    id: string
    label: string
    hint: string | null
    picked: boolean
    onpick: (on: boolean) => void
  } = $props()

  const art = $derived(npcArt(hostOf(id).host.id))
  const titleId = $derived(`mode-${id}`)

  function pickFromCard(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('label')) return
    onpick(!picked)
  }
</script>

<!-- The box is the card's keyboard and screen reader control; this is only a bigger
     target for a pointer. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<li class="card" class:on={picked} aria-labelledby={titleId} onclick={pickFromCard}>
  <div class="body">
    <div class="face" aria-hidden="true">
      <img class={art.cut} src={art.url} alt="" draggable="false" />
    </div>
    <h3 id={titleId}>{label}</h3>
    {#if hint}<p class="note">{hint}</p>{/if}
  </div>
  <label class="pick">
    <input
      type="checkbox"
      aria-labelledby={titleId}
      checked={picked}
      onchange={(event) => onpick(event.currentTarget.checked)}
    />
    <span class="tick" aria-hidden="true">✓</span>
  </label>
</li>

<style>
  .card {
    position: relative;
    container-type: inline-size;
    padding: calc(0.65rem - var(--border-give));
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    cursor: pointer;
  }

  /* A narrow card stacks its name under the face; a wider one stands them side by side. */
  .body {
    display: grid;
    gap: 0.35rem;
  }

  @container (min-width: 12rem) {
    .body {
      grid-template-columns: 2.75rem 1fr;
      grid-template-rows: auto 1fr;
      column-gap: 0.6rem;
      align-items: end;
    }

    h3 {
      padding-right: 1.6rem;
    }
  }

  /* Drawn inside the border, so picking a card never moves the grid around it. */
  .card.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .face {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    width: 2.75rem;
    height: 3rem;
  }

  /* A box of its own rather than percentage maximums: iOS WebKit sometimes laid a chathead
     out at its natural size, past the card. */
  .face img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: bottom;
    filter: drop-shadow(0 2px 0 rgb(0 0 0 / 0.25));
  }

  /* A wiki render is the whole NPC, facing left: only its head, cut square and turned
     the way chatheads face. */
  .face .render {
    height: auto;
    aspect-ratio: 1;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  h3 {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.2;
    overflow-wrap: break-word;
  }

  .note {
    grid-column: 1 / -1;
    align-self: start;
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.3;
  }

  /* A 44px target in the corner, drawn as a box that a tick fills. */
  .pick {
    position: absolute;
    top: 0;
    right: 0;
    width: 2.75rem;
    height: 2.75rem;
    margin: 0;
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
    width: 1.4rem;
    height: 1.4rem;
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

  .pick input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .tick {
    color: var(--accent-ink);
    font-weight: 800;
    font-size: 0.8rem;
    pointer-events: none;
    visibility: hidden;
  }

  .pick input:checked + .tick {
    visibility: visible;
  }
</style>
