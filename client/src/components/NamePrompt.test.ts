/**
 * The first-visit prompt: a name and a head already filled in, a modal nothing but its
 * button gets out of, and an answer only a name the server would take can give.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { nameProblem } from '../lib/names'
import NamePrompt from './NamePrompt.svelte'

const onConfirm = vi.fn()

beforeEach(() => vi.clearAllMocks())

function field(): HTMLInputElement {
  return screen.getByRole('textbox') as HTMLInputElement
}

describe('NamePrompt', () => {
  it('opens as a modal, with a name the server would take already in the field', () => {
    render(NamePrompt, { action: 'Join', onConfirm })
    expect(document.querySelector('dialog')?.open).toBe(true)
    expect(nameProblem(field().value)).toBeNull()
    expect(screen.getByRole('button', { name: 'Join' })).toHaveProperty('disabled', false)
  })

  it('answers with the name as typed, trimmed, and the head it shows', async () => {
    render(NamePrompt, { action: 'Join', onConfirm })
    await fireEvent.input(field(), { target: { value: '  Zezima ' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    const [name, head] = onConfirm.mock.calls[0]!
    expect(name).toBe('Zezima')
    expect(Number.isInteger(head)).toBe(true)
  })

  it('will not answer with a name the server would refuse', async () => {
    render(NamePrompt, { action: 'Join', onConfirm })
    await fireEvent.input(field(), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Join' })).toHaveProperty('disabled', true)
    await fireEvent.input(field(), { target: { value: 'No!' } })
    expect(screen.getByRole('button', { name: 'Join' })).toHaveProperty('disabled', true)
    await fireEvent.submit(field().closest('form')!)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('rolls a new name and a new head on request', async () => {
    render(NamePrompt, { action: 'Join', onConfirm })
    const before = field().value
    await fireEvent.click(screen.getByRole('button', { name: 'Roll a random name' }))
    expect(field().value).not.toBe(before)
    await fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    const first = onConfirm.mock.calls[0]![1]
    onConfirm.mockClear()
    await fireEvent.click(screen.getByRole('button', { name: /New head/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(onConfirm.mock.calls[0]![1]).not.toBe(first)
  })

  it('swallows Escape: there is no way out but the button', () => {
    render(NamePrompt, { action: 'Join', onConfirm })
    const cancel = new Event('cancel', { cancelable: true })
    document.querySelector('dialog')!.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(document.querySelector('dialog')?.open).toBe(true)
  })

  it('opens again when the browser closes it anyway, which it does for a first Escape without interaction', () => {
    render(NamePrompt, { action: 'Join', onConfirm })
    const dialog = document.querySelector('dialog')!
    dialog.close()
    dialog.dispatchEvent(new Event('close'))
    expect(dialog.open).toBe(true)
  })

  it('stays shut once the caller has dropped it', () => {
    const { unmount } = render(NamePrompt, { action: 'Join', onConfirm })
    const dialog = document.querySelector('dialog')!
    unmount()
    dialog.dispatchEvent(new Event('close'))
    expect(dialog.open).toBe(false)
  })

  it('says what the button does', () => {
    render(NamePrompt, { action: 'Create room', onConfirm })
    expect(screen.getByRole('button', { name: 'Create room' })).toBeTruthy()
  })
})
