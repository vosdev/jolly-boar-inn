<script lang="ts">
  /**
   * A photo of a place and where it was taken: the suggester's own screenshot, the place's
   * name for the reveal, its box and reach on the map, and what gives it away. The round asks
   * one thing of every photo, so there is no prompt to write.
   *
   * The picture is read here and goes up once, with Save, as a picture pin's does, cut to 16:9
   * first (`lib/photoCrop.ts`): the player sets how much of it to keep and drags or taps the
   * part they want. Before it goes they say it is theirs and that they hid their own character.
   * The operator, editing, says neither and moves the box, never the picture.
   */
  import { onDestroy } from 'svelte'

  import { fractionAt } from '../../lib/picturePins'
  import {
    ACROSS,
    centreOf,
    croppable,
    cropAt,
    cut,
    DOWN,
    LEAST_SCALE,
    type Crop,
  } from '../../lib/photoCrop'

  import type { MapBounds } from '../../lib/map'
  import { DEFAULT_REACH } from '../../lib/mapBox'
  import { boundsOf, type PinTarget } from '../../lib/pins'
  import { PICTURE_TYPES, readPicture, UPLOAD_NAME } from '../../lib/suggestPicture'
  import { placeProblem, questionPreview, type QuestionContent } from '../../lib/suggestions'
  import type { SuggestionFormProps } from './forms'
  import PlaceField from './PlaceField.svelte'

  let {
    id,
    choice,
    content,
    picture = null,
    saveLabel,
    stepQuestion,
    stepDifficulty,
    stepExtras,
    fields,
    nearSave,
    preview,
    onattempt,
    ondraft,
    onprogress,
    onsave,
    oncancel,
  }: SuggestionFormProps = $props()

  const EXPLANATION_MAX = 300

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = (content as Partial<QuestionContent> | undefined)?.payload
  // svelte-ignore state_referenced_locally
  const fresh = content === undefined
  // svelte-ignore state_referenced_locally
  const prompt = choice.prompt?.text ?? ''
  const startPlace = (start?.targets as PinTarget[] | undefined)?.[0]

  // svelte-ignore state_referenced_locally
  let url = $state<string | null>(picture)
  let encoded = $state<string | null>(null)
  let width = $state((start?.width as number | undefined) ?? 0)
  let height = $state((start?.height as number | undefined) ?? 0)
  let pictureError = $state<string | null>(null)
  let reading = $state(false)
  let own = $state(!fresh)
  let hidden = $state(!fresh)
  let name = $state(startPlace?.name ?? '')
  let box = $state<MapBounds | null>(startPlace === undefined ? null : boundsOf(startPlace))
  let reach = $state((start?.reach as number | undefined) ?? DEFAULT_REACH)
  let explanation = $state((start?.explanation as string | undefined) ?? '')
  let attempted = $state(false)
  /** The screenshot as the player picked it, which the photo is cut from. */
  let source = $state<{ url: string; width: number; height: number } | null>(null)
  let scale = $state(1)
  let centre = $state({ x: 0.5, y: 0.5 })
  let dragging = $state(false)
  let cropper = $state<HTMLElement | null>(null)
  const crop: Crop | null = $derived(
    source === null ? null : cropAt(source.width, source.height, scale, centre),
  )

  // Only pictures read or cut here are this form's to let go; the queue owns the one it passes in.
  let owned: string[] = []
  const release = (keep: string[] = []) => {
    owned.filter((one) => !keep.includes(one)).forEach((one) => URL.revokeObjectURL(one))
    owned = owned.filter((one) => keep.includes(one))
  }
  onDestroy(() => release())

  let cuts = 0
  async function recut(): Promise<void> {
    if (source === null || crop === null) return
    const mine = ++cuts
    const made = await cut(source.url, crop)
    if (mine !== cuts) {
      URL.revokeObjectURL(made.url)
      return
    }
    release([source.url])
    owned = [source.url, made.url]
    url = made.url
    encoded = made.encoded
    width = made.width
    height = made.height
  }

  const fractionOf = (event: PointerEvent) =>
    fractionAt(event.clientX, event.clientY, (cropper as HTMLElement).getBoundingClientRect())

  function down(event: PointerEvent): void {
    if (cropper === null) return
    cropper.setPointerCapture(event.pointerId)
    dragging = true
    centre = fractionOf(event)
  }

  function drag(event: PointerEvent): void {
    if (dragging) centre = fractionOf(event)
  }

  function up(): void {
    if (!dragging || source === null || crop === null) return
    dragging = false
    // Where the cut actually stands, so the next zoom starts from it.
    centre = centreOf(crop, source.width, source.height)
    void recut()
  }

  const percent = (part: number, whole: number): string => `${(part / whole) * 100}%`

  async function pick(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
    const file = event.currentTarget.files?.[0]
    if (file === undefined) return
    reading = true
    const read = await readPicture(file)
    reading = false
    if (typeof read === 'string') {
      pictureError = read
      return
    }
    if (!croppable(read.width, read.height)) {
      URL.revokeObjectURL(read.url)
      pictureError = 'That picture is too small for a 16:9 photo.'
      return
    }
    release()
    owned = [read.url]
    source = { url: read.url, width: read.width, height: read.height }
    scale = 1
    centre = { x: 0.5, y: 0.5 }
    pictureError = null
    await recut()
  }

  const pictureMissing = $derived(url === null ? (pictureError ?? 'Add your screenshot.') : null)
  const tickError = $derived(own && hidden ? null : 'Tick both, or the photo cannot be used.')
  const nameError = $derived(placeProblem(name))
  const boxError = $derived(box === null ? 'Tap the map where you took it.' : null)
  const explained = $derived(explanation.trim())
  const explanationError = $derived(
    explained.length > EXPLANATION_MAX ? `At most ${EXPLANATION_MAX} characters.` : null,
  )
  const done = $derived(
    pictureMissing === null && tickError === null && nameError === null && boxError === null,
  )
  const question = $derived<QuestionContent>({
    type: 'map_pin',
    mode: choice.id,
    payload: {
      prompt,
      targets:
        box === null
          ? []
          : [
              {
                name: name.trim(),
                min_x: box.minX,
                max_x: box.maxX,
                min_y: box.minY,
                max_y: box.maxY,
              },
            ],
      ...(reach === DEFAULT_REACH ? {} : { reach }),
      // Overwritten by the server with the stored picture's name and shape.
      screenshot: (start?.screenshot as string | undefined) ?? UPLOAD_NAME,
      width: width || ACROSS * 100,
      height: height || DOWN * 100,
      ...(explained === '' ? {} : { explanation: explained }),
    },
  })

  $effect(() => ondraft(done && explanationError === null ? question : undefined))
  $effect(() =>
    onprogress({
      questionDone: done,
      extrasFilled: explained !== '',
      extrasValid: explanationError === null,
    }),
  )

  function save(): void {
    attempted = true
    if (!onattempt() || !done || explanationError !== null) return
    onsave(question, encoded ?? undefined)
  }
