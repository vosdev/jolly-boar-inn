/** The question and explanation fields show an example for the round, and none where the prompt is fixed. */

import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it } from 'vitest'

import { fieldHints } from '../lib/placeholders'
import CustomQuestionForm from './CustomQuestionForm.svelte'
import MatchingForm from './MatchingForm.svelte'
import OrderingForm from './OrderingForm.svelte'

afterEach(cleanup)

const noop = () => {}
const props = { onsave: noop, oncancel: noop }

function placeholderOf(label: RegExp): string | null {
  return screen.getByLabelText(label).getAttribute('placeholder')
}

describe('field placeholders', () => {
  it('CustomQuestionForm shows its round’s examples', () => {
    render(CustomQuestionForm, { ...props, mode: 'bestiary' })
    expect(placeholderOf(/^Question$/)).toBe(fieldHints('bestiary').prompt)
    expect(placeholderOf(/^Explanation/)).toBe(fieldHints('bestiary').explanation)
  })

  it('CustomQuestionForm falls back on Create, which has no round', () => {
    render(CustomQuestionForm, props)
    expect(placeholderOf(/^Question$/)).toBe(fieldHints('custom').prompt)
  })

  it('CustomQuestionForm leaves a fixed prompt without a placeholder', () => {
    render(CustomQuestionForm, { ...props, mode: 'odd_one_out', promptFixed: true })
    expect(placeholderOf(/^Question$/)).toBeNull()
    expect(placeholderOf(/^Explanation/)).toBe(fieldHints('odd_one_out').explanation)
  })

  it('OrderingForm shows its round’s explanation example', () => {
    render(OrderingForm, { ...props, mode: 'sort_it_out' })
    expect(placeholderOf(/^Explanation/)).toBe(fieldHints('sort_it_out').explanation)
  })

  it('MatchingForm shows its round’s examples', () => {
    render(MatchingForm, { ...props, mode: 'drop_table' })
    expect(placeholderOf(/^Question$/)).toBe(fieldHints('drop_table').prompt)
    expect(placeholderOf(/^Explanation/)).toBe(fieldHints('drop_table').explanation)
  })
})
