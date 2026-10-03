/**
 * The host's questions on Create: written, edited, moved and removed in the form, saved to
 * a file and loaded from one, and sent with the room only when every one of them fits a
 * random-event slot.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { exportText, importText, type CustomQuestion } from '../lib/customQuestions'
import { profile } from '../lib/profile'
import Create from '../routes/Create.svelte'

// Two rounds of ten: 20 round questions, so 1 event at Less, 2 at Default, 4 at More.
const PACING: api.ModePacing[] = [
  {
    id: 'more_less',
    types: ['more_less'],
    questions: { default: 10, min: 1, max: 30 },
    seconds: { default: 10, min: 5, max: 20 },
  },
  {
    id: 'price_is_right',
    types: ['price_is_right'],
    questions: { default: 10, min: 1, max: 30 },
    seconds: { default: 10, min: 5, max: 30 },
  },
  { id: 'custom', types: [], questions: null, seconds: null },
]

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getModes: vi.fn(), createRoom: vi.fn(), getRoom: vi.fn() }
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(api.getModes).mockResolvedValue(structuredClone(PACING))
  vi.mocked(api.createRoom).mockResolvedValue({
    code: 'ABYSSAL',
    session: 's',
    expires_at: '2099-01-01T00:00:00Z',
    player: { id: 'p', display_name: 'Zezima', role: 'admin', connected: false },
  })
  profile.set({ name: 'Zezima', head: 3 })
})

afterEach(cleanup)

async function loaded(): Promise<HTMLElement> {
  render(Create, { navigate: () => {} })
  await screen.findByRole('checkbox', { name: /^More or Less/ })
  return screen.getByRole('region', { name: 'Personalized questions' })
}

function editor(): HTMLElement {
  return screen.getByRole('group', { name: /question$/ })
}

async function click(scope: HTMLElement, name: string | RegExp): Promise<void> {
  await fireEvent.click(within(scope).getByRole('button', { name }))
}

async function type(scope: HTMLElement, name: string, value: string): Promise<void> {
  await fireEvent.input(within(scope).getByRole('textbox', { name }), { target: { value } })
}

async function pick(scope: HTMLElement, name: string): Promise<void> {
  await fireEvent.click(within(scope).getByRole('radio', { name }))
}

async function setFrequency(label: 'Less' | 'Default' | 'More'): Promise<void> {
  const group = screen.getByRole('group', { name: 'Random events frequency' })
  await fireEvent.click(within(group).getByRole('radio', { name: label }))
}

/** Writes a multiple-choice question with two answers, the second one right. */
async function writeChoice(panel: HTMLElement, prompt: string, npc = ''): Promise<void> {
  await click(panel, 'Add a question')
  const form = editor()
  await type(form, 'Question', prompt)
  await type(form, 'Answer 1', 'Hans')
  await type(form, 'Answer 2', 'Bartender')
  await pick(form, 'Answer 2 is right')
  if (npc !== '') await fireEvent.change(within(form).getByRole('combobox', { name: 'Who asks it' }), { target: { value: npc } })
  await click(form, 'Add question')
}

async function submitted(): Promise<CustomQuestion[]> {
  await fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
  await waitFor(() => expect(api.createRoom).toHaveBeenCalledOnce())
  return vi.mocked(api.createRoom).mock.calls[0]![5] as CustomQuestion[]
}

function listed(panel: HTMLElement): string[] {
  return [...panel.querySelectorAll('.list .prompt')].map((node) => node.textContent ?? '')
}

function chooseFile(panel: HTMLElement, text: string): Promise<boolean> {
  const input = panel.querySelector<HTMLInputElement>('input[type=file]')!
  return fireEvent.change(input, { target: { files: [new File([text], 'questions.json')] } })
}

