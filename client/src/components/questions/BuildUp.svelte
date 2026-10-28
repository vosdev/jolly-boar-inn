<script lang="ts">
  /**
   * Pixel Hunt's picture building up: `lib/pixelHunt.ts`'s frame on a canvas over the image,
   * which `QuestionPicture` holds invisible so the canvas is exactly its size.
   *
   * It draws every animation frame on the server's clock, so a phone that slept wakes on the
   * right frame, and stops once the picture is whole. Without the image's pixels yet, or a
   * 2D context, it draws nothing: the box is the picture's, so nothing moves when it starts.
   */
  import { get } from 'svelte/store'

  import {
    drawFrame,
    progress,
    revealFor,
    type Build,
    type Look,
    type Picture,
  } from '../../lib/pixelHunt'
  import { serverOffsetMs } from '../../lib/stores'

  let {
    image,
    room,
    questionId,
    index,
    answerableAt,
    endsAt,
  }: Build & { image: HTMLImageElement | null } = $props()

  let canvas = $state<HTMLCanvasElement | null>(null)
  let loaded = $state(false)

  $effect(() => {
    const img = image
    if (img === null) return
    const done = (): void => {
      loaded = img.complete && img.naturalWidth > 0
    }
    done()
    img.addEventListener('load', done)
    return () => img.removeEventListener('load', done)
  })

  function pixels(img: HTMLImageElement): Picture | null {
    const scratch = document.createElement('canvas')
    scratch.width = img.naturalWidth
    scratch.height = img.naturalHeight
    const pen = scratch.getContext('2d', { willReadFrequently: true })
    if (pen === null) return null
    pen.drawImage(img, 0, 0)
    const { data } = pen.getImageData(0, 0, scratch.width, scratch.height)
    return { width: scratch.width, height: scratch.height, data, image: img }
  }

  /** The theme's colours where the canvas sits, so a reveal is in the player's theme. */
  function look(target: HTMLCanvasElement): Look {
    const style = getComputedStyle(target)
    const token = (name: string): string => style.getPropertyValue(name).trim()
    return {
      tileDark: token('--tile-dark'),
      tileSeam: token('--tile-seam'),
      ink: token('--ink'),
      bad: token('--bad'),
    }
  }

  $effect(() => {
    const target = canvas
    const img = image
    if (!loaded || target === null || img === null) return
    const picture = pixels(img)
    const pen = target.getContext('2d')
    if (picture === null || pen === null) return
    target.width = picture.width
    target.height = picture.height
    const { reveal, seed } = revealFor(room, questionId, index)
    const theme = look(target)
    const from = Date.parse(answerableAt)
    const to = Date.parse(endsAt)
    let frame = 0
    const draw = (): void => {
      const p = progress(from, to, Date.now() + get(serverOffsetMs))
      drawFrame(pen, picture, reveal, p, seed, theme)
      if (p < 1) frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  })
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
