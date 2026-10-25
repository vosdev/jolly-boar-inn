/** A large picture follows the room the stage has left, up to 12rem, and the silhouette and the reveal share its box. */

import { cleanup, render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'

import QuestionPicture from './QuestionPicture.svelte'

const NATURAL = 420

/** A stage `room` px tall holding content `content` px tall, a picture box in it 240px. */
function onStage(room: number, content: number, props: Record<string, unknown> = {}) {
  const stage = document.createElement('div')
  stage.dataset.fitStage = ''
  const inner = document.createElement('div')
  stage.append(inner)
  document.body.append(stage)
  Object.defineProperty(stage, 'clientHeight', { value: room })
  Object.defineProperty(inner, 'offsetHeight', { value: content })
  const view = render(QuestionPicture, {
    target: inner,
    props: { name: 'feedc0de.png', large: true, shadow: true, ...props },
  })
  const box = inner.querySelector<HTMLElement>('.picture')!
  Object.defineProperty(box, 'offsetHeight', { value: 240 })
  return { ...view, stage, box }
}

async function loadRender(box: HTMLElement): Promise<void> {
  box.querySelector('img')!.dispatchEvent(new Event('load'))
  await tick()
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('a large picture on a stage', () => {
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { value: NATURAL })

  it('is the height left once the rest of the stage is in', async () => {
    const { box } = onStage(650, 700)
    await loadRender(box)
    // 460px of dialogue box, padding and answers leave 190 of 650.
    expect(box.style.getPropertyValue('--picture-height')).toBe('190px')
  })

  it('grows to 12rem and no further on a tall stage, though the render is larger', async () => {
    const { box } = onStage(1100, 700)
    await loadRender(box)
    expect(NATURAL).toBeGreaterThan(192)
    expect(box.style.getPropertyValue('--picture-height')).toBe('192px')
  })

  it('stops at 160px when the stage has no room', async () => {
    const { box } = onStage(560, 700)
    await loadRender(box)
    expect(box.style.getPropertyValue('--picture-height')).toBe('160px')
  })

  it('stops at the render as the player sees it when the room is scaled up', async () => {
    const { box, stage } = onStage(1100, 700)
    Object.defineProperty(stage, 'offsetHeight', { value: 1100 })
    stage.getBoundingClientRect = () => ({ height: 2750 }) as DOMRect
    await loadRender(box)
    // The room drawn at 2.5 times: 168 room px are the render's 420 screen px.
    expect(box.style.getPropertyValue('--picture-height')).toBe('168px')
  })

  it('leaves room under the answer input for five suggestions', async () => {
    const { box, stage } = onStage(700, 700)
    const input = document.createElement('input')
    input.setAttribute('role', 'combobox')
    stage.firstElementChild!.append(input)
    await loadRender(box)
    // 240 of 700 left, less 5 rows of 2.5rem, the list's padding, gap, border and margin: 234 at 16px.
    expect(box.style.getPropertyValue('--picture-height')).toBe('160px')
  })

  it('counts what already lies under the input as room for the list', async () => {
    const { box, stage } = onStage(760, 700)
    const input = document.createElement('input')
    input.setAttribute('role', 'combobox')
    stage.firstElementChild!.append(input)
    input.getBoundingClientRect = () => ({ bottom: 100 }) as DOMRect
    stage.firstElementChild!.getBoundingClientRect = () => ({ bottom: 200 }) as DOMRect
    await loadRender(box)
    // 300 left, less the list's 234 and the 100 it already has under the input.
    expect(box.style.getPropertyValue('--picture-height')).toBe('166px')
  })

  it('keeps one box from the silhouette to the reveal', async () => {
    const { box, rerender } = onStage(1100, 700)
    await loadRender(box)
    const open = box.style.getPropertyValue('--picture-height')
    await rerender({ name: 'feedc0de.png', large: true, shadow: true, lifted: true })
    expect(box.style.getPropertyValue('--picture-height')).toBe(open)
    expect(box.querySelector('.frame')!.className).toContain('lifted')
  })

  it('gives a reveal drawn as a new picture the open question’s box', async () => {
    const first = onStage(650, 700)
    await loadRender(first.box)
    cleanup()
    const reveal = onStage(1100, 700, { lifted: true })
    await loadRender(reveal.box)
    expect(reveal.box.style.getPropertyValue('--picture-height')).toBe('190px')
  })

  it('grows with the sheet’s scale, as its 12rem off a stage does', async () => {
    const { box } = onStage(1100, 700)
    box.style.setProperty('--scroll-scale', '1.25')
    await loadRender(box)
    expect(box.style.getPropertyValue('--picture-height')).toBe('240px')
  })

  it('keeps the caption’s room while the shadow is up, so the reveal adds nothing', () => {
    const { container, rerender } = onStage(700, 700)
    const room = container.querySelector('.reserve')
    expect(room).not.toBeNull()
    expect(room!.getAttribute('aria-hidden')).toBe('true')
    return rerender({ name: 'feedc0de.png', large: true, caption: 'Vorkath' }).then(() => {
      expect(container.querySelector('.reserve')).toBeNull()
      expect(container.querySelector('.caption')!.textContent).toBe('Vorkath')
    })
  })

  it('is left to its own size off a stage, and for a small picture', async () => {
    const lone = render(QuestionPicture, { name: 'a.png', large: true })
    await loadRender(lone.container.querySelector<HTMLElement>('.picture')!)
    expect(
      lone.container
        .querySelector<HTMLElement>('.picture')!
        .style.getPropertyValue('--picture-height'),
    ).toBe('')
    cleanup()
    const small = onStage(700, 700, { large: false })
    await loadRender(small.box)
    expect(small.box.style.getPropertyValue('--picture-height')).toBe('')
    expect(small.container.querySelector('.caption')).toBeNull()
  })
})
