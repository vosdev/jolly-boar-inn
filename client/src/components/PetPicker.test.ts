/**
 * The pet picker: shut until asked, a search over every pickable pet, a native radio group
 * for the keyboard and a screen reader, and Random.
 */

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import { PICKABLE } from '../lib/pets'
import { petsDrawn } from '../test-pets'
import PetPicker from './PetPicker.svelte'

function picker(value = 'aggy', extra: Record<string, unknown> = {}) {
  return render(PetPicker, { value, ...extra })
}

const grid = () => screen.getByRole('radiogroup', { name: 'Pets' })

describe('PetPicker', () => {
  it('shows the pet you have, large, with its name, and keeps the grid shut', () => {
    const { container } = picker()
    expect(screen.getByText('Aggy')).toBeTruthy()
    expect(petsDrawn(container)).toEqual([{ pet: 'aggy', size: 64 }])
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByRole('button', { name: 'Change pet' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('opens a grid of every pickable pet, A to Z, as radios named for the pet', async () => {
    picker()
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    const radios = within(grid()).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((radio) => radio.value)).toEqual(PICKABLE.map((pet) => pet.id))
    expect(radios.length).toBeGreaterThan(200)
    expect(screen.getByRole('radio', { name: 'Baby Mole' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Aggy' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('moves focus to the search box on opening', async () => {
    picker()
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search pets' })))
  })

  it('narrows the grid by name as you type, and says how many are left', async () => {
    picker()
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    await fireEvent.input(screen.getByRole('textbox', { name: 'Search pets' }), { target: { value: 'ROCK' } })
    const names = within(grid()).getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value)
    expect(names.length).toBeGreaterThan(0)
    expect(names.length).toBeLessThan(PICKABLE.length)
    expect(names).toEqual(PICKABLE.filter((pet) => pet.name.toLowerCase().includes('rock')).map((pet) => pet.id))
    expect(screen.getByRole('status').textContent).toBe(`${names.length} ${names.length === 1 ? 'pet' : 'pets'}`)
  })

  it('says so when nothing matches', async () => {
    picker()
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    await fireEvent.input(screen.getByRole('textbox', { name: 'Search pets' }), { target: { value: 'zzzzz' } })
    expect(within(grid()).queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('No pet has that name.')
  })

  it('does not submit the form it sits in when Enter is pressed in the search box', async () => {
    const onsubmit = vi.fn((event: Event) => event.preventDefault())
    const { container } = picker()
    container.closest('body')!.addEventListener('submit', onsubmit)
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    const search = screen.getByRole('textbox', { name: 'Search pets' })
    const press = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    search.dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true)
  })

  it('picks a pet by clicking it, tells the caller, and shows it large', async () => {
    const onchange = vi.fn()
    const { container } = picker('aggy', { onchange })
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    await fireEvent.click(screen.getByRole('radio', { name: 'Baby Mole' }))
    expect(onchange).toHaveBeenCalledTimes(1)
    expect(petsDrawn(container.querySelector('.current')!)).toEqual([{ pet: 'baby_mole', size: 64 }])
    expect(container.querySelector('.pet-name')!.textContent).toBe('Baby Mole')
  })

  it('has Random pick another pet, and never the same one', async () => {
    const onchange = vi.fn()
    const { container } = picker('aggy', { onchange })
    for (let i = 0; i < 20; i++) {
      const before = container.querySelector('.pet-name')!.textContent
      await fireEvent.click(screen.getByRole('button', { name: 'Random' }))
      expect(container.querySelector('.pet-name')!.textContent).not.toBe(before)
    }
    expect(onchange).toHaveBeenCalledTimes(20)
  })

  it('has Random lean away from the pets already in the room', async () => {
    const taken = PICKABLE.filter((pet) => pet.id !== 'aggy' && pet.id !== 'baby_mole').map((pet) => pet.id)
    const { container } = picker('aggy', { taken })
    await fireEvent.click(screen.getByRole('button', { name: 'Random' }))
    expect(container.querySelector('.pet-name')!.textContent).toBe('Baby Mole')
  })

  it('closes the grid on Escape, gives focus back, and leaves Escape from reaching the menu around it', async () => {
    const outer = vi.fn()
    picker()
    window.addEventListener('keydown', outer)
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search pets' }), { key: 'Escape' })
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change pet' }))
    window.removeEventListener('keydown', outer)
    expect(outer).not.toHaveBeenCalled()
  })

  it('disables every control while a change is in flight', async () => {
    picker('aggy', { disabled: true })
    expect((screen.getByRole('button', { name: 'Random' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Change pet' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
