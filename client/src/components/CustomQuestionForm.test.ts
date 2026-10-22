/**
 * Who asks a question in the form: the select of what each NPC asks about and the row of
 * faces, which are one choice, with the room's draw where the NPC is optional.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RANDOM_EVENTS } from '../lib/randomEvents'
import CustomQuestionForm from './CustomQuestionForm.svelte'

afterEach(cleanup)

function topics(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: "What's it about?" })
}

function faces(): HTMLElement {
  return screen.getByRole('radiogroup', { name: 'Who asks it' })
}

function face(name: string): HTMLInputElement {
  return within(faces()).getByRole('radio', { name })
}

async function choose(value: string): Promise<void> {
  await fireEvent.change(topics(), { target: { value } })
}

describe('CustomQuestionForm', () => {
  it('lists every NPC once as its theme and name, sorted by theme, then by name', () => {
    render(CustomQuestionForm, { asker: 'required', onsave: () => {}, oncancel: () => {} })
    const options = [...topics().options].filter((option) => option.value !== '')
    expect(options.map((option) => option.value).sort()).toEqual(
      RANDOM_EVENTS.map((npc) => npc.id).sort(),
    )
    const listed = options.map((option) => RANDOM_EVENTS.find((npc) => npc.id === option.value)!)
    for (const [index, npc] of listed.entries()) {
      expect(options[index]!.textContent).toBe(`${npc.theme} (${npc.name})`)
      const next = listed[index + 1]
      if (next === undefined) continue
      const order =
        npc.theme.localeCompare(next.theme, 'en') || npc.name.localeCompare(next.name, 'en')
      expect(order).toBeLessThan(0)
    }
    expect(screen.getByRole('option', { name: 'Cooking and food (Sandwich Lady)' })).toBeTruthy()
  })

  it('checks the face picked from the select and scrolls the row to it, and sets the select from a face', async () => {
    render(CustomQuestionForm, { onsave: () => {}, oncancel: () => {} })
    const row = faces()
    Object.defineProperty(row, 'clientWidth', { value: 200 })
    Object.defineProperty(row, 'scrollLeft', { value: 0, writable: true })
    const death = face('Death').closest('label')!
    Object.defineProperty(death, 'offsetLeft', { value: 500 })
    Object.defineProperty(death, 'offsetWidth', { value: 50 })

    await choose('death')
    expect(face('Death').checked).toBe(true)
    expect(row.scrollLeft).toBe(425)

    await fireEvent.click(face('Evil Bob'))
    expect(topics().value).toBe('bob')
    expect(face('Death').checked).toBe(false)
  })

  it('starts on a random NPC where the NPC is optional, and offers it back', async () => {
    render(CustomQuestionForm, { onsave: () => {}, oncancel: () => {} })
    const first = topics().options[0]!
    expect(first.textContent).toBe('Anything (a random NPC)')
    expect(topics().value).toBe('')
    expect(face('A random NPC').checked).toBe(true)

    await choose('death')
    await choose('')
    expect(face('A random NPC').checked).toBe(true)
  })

  it('starts empty where the NPC is required, and refuses to save until one is picked', async () => {
    const onsave = vi.fn()
    render(CustomQuestionForm, {
      asker: 'required',
      saveLabel: 'Send',
      onsave,
      oncancel: () => {},
    })
    expect(topics().value).toBe('')
    expect(topics().selectedOptions[0]!.textContent).toBe('')
    expect(within(faces()).queryByRole('radio', { name: 'A random NPC' })).toBeNull()
    expect(
      within(faces())
        .getAllByRole('radio')
        .some((radio) => (radio as HTMLInputElement).checked),
    ).toBe(false)

    await fireEvent.input(screen.getByRole('textbox', { name: 'Question' }), {
      target: { value: 'Who runs the inn?' },
    })
    await fireEvent.input(screen.getByRole('textbox', { name: 'Answer 1' }), {
      target: { value: 'Hans' },
    })
    await fireEvent.input(screen.getByRole('textbox', { name: 'Answer 2' }), {
      target: { value: 'Bartender' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByText('Pick who asks it.')).toBeTruthy()
    expect(onsave).not.toHaveBeenCalled()

    await choose('death')
    expect(screen.queryByText('Pick who asks it.')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onsave).toHaveBeenCalledWith(expect.objectContaining({ random_event: 'death' }))
  })

  it('offers an explanation unless the round shows none', () => {
    const label = 'Explanation shown after the question finished.'
    render(CustomQuestionForm, { onsave: () => {}, oncancel: () => {} })
    expect(screen.getByLabelText(label)).toBeTruthy()
    cleanup()
    render(CustomQuestionForm, { explanation: false, onsave: () => {}, oncancel: () => {} })
    expect(screen.queryByLabelText(label)).toBeNull()
  })

  it('labels the select and leaves it a native control the keyboard reaches', () => {
    render(CustomQuestionForm, { onsave: () => {}, oncancel: () => {} })
    const select = topics()
    expect(select.tagName).toBe('SELECT')
    expect(select.disabled).toBe(false)
    expect(select.tabIndex).toBe(0)
    select.focus()
    expect(document.activeElement).toBe(select)
  })
})
