<script lang="ts">
  /**
   * A spot on the suggester's own screenshot: the picture, what players are asked, and the
   * answer, either a box dragged on the picture with whether near misses score, or cells of
   * a grid. The picture is read here and goes up once, with Save; the operator, editing,
   * draws the stored one and moves the target, never the picture.
   */
  import { onDestroy } from 'svelte'

  import { fractionAt } from '../../lib/picturePins'
  import type { WireBounds } from '../../lib/pins'
  import {
    boxBetween,
    boxProblem,
    cellsProblem,
    GRID_MAX,
    gridSide,
    NEAR_REACH,
    PICTURE_TYPES,
    readPicture,
    toggleCell,
    UPLOAD_NAME,
    type Cell,
  } from '../../lib/suggestPicture'
  import { questionPreview, type QuestionContent } from '../../lib/suggestions'
  import Segmented from '../Segmented.svelte'
  import type { SuggestionFormProps } from './forms'

  let {
    id,
    choice,
    content,
    picture = null,
    saveLabel,
    stepQuestion,
    stepDifficulty,
    fields,
    nearSave,
    preview,
    onattempt,
    ondraft,
    onprogress,
    onsave,
    oncancel,
  }: SuggestionFormProps = $props()

  const HOW = [
    { value: 'box' as const, label: 'Tap a spot' },
    { value: 'grid' as const, label: 'Pick a cell' },
  ]
  const NEAR = [
    { value: 'near' as const, label: 'Score some points' },
    { value: 'exact' as const, label: 'Score nothing' },
  ]

  // The form starts from what it was opened on and owns its fields from then on.
  // svelte-ignore state_referenced_locally
  const start = (content as Partial<QuestionContent> | undefined)?.payload
  // svelte-ignore state_referenced_locally
  const startPrompt = (start?.prompt as string | undefined) ?? choice.prompt?.text ?? ''
  const startGrid = start?.grid as { cols: number; rows: number } | undefined

  // svelte-ignore state_referenced_locally
  let url = $state<string | null>(picture)
  let encoded = $state<string | null>(null)
  let width = $state((start?.width as number | undefined) ?? 0)
  let height = $state((start?.height as number | undefined) ?? 0)
  let pictureError = $state<string | null>(null)
  let reading = $state(false)
  let prompt = $state(startPrompt)
  let how = $state<'box' | 'grid'>(startGrid === undefined ? 'box' : 'grid')
  let box = $state<WireBounds | null>((start?.target as WireBounds | undefined) ?? null)
  let near = $state<'near' | 'exact'>(start?.reach === 0 ? 'exact' : 'near')
  // An operator may have set another reach by hand; it stands until they pick again.
  const startReach = (start?.reach as number | undefined) ?? NEAR_REACH
  const reach = $derived(near === 'exact' ? 0 : startReach === 0 ? NEAR_REACH : startReach)
  let cols = $state(startGrid?.cols ?? 4)
  let rows = $state(startGrid?.rows ?? 4)
  let cells = $state<Cell[]>((start?.cells as Cell[] | undefined) ?? [])
  let attempted = $state(false)
  let frame = $state<HTMLElement | null>(null)
  let anchor = $state<{ x: number; y: number } | null>(null)

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
    box = null
    cells = []
  }

  const at = (event: PointerEvent) =>
    fractionAt(event.clientX, event.clientY, (frame as HTMLElement).getBoundingClientRect())

  function down(event: PointerEvent): void {
    if (frame === null || how !== 'box') return
    frame.setPointerCapture(event.pointerId)
    anchor = at(event)
    box = boxBetween(anchor, anchor)
  }

  function drag(event: PointerEvent): void {
    if (anchor !== null) box = boxBetween(anchor, at(event))
  }

  function up(event: PointerEvent): void {
    if (anchor === null) return
    box = boxBetween(anchor, at(event))
    anchor = null
  }

  const pictureMissing = $derived(url === null ? (pictureError ?? 'Add your screenshot.') : null)
  const promptText = $derived(prompt.trim())
  const promptError = $derived(
    promptText === ''
      ? 'Required: what players are asked.'
      : promptText.length > 300
        ? 'At most 300 characters.'
        : null,
  )
  const answerError = $derived(
    url === null
      ? null
      : how === 'box'
        ? boxProblem(box, width, height)
        : cellsProblem(cells, cols, rows),
  )
  const done = $derived(pictureMissing === null && promptError === null && answerError === null)
  const onGrid = $derived(cells.filter((cell) => cell.col < cols && cell.row < rows))
  const question = $derived<QuestionContent>({
    type: 'picture_pin',
    mode: choice.id,
    payload: {
      prompt: promptText,
      // Overwritten by the server with the stored picture's name and shape.
      screenshot: (start?.screenshot as string | undefined) ?? UPLOAD_NAME,
      width: Math.max(1, width),
      height: Math.max(1, height),
      ...(how === 'box'
        ? { target: box ?? { min_x: 0, max_x: 0, min_y: 0, max_y: 0 }, reach }
        : { grid: { cols, rows }, cells: onGrid }),
    },
  })

  $effect(() => ondraft(done ? question : undefined))
  $effect(() => onprogress({ questionDone: done, extrasFilled: false, extrasValid: true }))

  function save(): void {
    attempted = true
    if (!onattempt() || !done) return
    onsave(question, encoded ?? undefined)
  }

  const percent = (fraction: number): string => `${fraction * 100}%`
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
        A PNG, JPEG or WebP of up to 5 MB that you took in game. We strip what else the file says,
        such as when it was taken.
      </p>
      {@render problem(pictureMissing, attempted || pictureError !== null)}
    </div>
  {/if}
  <div class="field">
    <label for="{id}-prompt">What players are asked</label>
    <input id="{id}-prompt" type="text" maxlength="300" bind:value={prompt} />
    {@render problem(promptError, attempted)}
  </div>
  {#if url !== null}
    <Segmented legend="How players answer" options={HOW} bind:value={how} />
    {#if how === 'grid'}
      <div class="row sides">
        <div class="field">
          <label for="{id}-cols">Columns</label>
          <input
            id="{id}-cols"
            type="number"
            min="1"
            max={GRID_MAX}
            value={cols}
            oninput={(event) => (cols = gridSide(event.currentTarget.valueAsNumber))}
          />
        </div>
        <div class="field">
          <label for="{id}-rows">Rows</label>
          <input
            id="{id}-rows"
            type="number"
            min="1"
            max={GRID_MAX}
            value={rows}
            oninput={(event) => (rows = gridSide(event.currentTarget.valueAsNumber))}
          />
        </div>
      </div>
    {/if}
    <p class="note hint">
      {how === 'box'
        ? 'Drag across the picture to mark the spot players should tap.'
        : 'Tap the cells players should pick.'}
    </p>
    <div
      class={['picture', how === 'box' && 'drawing']}
      style:aspect-ratio="{Math.max(1, width)} / {Math.max(1, height)}"
      bind:this={frame}
      role="presentation"
      onpointerdown={down}
      onpointermove={drag}
      onpointerup={up}
      onpointercancel={() => (anchor = null)}
    >
      <img src={url} alt="Your screenshot" draggable="false" />
      {#if how === 'box' && box !== null}
        <span
          class="box"
          style:left={percent(box.min_x)}
          style:top={percent(box.min_y)}
          style:width={percent(box.max_x - box.min_x)}
          style:height={percent(box.max_y - box.min_y)}
        ></span>
      {:else if how === 'grid'}
        <div
          class="grid"
          style:grid-template-columns="repeat({cols}, 1fr)"
          style:grid-template-rows="repeat({rows}, 1fr)"
        >
          {#each { length: rows } as _, row (row)}
            {#each { length: cols } as _, col (col)}
              {@const on = onGrid.some((cell) => cell.col === col && cell.row === row)}
              <button
                type="button"
                class={['cell', on && 'on']}
                aria-pressed={on}
                aria-label="Column {col + 1}, row {row + 1}"
                onclick={() => (cells = toggleCell(cells, { col, row }))}
              ></button>
            {/each}
          {/each}
        </div>
      {/if}
    </div>
    {@render problem(answerError, attempted)}
    {#if how === 'box'}
      <Segmented legend="Near misses" options={NEAR} bind:value={near} />
    {/if}
  {/if}
{/snippet}

<div class="fields">
  <h3 id="{id}-title">{choice.label}</h3>
  {@render stepQuestion(body)}
  {@render stepDifficulty()}
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

  .actions {
    margin-top: 1rem;
  }

  .preview > .note {
    margin: 0 0 0.5rem;
  }

  .hint {
    margin: 0.3rem 0 0;
  }

  .sides {
    gap: 0.75rem;
  }

  .sides input {
    width: 5rem;
  }

  .picture {
    position: relative;
    width: 100%;
    margin-top: 0.5rem;
    overflow: hidden;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 6px);
    user-select: none;
  }

  .picture.drawing {
    cursor: crosshair;
    touch-action: none;
  }

  .picture img {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .box {
    position: absolute;
    border: 2px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    pointer-events: none;
  }

  .grid {
    position: absolute;
    inset: 0;
    display: grid;
  }

  .cell {
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--text) 45%, transparent);
    border-radius: 0;
    background: transparent;
  }

  .cell.on {
    background: color-mix(in srgb, var(--accent) 40%, transparent);
    border-color: var(--accent);
  }
</style>
