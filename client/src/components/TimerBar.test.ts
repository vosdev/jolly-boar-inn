/** The timer bar's tabs: the seconds on the right, and a question's number on the left. */

import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import TimerBar from './TimerBar.svelte'

const endsAt = () => new Date(Date.now() + 10_000).toISOString()
const tabs = () => [...document.querySelectorAll('.tab')].map((tab) => tab.textContent)

describe('TimerBar', () => {
  it('hangs the question’s number on the left of a question’s bar', () => {
    render(TimerBar, { endsAt: endsAt(), totalSeconds: 10, label: 'to answer', progress: '2/3' })
    expect(tabs()).toEqual(['2/3', '10s'])
    expect(document.querySelector('.column')!.classList.contains('stage')).toBe(true)
  })

  it('has the seconds alone when there is no question to number', () => {
    render(TimerBar, { endsAt: endsAt(), totalSeconds: 10, label: 'to the next round' })
    expect(tabs()).toEqual(['10s'])
  })
})
