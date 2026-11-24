<script lang="ts">
  /**
   * A spot for Minimap Guesser: its name as the wiki spells it, the spot on the map and how the
   * minimap is turned. A tap on the map puts the spot down or moves it, its marker drags, and the
   * arrows move it a tile at a time for the last bit, since the map is rough at that scale. The
   * minimap beside them is the picture players get, drawn from the same tiles.
   */
  import { around, clampTile, SURFACE, type MapBounds, type WorldPoint } from '../../lib/map'
  import {
    minimapTarget,
    MINIMAP_RADIUS,
    type MinimapSpot,
    onSurface,
    wrapAngle,
  } from '../../lib/minimap'
  import { boundsOf, type PinTarget } from '../../lib/pins'
  import { placeProblem, questionPreview, type QuestionContent } from '../../lib/suggestions'
  import Minimap from '../map/Minimap.svelte'
  import MapView, { type MapArea, type MapGrip } from '../map/MapView.svelte'
  import type { SuggestionFormProps } from './forms'

  let {
    id,
    choice,
    content,
    saveLabel,
    stepQuestion,
    stepDifficulty,
    stepExtras,
    fields,
    nearSave,
    preview,
    onattempt,
    onsubject,
    ondraft,
    onprogress,
    onsave,
    oncancel,
  }: SuggestionFormProps = $props()

  const EXPLANATION_MAX = 300
  const SPOT = 'spot'
  /** Tiles round the spot when the map closes in on it: the minimap and a little more. */
  const CLOSE_MARGIN = MINIMAP_RADIUS * 2
  const TURN_STEP = 15

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = (content as Partial<QuestionContent> | undefined)?.payload
  // svelte-ignore state_referenced_locally
  const prompt = choice.prompt?.text ?? ''
  const startTarget = (start?.targets as PinTarget[] | undefined)?.[0]
  const startSpot = start?.minimap as MinimapSpot | undefined
  let name = $state(startTarget?.name ?? '')
  let spot = $state<MinimapSpot | null>(startSpot === undefined ? null : { ...startSpot })
  let explanation = $state((start?.explanation as string | undefined) ?? '')
  let attempted = $state(false)

  const closeOn = (at: WorldPoint): MapBounds => around([at], CLOSE_MARGIN)
  let frame = $state<MapBounds | null>(startSpot === undefined ? null : closeOn(startSpot))

  const nameError = $derived(placeProblem(name))
  const spotError = $derived(
    spot === null
      ? 'Tap the map to put the spot down.'
      : onSurface(spot)
        ? null
        : 'Pick a spot on the surface.',
  )
  const explained = $derived(explanation.trim())
  const explanationError = $derived(
    explained.length > EXPLANATION_MAX ? `At most ${EXPLANATION_MAX} characters.` : null,
  )
  const done = $derived(nameError === null && spotError === null)
  const target = $derived(spot === null ? null : minimapTarget(spot, name.trim()))
  const question = $derived<QuestionContent>({
    type: 'map_pin',
    mode: choice.id,
    payload: {
      prompt,
      targets: target === null ? [] : [target],
      ...(spot === null ? {} : { minimap: { x: spot.x, y: spot.y, angle: spot.angle } }),
      ...(explained === '' ? {} : { explanation: explained }),
    },
  })
  const areas = $derived<MapArea[]>(
    target === null
      ? []
      : [{ box: boundsOf(target), name: name.trim() || 'This spot', round: true }],
  )
  const grips = $derived<MapGrip[]>(
    spot === null ? [] : [{ id: SPOT, at: spot, middle: true, title: 'Drag to move' }],
  )

  $effect(() => ondraft(done && explanationError === null ? question : undefined))
  $effect(() =>
    onprogress({
      questionDone: done,
      extrasFilled: explained !== '',
      extrasValid: explanationError === null,
    }),
  )

  function rename(next: string): void {
    onsubject(name, next)
    name = next
  }

  function place(tile: WorldPoint): void {
    const at = clampTile(tile, SURFACE)
    if (spot === null) frame = closeOn(at)
    spot = { x: at.x, y: at.y, angle: spot?.angle ?? 0 }
  }

  function nudge(east: number, north: number): void {
    if (spot !== null) place({ x: spot.x + east, y: spot.y + north })
  }

  function turn(angle: number): void {
    if (spot !== null) spot = { ...spot, angle: wrapAngle(angle) }
  }

  function save(): void {
    attempted = true
    if (!onattempt() || !done || explanationError !== null) return
    onsave(question)
  }