</script>

{#snippet problem(message: string | null, show: boolean)}
  {#if show && message !== null}
    <p class="error">{message}</p>
  {/if}
{/snippet}

{#snippet body()}
  {#if fresh}
    <fieldset class="ticks">
      <legend>Before you upload</legend>
      <label
        ><input type="checkbox" bind:checked={own} /> I took this screenshot myself in Old School RuneScape</label
      >
      <label>
        <input type="checkbox" bind:checked={hidden} /> I hid my own character with
        <code>::renderself</code> in RuneLite
      </label>
      {@render problem(tickError, attempted)}
    </fieldset>
  {/if}
  {#if encoded !== null || picture === null}
    <div class="field">
      <label for="{id}-picture">Your screenshot</label>
      <input
        id="{id}-picture"
        type="file"
        accept={PICTURE_TYPES.join(',')}
        disabled={reading}
        onchange={(event) => void pick(event)}
      />
      <p class="note hint">
        A PNG, JPEG or WebP of up to 5 MB. We strip what else the file says, such as when it was
        taken. Hide your chat and anything private first.
      </p>
      {@render problem(pictureMissing, attempted || pictureError !== null)}
    </div>
  {/if}
  {#if source !== null && crop !== null}
    <p class="note hint">
      Every photo is 16:9. Drag or tap the part to keep, and set how much of the screenshot it
      takes.
    </p>
    <div
      class="cropper"
      style:aspect-ratio="{source.width} / {source.height}"
      bind:this={cropper}
      role="presentation"
      onpointerdown={down}
      onpointermove={drag}
      onpointerup={up}
      onpointercancel={up}
    >
      <img src={source.url} alt="Your screenshot, whole" draggable="false" />
      <span
        class="window"
        style:left={percent(crop.x, source.width)}
        style:top={percent(crop.y, source.height)}
        style:width={percent(crop.width, source.width)}
        style:height={percent(crop.height, source.height)}
      ></span>
    </div>
    <label class="zoom">
      How much to keep
      <input
        type="range"
        min={LEAST_SCALE}
        max="1"
        step="0.05"
        bind:value={scale}
        onchange={() => void recut()}
      />
    </label>
  {/if}
  {#if url !== null}
    <p class="note">The photo players see</p>
    <div class="picture" style:aspect-ratio="{ACROSS} / {DOWN}">
      <img src={url} alt="Your screenshot" />
    </div>
  {/if}
  <div class="field">
    <label for="{id}-place">The place, as the reveal names it</label>
    <input id="{id}-place" type="text" bind:value={name} />
    {@render problem(nameError, attempted)}
  </div>
  <p class="note hint">
    Tap where you stood. Upstairs counts as the ground below it; dungeons and caves are not on the
    map.
  </p>
  <PlaceField
    {box}
    {reach}
    {name}
    onbox={(next) => (box = next)}
    onreach={(next) => (reach = next)}
  />
  {@render problem(boxError, attempted)}
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
  {@render preview(questionPreview(question, url), true)}
</section>

<style>
  .fields,
  .preview {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.75rem;
  }

  .picture {
    width: 100%;
    margin: 0.5rem 0 0.75rem;
    overflow: hidden;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 6px);
  }

  .picture img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .cropper {
    position: relative;
    width: 100%;
    margin: 0.5rem 0;
    overflow: hidden;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 6px);
    cursor: move;
    touch-action: none;
    user-select: none;
  }

  .cropper img {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* The kept part stays bright; the rest dims under the window's wide shadow. */
  .window {
    position: absolute;
    border: 2px solid var(--accent);
    box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.55);
    pointer-events: none;
  }

  .zoom {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .zoom input {
    flex: 1;
  }

  .ticks {
    display: grid;
    gap: 0.5rem;
    margin: 0 0 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .ticks label {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }

  .actions {
    margin-top: 1rem;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
  }
</style>