describe('CustomQuestions', () => {
  it('adds, edits, removes and reorders all three types, and sends them in that order', async () => {
    const panel = await loaded()
    await setFrequency('More')

    await writeChoice(panel, 'Who runs the inn?')

    await click(panel, 'Add a question')
    let form = editor()
    await pick(form, 'Type the answer')
    await type(form, 'Question', 'Name the cat')
    await type(form, 'Accepted answer 1', 'Fluffs')
    await click(form, 'Add another spelling')
    await type(form, 'Accepted answer 2', 'Fluffy')
    await click(form, 'Add question')

    await click(panel, 'Add a question')
    form = editor()
    await pick(form, 'Closest number')
    await type(form, 'Question', 'Zulrah kills for a pet?')
    await type(form, 'Answer', '4000')
    await type(form, 'Unit, if any', 'kills')
    await click(form, 'Add question')

    await click(panel, 'Add a question')
    await type(editor(), 'Question', 'To be removed')
    await type(editor(), 'Answer 1', 'A')
    await type(editor(), 'Answer 2', 'B')
    await click(editor(), 'Add question')
    expect(listed(panel)).toHaveLength(4)
    await click(panel, 'Remove question 4')

    await click(panel, 'Edit question 2')
    await click(editor(), 'Remove accepted answer 2')
    await click(editor(), 'Save question')

    await click(panel, 'Move question 3 earlier')
    expect(listed(panel)).toEqual(['Who runs the inn?', 'Zulrah kills for a pet?', 'Name the cat'])

    expect(await submitted()).toEqual([
      { type: 'multiple_choice', payload: { prompt: 'Who runs the inn?', options: ['Hans', 'Bartender'], answer_index: 1 } },
      { type: 'closest_number', payload: { prompt: 'Zulrah kills for a pet?', answer: 4000, unit: 'kills' } },
      { type: 'free_text', payload: { prompt: 'Name the cat', accepted: ['Fluffs'] } },
    ])
  })

  it('starts the NPC picker on Random, and sends no random_event for a question left on it', async () => {
    const panel = await loaded()
    await click(panel, 'Add a question')
    const select = within(editor()).getByRole('combobox', { name: 'Who asks it' }) as HTMLSelectElement
    expect(select.value).toBe('')
    expect(select.options[0]!.textContent).toBe('Random')
    expect(select.options[1]!.textContent).toBe('Sandwich Lady: Cooking and food')
    await click(editor(), 'Cancel')

    await writeChoice(panel, 'Left to the draw')
    await writeChoice(panel, 'Named', 'death')
    const [random, named] = await submitted()
    expect(random).not.toHaveProperty('random_event')
    expect(named!.random_event).toBe('death')
  })

  it("previews the chosen NPC's card with the question, and the Mysterious Old Man for Random", async () => {
    const panel = await loaded()
    await click(panel, 'Add a question')
    const form = editor()
    const preview = within(form).getByRole('region', { name: 'Preview' })
    expect(within(preview).getByRole('heading', { name: 'Mysterious Old Man' })).toBeTruthy()
    await type(form, 'Question', 'Who runs the inn?')
    await type(form, 'Answer 1', 'Hans')
    await fireEvent.change(within(form).getByRole('combobox', { name: 'Who asks it' }), {
      target: { value: 'wise_old_man' },
    })
    expect(within(preview).getByRole('heading', { name: 'Wise Old Man' })).toBeTruthy()
    expect(preview.textContent).toContain('Who runs the inn?')
    expect(within(preview).getByRole('button', { name: /Hans/ })).toBeTruthy()
  })

  it('starts clean, shows a limit next to its field as it is broken, and what is missing only on Add', async () => {
    const panel = await loaded()
    await click(panel, 'Add a question')
    const form = editor()
    expect(within(form).queryAllByText(/./, { selector: '.error' })).toEqual([])
    await pick(form, 'Type the answer')
    expect(within(form).queryAllByText(/./, { selector: '.error' })).toEqual([])
    await pick(form, 'Multiple choice')
    await type(form, 'Answer 1', 'Hans')
    await type(form, 'Answer 2', ' hans ')
    expect(form.textContent).toContain('Same as answer 1.')
    expect(form.textContent).not.toContain('Can’t be empty.')
    await click(form, 'Add question')
    expect(form.textContent).toContain('Can’t be empty.')
    expect(listed(panel)).toEqual([])
  })

  it('caps the answers at the schema’s six, and the accepted answers at its twenty', async () => {
    const panel = await loaded()
    await click(panel, 'Add a question')
    for (let i = 0; i < 4; i++) await click(editor(), 'Add an answer')
    expect((within(editor()).getByRole('button', { name: 'Add an answer' }) as HTMLButtonElement).disabled).toBe(true)
    await pick(editor(), 'Type the answer')
    for (let i = 0; i < 19; i++) await click(editor(), 'Add another spelling')
    expect((within(editor()).getByRole('button', { name: 'Add another spelling' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves the question on Enter in a field rather than creating the room', async () => {
    const panel = await loaded()
    await click(panel, 'Add a question')
    const form = editor()
    await type(form, 'Question', 'Who runs the inn?')
    await type(form, 'Answer 1', 'Hans')
    await type(form, 'Answer 2', 'Bartender')
    await fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Answer 2' }), { key: 'Enter' })
    expect(listed(panel)).toEqual(['Who runs the inn?'])
    expect(api.createRoom).not.toHaveBeenCalled()
  })

  it('will not create the room while a question is open and unsaved', async () => {
    const panel = await loaded()
    await click(panel, 'Add a question')
    const create = screen.getByRole('button', { name: 'Create room' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    expect(document.body.textContent).toContain('Add or cancel the question you are writing')
    await click(editor(), 'Cancel')
    expect(create.disabled).toBe(false)
  })

  it('stops adding at the event cap and says More would allow more', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'One')
    await writeChoice(panel, 'Two')
    expect((within(panel).getByRole('button', { name: 'Add a question' }) as HTMLButtonElement).disabled).toBe(true)
    expect(panel.textContent).toContain('Every random event is already one of yours.')
    expect(panel.textContent).toContain('pick More frequency')
  })

  it('refuses to submit past the event cap, naming the count, the limit and the frequency', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'One')
    await writeChoice(panel, 'Two')
    await setFrequency('Less')
    const message =
      'Your rounds make room for 1 random event at Less frequency, and you have 2 questions of your own. More frequency would make room for 4.'
    expect(within(panel).getByRole('alert').textContent).toBe(message)
    expect(screen.getAllByText(message)).toHaveLength(2)
    expect((screen.getByRole('button', { name: 'Create room' }) as HTMLButtonElement).disabled).toBe(true)
    await setFrequency('Default')
    expect((screen.getByRole('button', { name: 'Create room' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('exports the list as the file Import reads', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'Named', 'genie')
    let blob: Blob | undefined
    URL.createObjectURL = vi.fn((made: Blob) => {
      blob = made
      return 'blob:questions'
    })
    URL.revokeObjectURL = vi.fn()
    await click(panel, 'Export')
    const text = await blob!.text()
    const read = importText(text)
    expect(read.ok && exportText(read.questions)).toBe(text)
    expect(JSON.parse(text)).toEqual([
      { type: 'multiple_choice', payload: { prompt: 'Named', options: ['Hans', 'Bartender'], answer_index: 1 }, random_event: 'genie' },
    ])
  })

  it('replaces the list with an imported file', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'Old')
    const file: CustomQuestion[] = [
      { type: 'free_text', payload: { prompt: 'New', accepted: ['Fluffs'] }, random_event: 'bob' },
    ]
    await chooseFile(panel, exportText(file))
    await waitFor(() => expect(listed(panel)).toEqual(['New']))
    expect(panel.textContent).toContain('Type the answer · Bob')
    expect(await submitted()).toEqual(file)
  })

  it('refuses a bad file with a readable message and changes nothing', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'Kept')
    const bad = [
      { type: 'multiple_choice', payload: { prompt: 'Q', options: ['A', 'B'], answer_index: 0 }, random_event: 'zezima' },
    ]
    await chooseFile(panel, JSON.stringify(bad))
    const alert = await within(panel).findByRole('alert')
    expect(alert.textContent).toContain('Nothing was imported')
    expect(alert.textContent).toContain('Question 1, NPC: “zezima” is not an NPC this game knows.')
    expect(listed(panel)).toEqual(['Kept'])
  })

  it('refuses a file with more questions than the room has events for', async () => {
    const panel = await loaded()
    const three = ['A', 'B', 'C'].map((prompt) => ({
      type: 'multiple_choice',
      payload: { prompt, options: ['x', 'y'], answer_index: 0 },
    }))
    await chooseFile(panel, JSON.stringify(three))
    const alert = await within(panel).findByRole('alert')
    expect(alert.textContent).toContain('This file has 3 questions.')
    expect(listed(panel)).toEqual([])
  })
})
