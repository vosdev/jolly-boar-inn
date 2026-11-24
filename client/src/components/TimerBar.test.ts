/** The timer bar's tabs: the seconds on the right, and a question's number on the left. */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { roomShown } from '../lib/roomFit'
import TimerBar from './TimerBar.svelte'

const endsAt = () => new Date(Date.now() + 10_000).toISOString()
const tabs = () => [...document.querySelectorAll('.tab')].map((tab) => tab.textContent)

describe('TimerBar', () => {
  it('puts a button in the seconds’ place over a full track for an action', async () => {
    const press = vi.fn()
    render(TimerBar, {
      endsAt: endsAt(),
      totalSeconds: 0,
      label: '',
      stage: true,
      action: { text: 'Next ›', name: 'Next question', press },
    })
    const button = screen.getByRole('button', { name: 'Next question' })
    expect(button.textContent?.trim()).toBe('Next ›')
    expect(button.classList.contains('seconds')).toBe(true)
    expect(document.querySelector('span.seconds')).toBeNull()
    expect((document.querySelector('.fill') as HTMLElement).style.width).toBe('100%')
    expect(document.querySelector('.timerbar')!.classList.contains('urgent')).toBe(false)
    await fireEvent.click(button)
    expect(press).toHaveBeenCalledOnce()
  })

  it('hangs the question’s number on the left of a question’s bar', () => {
    render(TimerBar, { endsAt: endsAt(), totalSeconds: 10, label: 'to answer', progress: '2/3' })
    expect(tabs()).toEqual(['2/3', '10s'])
    expect(document.querySelector('.column')!.classList.contains('stage')).toBe(true)
  })

  it('has the seconds alone when there is no question to number', () => {
    render(TimerBar, { endsAt: endsAt(), totalSeconds: 10, label: 'to the next round' })
    expect(tabs()).toEqual(['10s'])
  })

  it('can keep to the stage’s width with no number on the bar', () => {
    render(TimerBar, { endsAt: endsAt(), totalSeconds: 10, label: 'to answer', stage: true })
    expect(tabs()).toEqual(['10s'])
    expect(document.querySelector('.column')!.classList.contains('stage')).toBe(true)
  })

  it('names what follows a reveal in its countdown, never turning urgent', () => {
    render(TimerBar, {
      endsAt: new Date(Date.now() + 4_000).toISOString(),
      totalSeconds: 8,
      label: 'to the standings',
      progress: '2/3',
      next: 'Standings',
    })
    expect(tabs()).toEqual(['2/3', 'Standings in 4s'])
    const bar = document.querySelector('.timerbar')!
    expect(bar.classList.contains('next')).toBe(true)
    expect(bar.classList.contains('urgent')).toBe(false)
  })

  it('counts the standings down in the quiet fill under the round and plain seconds', () => {
    render(TimerBar, {
      endsAt: new Date(Date.now() + 4_000).toISOString(),
      totalSeconds: 10,
      label: 'to the next round',
      progress: '2/3',
      quiet: true,
    })
    expect(tabs()).toEqual(['2/3', '4s'])
    const bar = document.querySelector('.timerbar')!
    expect(bar.classList.contains('next')).toBe(true)
    expect(bar.classList.contains('urgent')).toBe(false)
  })

  describe('in a room laid out for a desktop', () => {
    afterEach(() => roomShown.set(null))

    it('hangs its tabs at the stage’s edges, at the room’s scale', () => {
      roomShown.set({ fit: { scale: 2, width: 1600, height: 920, left: 100, compact: false } })
      render(TimerBar, { endsAt: endsAt(), totalSeconds: 10, label: 'to answer', progress: '2/3' })
      const column = document.querySelector<HTMLElement>('.column')!
      expect(column.classList.contains('room')).toBe(true)
      expect(column.style.getPropertyValue('--stage-left')).toBe('180px')
      expect(column.style.getPropertyValue('--stage-width')).toBe(`${(1600 - 80 - 28 - 380) * 2}px`)
      expect(column.style.getPropertyValue('--tab-scale')).toBe('2')
    })

    it('hangs them at a centred stage’s edges in a room with no table column', () => {
      const fit = { scale: 1, width: 1448, height: 920, left: 0, compact: false }
      roomShown.set({ fit, centred: true })
      render(TimerBar, { endsAt: endsAt(), totalSeconds: 10, label: 'to answer', stage: true })
      const column = document.querySelector<HTMLElement>('.column')!
      expect(column.style.getPropertyValue('--stage-left')).toBe('244px')
      expect(column.style.getPropertyValue('--stage-width')).toBe('960px')
    })
  })
})
