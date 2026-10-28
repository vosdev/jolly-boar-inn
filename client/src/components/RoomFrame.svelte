<script lang="ts">
  /**
   * A room's frame (section 8 of ideas/design.md, `lib/roomFit.ts`): the stage on the left
   * and the table column on the right, laid out at one size and scaled to the window by
   * `fit`, or stacked when it is null. `final` drops the column and centres the stage, as
   * the final standings and a past game do. What a screen puts at the table lands in
   * `table`, through `AtTable`.
   */
  import type { Snippet } from 'svelte'

  import { PADDING, PLAY, roomShown, type RoomFit } from '../lib/roomFit'

  let {
    fit,
    revealing = false,
    final = false,
    table = $bindable(null),
    children,
  }: {
    fit: RoomFit | null
    revealing?: boolean
    final?: boolean
    table?: HTMLElement | null
    children: Snippet
  } = $props()

  $effect(() => {
    roomShown.set(fit === null ? null : { fit })
  })

  $effect(() => () => roomShown.set(null))

  // The sizes `roomFit` lays the room out with, so the CSS cannot drift from its sums.
  const padding = $derived(fit === null ? null : fit.compact ? PADDING.compact : PADDING.full)
</script>

<div
  class="frame"
  class:fitted={fit !== null}
  class:compact={fit?.compact === true}
  style:--room-scale={fit?.scale ?? null}
  style:--room-width={fit === null ? null : `${fit.width}px`}
  style:--room-height={fit === null ? null : `${fit.height}px`}
  style:--play-gap={fit === null ? null : `${PLAY.gap}px`}
  style:--play-table={fit === null ? null : `${PLAY.table}px`}
  style:--play-column={fit === null ? null : `${PLAY.tableReveal}px`}
  style:--stage-wide={fit === null ? null : `${PLAY.stageWide}px`}
  style:--play-padding={padding === null
    ? null
    : `${padding.top}px ${padding.side}px ${padding.bottom}px`}
>
  <div class="play" class:revealing class:final>
    <div class="stage-side" data-fit-stage>
      <div class="stage-in">
        {@render children()}
      </div>
    </div>
    <div class="table" bind:this={table}></div>
  </div>
</div>

<style>
  /* The window under the bar, holding the room at its own size and scale, centred. */
  .fitted {
    position: relative;
    height: calc(var(--room-height) * var(--room-scale));
    overflow: hidden;
  }

  .fitted .play {
    position: absolute;
    top: 0;
    left: 50%;
    width: var(--room-width);
    height: var(--room-height);
    margin-left: calc(var(--room-width) / -2);
    transform: scale(var(--room-scale));
    transform-origin: top center;
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--play-column);
    gap: var(--play-gap);
    padding: var(--play-padding);
  }

  /* A short window's room: less padding, and a smaller chathead in the dialogue box. */
  .fitted.compact .play {
    --head-size: 72px;
  }

  /* The name's row and two lines, whatever the smaller chathead leaves. */
  .fitted.compact :global(.speaker .speech) {
    min-height: calc(3 * 1.3em + 0.45rem);
  }

  /* The column is always as wide as a reveal needs, so the stage keeps its width; the table
     is narrower until the reveal and fills the column then. */
  .fitted .play:not(.revealing) .table {
    width: var(--play-table);
    justify-self: end;
  }

  /* The final standings have no panel: the stage stands in the middle of the room. */
  .fitted .play.final {
    grid-template-columns: minmax(0, 1fr);
  }

  .fitted .play.final .stage-in {
    width: 100%;
    max-width: var(--stage-wide);
    margin-inline: auto;
  }

  .fitted .play.final .table {
    display: none;
  }

  /* The stage starts at the top of its height and keeps its place from the question to its
     reveal: the answers grow downward, and one taller than the stage scrolls. */
  .fitted .stage-side,
  .fitted .table {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* The stage scrolls, which also clips sideways, so it holds a margin for what overhangs
     the sheet (Zanaris's stone) and gives it back, leaving the stage's own width as it is. */
  .fitted .stage-side {
    padding-inline: 3%;
    margin-inline: -3%;
  }

  .fitted .stage-in {
    margin-block: 0 auto;
  }

  .table {
    display: grid;
    align-content: start;
    gap: 0.75rem;
  }

  /* Room for the table's strip, fixed at the foot, under the last of the stage. */
  .frame:not(.fitted):has(:global(.strip)) {
    padding-bottom: 4.5rem;
  }

  /* Stacked, the table follows the stage in the reading column. */
  .frame:not(.fitted) .table {
    max-width: 30rem;
    margin: 0.75rem auto 0;
  }

  /* The room's transform makes it the containing block of the error popup, which is
     fixed: it is measured from the room's top, just under the bar. */
  .fitted :global(.popup) {
    top: 0.75rem;
  }

  /* On the desktop frame a stage whose host speaks above it takes the column, up to the
     width a question and its answers can use, and its sheet's words grow to suit. */
  .fitted :global(.stage.speaks) {
    max-width: var(--stage-wide);
  }

  .fitted :global(.stage.speaks .stage-row) {
    --scroll-text: 1.5;
    --scroll-scale: 1.25;
  }
</style>
