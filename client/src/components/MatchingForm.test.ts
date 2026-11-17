/**
 * The matching editor's hold on a sort: two bins is too few, even in a question opened for
 * editing, as `/admin` might open one written before the rule.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MatchingForm from './MatchingForm.svelte'

afterEach(cleanup)

describe('MatchingForm', () => {
  it('refuses to save a sort into two bins', async () => {
    const onsave = vi.fn()
    render(MatchingForm, {
      question: {
        type: 'matching',
        payload: {
          prompt: 'Free-to-play or members?',
          bins: true,
          fields: ['Rune scimitar', 'Dragon dagger', 'Lobster', 'Shark'].map((text) => ({ text })),
          options: [{ text: 'Free-to-play' }, { text: 'Members' }],
          answer: [0, 1, 0, 1],
        },
      },
      saveLabel: 'Save',
      onsave,
      oncancel: () => {},
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('3 to 4 bins.')).toBeTruthy()
    expect(onsave).not.toHaveBeenCalled()
  })
})