</script>

{#snippet problem(message: string | null, show: boolean)}
  {#if show && message !== null}
    <p class="error">{message}</p>
  {/if}
{/snippet}

{#snippet body()}
  <div class="field">
    <label for="{id}-spot-name">Place, as the wiki spells it</label>
    <input
      id="{id}-spot-name"
      type="text"
      value={name}
      oninput={(event) => rename(event.currentTarget.value)}
    />
    <p class="note hint">Shown at the reveal.</p>
    {@render problem(nameError, attempted)}
  </div>
  <div class="field">
    <p class="label">Where it is</p>
    <div class="map">
      <MapView {areas} {grips} {frame} onpick={place} ongrip={(_, tile) => place(tile)} />
    </div>
    <p class="note hint">
      {spot === null
        ? 'Find the spot and tap it.'
        : 'Tap or drag to move it; the arrows move it one tile.'}
    </p>
    {@render problem(spotError, attempted)}
  </div>
  {#if spot !== null}
    <div class="tune">
      <div class="seen">
        <Minimap {spot} label="The minimap players will see" />
      </div>
      <div class="controls">
        <div class="pad" role="group" aria-label="Move one tile">
          <button type="button" class="up" aria-label="One tile north" onclick={() => nudge(0, 1)}
            >↑</button
          >
          <button type="button" class="left" aria-label="One tile west" onclick={() => nudge(-1, 0)}
            >←</button
          >
          <button type="button" class="right" aria-label="One tile east" onclick={() => nudge(1, 0)}
            >→</button
          >
          <button
            type="button"
            class="down"
            aria-label="One tile south"
            onclick={() => nudge(0, -1)}>↓</button
          >
        </div>
        <div class="field">
          <label for="{id}-angle">Turned {spot.angle}°</label>
          <input
            id="{id}-angle"
            type="range"
            min="0"
            max="359"
            step="1"
            value={spot.angle}
            oninput={(event) => turn(Number(event.currentTarget.value))}
          />
          <div class="row turns">
            <button
              type="button"
              aria-label="Turn left {TURN_STEP}°"
              onclick={() => turn(spot!.angle - TURN_STEP)}>⟲</button
            >
            <button type="button" disabled={spot.angle === 0} onclick={() => turn(0)}>North</button>
            <button
              type="button"
              aria-label="Turn right {TURN_STEP}°"
              onclick={() => turn(spot!.angle + TURN_STEP)}>⟳</button
            >
          </div>
        </div>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet extras()}
  <div class="field">
    <label for="{id}-explanation">What gives it away, if anything</label>
    <textarea id="{id}-explanation" rows="2" bind:value={explanation}></textarea>
    <p class="note hint">Shown at the reveal.</p>
    {@render problem(explanationError, true)}
  </div>
{/snippet}

<div class="fields">
  <h3 id="{id}-title">{choice.label}</h3>
  {@render stepQuestion(body)}
  {@render stepDifficulty()}
  {@render stepExtras?.(extras)}
  {@render fields(attempted)}
  {@render nearSave()}
  <div class="row actions">
    <button type="button" class="primary" onclick={save}>{saveLabel}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</div>
<section class="preview" aria-label="Preview">
  <p class="note">What players will see</p>
  {@render preview(questionPreview(question), true)}
</section>

<style>
  .fields,
  .preview {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.75rem;
  }

  .label {
    margin: 0 0 0.3rem;
  }

  .map {
    height: min(24rem, 60vh);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    overflow: hidden;
  }

  .hint {
    margin: 0.3rem 0 0;
  }

  .tune {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    margin-top: 0.75rem;
  }

  .seen {
    width: min(10rem, 40vw);
    flex: none;
  }

  .controls {
    flex: 1 1 12rem;
    min-width: 0;
  }

  .pad {
    display: grid;
    grid-template: repeat(3, 2.5rem) / repeat(3, 2.5rem);
    gap: 0.2rem;
    margin-bottom: 0.5rem;
  }

  .pad button {
    min-height: 0;
    padding: 0;
  }

  .up {
    grid-area: 1 / 2;
  }

  .left {
    grid-area: 2 / 1;
  }

  .right {
    grid-area: 2 / 3;
  }

  .down {
    grid-area: 3 / 2;
  }

  input[type='range'] {
    width: 100%;
  }

  .turns {
    gap: 0.4rem;
  }

  .actions {
    margin-top: 1rem;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
  }
</style>
