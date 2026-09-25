/** The one name field: no longer than the server takes, and a die that keeps the keyboard up. */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import { NAME_MAX } from '../lib/names'
import NameField from './NameField.svelte'

const field = () => screen.getByRole('textbox', { name: 'Your name' }) as HTMLInputElement
const die = () => screen.getByRole('button', { name: 'Roll a random name' })

describe('NameField', () => {
  it('takes no more characters than the server does', () => {
    render(NameField, { id: 'name', value: '' })
    expect(field().maxLength).toBe(NAME_MAX)
  })

  it('rolls a new name without taking focus off the field', async () => {
    render(NameField, { id: 'name', value: 'Zezima' })
    field().focus()
    // A press that is not prevented moves focus to the button and drops a phone's keyboard.
    expect(await fireEvent.pointerDown(die())).toBe(false)
    expect(await fireEvent.mouseDown(die())).toBe(false)
    await fireEvent.click(die())
    expect(field().value).not.toBe('Zezima')
    expect(field().value).not.toBe('')
    expect(document.activeElement).toBe(field())
  })
})
