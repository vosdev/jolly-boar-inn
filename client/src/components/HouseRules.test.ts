import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import HouseRules from './HouseRules.svelte'

const RULES = {
  pace: 'run' as const,
  difficulty: 'mixed' as const,
  standingsSeconds: 10,
  closeWhenAllAnswered: true,
  nameWrongAnswers: true,
}

const boxes = () => screen.getByRole('group', { name: 'Mystery Boxes' })
const option = (label: string) =>
  [...boxes().querySelectorAll('input')].find(
    (input) => input.labels?.[0]?.textContent?.trim() === label,
  ) as HTMLInputElement

describe('HouseRules Mystery Boxes', () => {
  it('turns items off and on again', async () => {
    let items = true
    render(HouseRules, {
      props: {
        ...RULES,
        get items() {
          return items
        },
        set items(value: boolean) {
          items = value
        },
      },
    })
    expect(option('On').checked).toBe(true)
    await fireEvent.click(option('Off'))
    expect(items).toBe(false)
    await fireEvent.click(option('On'))
    expect(items).toBe(true)
    expect(boxes().parentElement?.textContent).toContain('the bottom half of the hiscores')
  })

  it('reads Off and cannot change in a team game', () => {
    render(HouseRules, { ...RULES, items: true, teams: true })
    expect(option('Off').checked).toBe(true)
    expect(boxes().hasAttribute('disabled')).toBe(true)
  })
})
