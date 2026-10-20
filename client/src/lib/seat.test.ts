/** The phone sheet's words wrapping around its NPC, on boxes placed by hand: jsdom lays nothing out. */

import { describe, expect, it } from 'vitest'

import { seatOf, seatWords, type Box } from './seat'

/** A sheet 300px wide whose words start at 20px; the host's seat is its bottom-left. */
const SEAT: Box = { top: 120, bottom: 200, left: 0, right: 90 }

function at<E extends HTMLElement>(el: E, top: number, bottom: number, left = 20, right = 320): E {
  el.getBoundingClientRect = () => ({ top, bottom, left, right }) as DOMRect
  return el
}

function sheet(...children: HTMLElement[]): HTMLElement {
  const content = at(document.createElement('div'), 0, 200)
  content.append(...children)
  document.body.append(content)
  return content
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, display?: string) {
  const made = document.createElement(tag)
  if (display !== undefined) made.style.display = display
  return made
}

describe('seatWords', () => {
  it('leaves a line above the NPC to run the full width', () => {
    const title = at(el('h2'), 0, 40)
    seatWords(sheet(title), SEAT, 'left')
    expect(title.dataset.seat).toBeUndefined()
  })

  it('wraps a line that reaches beside the NPC, solid only from its head down', () => {
    const prompt = at(el('p'), 60, 160)
    seatWords(sheet(prompt), SEAT, 'left')
    expect(prompt.dataset.seat).toBe('wrap-left')
    expect(prompt.style.getPropertyValue('--seat-w')).toBe('70px')
    expect(prompt.style.getPropertyValue('--seat-h')).toBe('100px')
    expect(prompt.style.getPropertyValue('--seat-from')).toBe('60px')
  })

  it("measures a padded line's float inside its padding, so the line cannot grow it", () => {
    const quote = at(el('blockquote'), 60, 160)
    quote.style.padding = '6px 4px'
    seatWords(sheet(quote), SEAT, 'left')
    expect(quote.style.getPropertyValue('--seat-w')).toBe('66px')
    expect(quote.style.getPropertyValue('--seat-h')).toBe('88px')
    expect(quote.style.getPropertyValue('--seat-from')).toBe('54px')
  })

  it('steps a row and a control aside whole, clear of the NPC', () => {
    const foot = at(el('div', 'flex'), 160, 200)
    const button = at(el('button'), 130, 150)
    seatWords(sheet(foot, button), SEAT, 'left')
    expect(foot.dataset.seat).toBe('shift-left')
    expect(button.dataset.seat).toBe('shift-left')
    expect(foot.style.getPropertyValue('--seat-w')).toBe('70px')
  })

  it('walks into a column and through a moved part, so each line wraps on its own', () => {
    const column = at(el('figure', 'flex'), 40, 200)
    column.style.flexDirection = 'column'
    const caption = at(el('figcaption'), 40, 80)
    const quote = at(el('blockquote'), 100, 200)
    column.append(caption, quote)
    const part = el('div', 'contents')
    part.append(column)
    seatWords(sheet(part), SEAT, 'left')
    expect(column.dataset.seat).toBeUndefined()
    expect(caption.dataset.seat).toBeUndefined()
    expect(quote.dataset.seat).toBe('wrap-left')
  })

  it('wraps around a guest on the right', () => {
    const prompt = at(el('p'), 100, 160)
    const foot = at(el('div', 'flex'), 160, 200)
    seatWords(sheet(prompt, foot), { top: 120, bottom: 200, left: 250, right: 340 }, 'right')
    expect(prompt.dataset.seat).toBe('wrap-right')
    expect(prompt.style.getPropertyValue('--seat-w')).toBe('70px')
    expect(foot.dataset.seat).toBe('shift-right')
    expect(foot.style.getPropertyValue('--seat-w')).toBe('70px')
  })

  it('settles: a second fit changes nothing, and no seat unmarks', () => {
    const prompt = at(el('p'), 60, 160)
    const content = sheet(prompt)
    expect(seatWords(content, SEAT, 'left')).toBe(true)
    expect(seatWords(content, SEAT, 'left')).toBe(false)
    expect(seatWords(content, null, 'left')).toBe(true)
    expect(prompt.dataset.seat).toBeUndefined()
    expect(prompt.style.getPropertyValue('--seat-w')).toBe('')
  })
})

describe('seatOf', () => {
  it('keeps the words clear of the side the NPC faces and above its head', () => {
    const npc = new DOMRect(10, 130, 68, 70)
    expect(seatOf(npc, 'left')).toEqual({ top: 126, bottom: 200, left: 10, right: 88 })
    expect(seatOf(npc, 'right')).toEqual({ top: 126, bottom: 200, left: 0, right: 78 })
  })
})
