/** A large picture follows the room the stage has left, and the silhouette and the reveal share its box. */

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
    const { box } = onStage(700, 700)
    await loadRender(box)
    // 460px of dialogue box, padding and answers leave 240 of 700.
    expect(box.style.getPropertyValue('--picture-height')).toBe('240px')
  })

  it('grows to its render and no further on a tall stage', async () => {
    const { box } = onStage(1100, 700)
    await loadRender(box)
    expect(box.style.getPropertyValue('--picture-height')).toBe(`${NATURAL}px`)
  })

  it('stops at 160px when the stage has no room', async () => {
    const { box } = onStage(560, 700)
    await loadRender(box)
    expect(box.style.getPropertyValue('--picture-height')).toBe('160px')
  })

  it('keeps one box from the silhouette to the reveal', async () => {
    const { box, rerender } = onStage(1100, 700)
    await loadRender(box)
    const open = box.style.getPropertyValue('--picture-height')
    await rerender({ name: 'feedc0de.png', large: true, shadow: true, lifted: true })
    expect(box.style.getPropertyValue('--picture-height')).toBe(open)
    expect(box.querySelector('.frame')!.className).toContain('lifted')
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
