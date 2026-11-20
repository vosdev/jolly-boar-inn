<script lang="ts">
  /**
   * A photo of a place and where it was taken: the suggester's own screenshot, the place's
   * name for the reveal, its box and reach on the map, and what gives it away. The round asks
   * one thing of every photo, so there is no prompt to write.
   *
   * The picture is read here and goes up once, with Save, as a picture pin's does. Before it
   * goes the player says it is theirs and that they hid their own character: the operator,
   * editing, says neither and moves the box, never the picture.
   */
  import { onDestroy } from 'svelte'

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

  // Only a picture read here is this form's to let go; the queue owns the one it passes in.
  let owned: string | null = null
  onDestroy(() => {
    if (owned !== null) URL.revokeObjectURL(owned)
  })

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
    if (owned !== null) URL.revokeObjectURL(owned)
    owned = read.url
    url = read.url
    encoded = read.encoded
    width = read.width
    height = read.height
    pictureError = null
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
      width: Math.max(1, width),
      height: Math.max(1, height),
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
  {#if url !== null}
    <div class="picture" style:aspect-ratio="{Math.max(1, width)} / {Math.max(1, height)}">
      <img src={url} alt="Your screenshot" />
    </div>
  {/if}
  {#if fresh}
    <fieldset class="ticks">
      <legend>Before you send it</legend>
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
