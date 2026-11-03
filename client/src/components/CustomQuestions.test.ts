/**
 * The host's question bank on Create's Random events step: written, edited, moved, ticked
 * and deleted, kept in the browser, saved to a file and added to from one, and the ticked
 * ones sent with the room only when every one of them fits a random-event slot.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { exportText, importText, type CustomQuestion } from '../lib/customQuestions'
import { profile } from '../lib/profile'
import { ASKERS } from '../lib/randomEvents'
import { BANK_MAX, loadBank, saveBank, type Banked } from '../lib/savedQuestions'
import Create from '../routes/Create.svelte'

// Two rounds of ten: 20 round questions, so 1 event at Less, 2 at Default, 4 at More.
const PACING: api.ModePacing[] = [
  {
    id: 'more_less',
    types: ['more_less'],
    questions: { default: 10, min: 1, max: 30 },
    seconds: null,
    as_of: null,
  },
  {
    id: 'price_is_right',
    types: ['price_is_right'],
    questions: { default: 10, min: 1, max: 30 },
    seconds: null,
    as_of: null,
  },
  { id: 'custom', types: [], questions: null, seconds: null, as_of: null },
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
    player: {
      id: 'p',
      display_name: 'Zezima',
      role: 'admin',
      connected: false,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
    },
  })
  profile.set({ name: 'Zezima', pet: 'aggy' })
})

afterEach(cleanup)

async function loaded(): Promise<HTMLElement> {
  render(Create, { navigate: () => {} })
  await screen.findByRole('checkbox', { name: /^More or Less/ })
  for (const name of ['More or Less', 'The Price is Right']) {
    await fireEvent.click(screen.getByRole('checkbox', { name }))
  }
  await fireEvent.click(screen.getByRole('tab', { name: /· Random events/ }))
  return screen.getByRole('region', { name: 'Write your own' })
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
  await fireEvent.click(within(group).getByRole('radio', { name: new RegExp(`^${label}`) }))
}

function askers(scope: HTMLElement): HTMLElement {
  return within(scope).getByRole('radiogroup', { name: 'Who asks it' })
}

/** Writes a multiple-choice question with two answers, the second one right, asked by `npc` if named. */
async function writeChoice(panel: HTMLElement, prompt: string, npc = ''): Promise<void> {
  await click(panel, 'Write a question')
  const form = editor()
  await type(form, 'Question', prompt)
  await type(form, 'Answer 1', 'Hans')
  await type(form, 'Answer 2', 'Bartender')
  await pick(form, 'Answer 2 is right')
  if (npc !== '') await pick(askers(form), npc)
  await click(form, 'Add question')
}

async function submitted(): Promise<CustomQuestion[]> {
  await fireEvent.click(screen.getByRole('button', { name: 'Open the doors' }))
  await waitFor(() => expect(api.createRoom).toHaveBeenCalledOnce())
  return vi.mocked(api.createRoom).mock.calls[0]![5] as CustomQuestion[]
}

function listed(panel: HTMLElement): string[] {
  return [...panel.querySelectorAll('.list .prompt')].map((node) => node.textContent ?? '')
}

function tick(panel: HTMLElement, place: number): HTMLInputElement {
  return within(panel).getByRole('checkbox', { name: `Use question ${place} in this room` })
}

function ticks(panel: HTMLElement): boolean[] {
  return within(panel)
    .queryAllByRole('checkbox', { name: /^Use question/ })
    .map((box) => (box as HTMLInputElement).checked)
}

function question(prompt: string): CustomQuestion {
  return { type: 'multiple_choice', payload: { prompt, options: ['x', 'y'], answer_index: 0 } }
}

function banked(prompt: string, used = true): Banked {
  return { question: question(prompt), used }
}

function chooseFile(panel: HTMLElement, text: string): Promise<boolean> {
  const input = panel.querySelector<HTMLInputElement>('input[type=file]')!
  return fireEvent.change(input, { target: { files: [new File([text], 'questions.json')] } })
}

describe('CustomQuestions', () => {
  it('writes a matching question in its own form, edits it there and sends it', async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
    await pick(editor(), 'Match them up')
    let form = editor()
    expect(within(form).queryByRole('textbox', { name: 'Picture of field 1' })).toBeNull()
    await type(form, 'Question', 'Match each boss to its lair.')
    const bosses = ['Zulrah', 'Vorkath', 'Kraken']
    const lairs = ['Zul-Andra', 'Ungael', 'Kraken Cove']
    for (const [i, boss] of bosses.entries()) {
      await type(form, `Field ${i + 1}`, boss)
      await type(form, `Answer for field ${i + 1}`, lairs[i]!)
    }
    await click(form, 'Add a left-over answer')
    await type(form, 'Left-over answer 1', 'Lithkren Vault')
    await click(form, 'Add question')
    expect(listed(panel)).toEqual(['Match each boss to its lair.'])
    expect(panel.textContent).toContain('Match them up · Random NPC')

    await click(panel, 'Edit question 1')
    form = editor()
    expect((within(form).getByRole('textbox', { name: 'Field 2' }) as HTMLInputElement).value).toBe(
      'Vorkath',
    )
    await click(form, 'Save question')
    const [sent] = await submitted()
    expect(sent).toEqual({
      type: 'matching',
      payload: {
        prompt: 'Match each boss to its lair.',
        fields: bosses.map((text) => ({ text })),
        options: [...lairs, 'Lithkren Vault'].map((text) => ({ text })),
        answer: [0, 1, 2],
      },
    })
  })

  it('adds, edits, deletes and reorders all three types, and sends them in that order', async () => {
    const panel = await loaded()
    await setFrequency('More')

    await writeChoice(panel, 'Who runs the inn?')

    await click(panel, 'Write a question')
    let form = editor()
    await pick(form, 'Type the answer')
    await type(form, 'Question', 'Name the cat')
    await type(form, 'Accepted answer 1', 'Fluffs')
    await click(form, 'Add another spelling')
    await type(form, 'Accepted answer 2', 'Fluffy')
    await click(form, 'Add question')

    await click(panel, 'Write a question')
    form = editor()
    await pick(form, 'Closest number')
    await type(form, 'Question', 'Zulrah kills for a pet?')
    await type(form, 'Answer', '4000')
    await type(form, 'Unit, if any', 'kills')
    await click(form, 'Add question')

    await click(panel, 'Write a question')
    await type(editor(), 'Question', 'To be removed')
    await type(editor(), 'Answer 1', 'A')
    await type(editor(), 'Answer 2', 'B')
    await click(editor(), 'Add question')
    expect(listed(panel)).toHaveLength(4)
    await click(panel, 'Delete question 4')
    await click(screen.getByRole('dialog'), 'Delete')

    await click(panel, 'Edit question 2')
    await click(editor(), 'Remove accepted answer 2')
    await click(editor(), 'Save question')

    await click(panel, 'Move question 3 earlier')
    expect(listed(panel)).toEqual(['Who runs the inn?', 'Zulrah kills for a pet?', 'Name the cat'])

    expect(await submitted()).toEqual([
      {
        type: 'multiple_choice',
        payload: { prompt: 'Who runs the inn?', options: ['Hans', 'Bartender'], answer_index: 1 },
      },
      {
        type: 'closest_number',
        payload: { prompt: 'Zulrah kills for a pet?', answer: 4000, unit: 'kills' },
      },
      { type: 'free_text', payload: { prompt: 'Name the cat', accepted: ['Fluffs'] } },
    ])
  })

  it('writes a slider, refused without its ends, its scale defaulting by their ratio', async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
    const form = editor()
    await pick(form, 'Slider')
    await type(form, 'Question', 'How many Hitpoints does the Corporeal Beast have?')
    await type(form, 'Answer', '2000')
    await click(form, 'Add question')
    expect(within(form).getAllByText('Required.').length).toBeGreaterThan(0)
    expect(listed(panel)).toHaveLength(0)

    const scale = (name: string) => within(form).getByRole('radio', { name }) as HTMLInputElement
    await type(form, 'Lowest', '100')
    await type(form, 'Highest', '1000')
    expect(scale('Linear').checked).toBe(true)
    await type(form, 'Highest', '10000')
    expect(scale('Log').checked).toBe(true)
    await click(form, 'Add question')

    expect(await submitted()).toEqual([
      {
        type: 'number_slider',
        payload: {
          prompt: 'How many Hitpoints does the Corporeal Beast have?',
          answer: 2000,
          min: 100,
          max: 10000,
          scale: 'log',
        },
      },
    ])
  })

  it('writes a pick all that apply, starting at three answers, with picks only when asked', async () => {
    const panel = await loaded()
    await setFrequency('More')
    await click(panel, 'Write a question')
    let form = editor()
    await pick(form, 'Pick all that apply')
    await type(form, 'Question', 'Which of these are demons?')
    for (const [i, name] of ['Hellhound', 'Gargoyle', 'Imp'].entries())
      await type(form, `Answer ${i + 1}`, name)
    await click(form, 'Add question')
    expect(within(form).getByText('Tick at least one right answer.')).toBeTruthy()
    for (const name of ['Answer 3 is right', 'Answer 1 is right']) {
      await fireEvent.click(within(form).getByRole('checkbox', { name }))
    }
    await fireEvent.click(
      within(form).getByRole('checkbox', { name: 'Tell players how many are right' }),
    )
    await click(form, 'Add question')

    await click(panel, 'Edit question 1')
    form = editor()
    expect(within(form).getByRole('button', { name: 'Remove answer 2' })).toHaveProperty(
      'disabled',
      true,
    )
    await click(form, 'Add an answer')
    await type(form, 'Answer 4', 'Black demon')
    await fireEvent.click(within(form).getByRole('checkbox', { name: 'Answer 1 is right' }))
    await click(form, 'Remove answer 1')
    await fireEvent.click(
      within(form).getByRole('checkbox', { name: 'Tell players how many are right' }),
    )
    await click(form, 'Save question')

    expect(await submitted()).toEqual([
      {
        type: 'pick_all_that_apply',
        payload: {
          prompt: 'Which of these are demons?',
          options: ['Gargoyle', 'Imp', 'Black demon'],
          answer_indices: [1],
        },
      },
    ])
  })

  it('starts the NPC picker on a random NPC, and sends no random_event for a question left on it', async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
    const faces = within(askers(editor())).getAllByRole('radio')
    expect(faces.map((face) => face.getAttribute('aria-label'))).toEqual([
      'A random NPC',
      ...ASKERS.map((npc) => npc.name),
    ])
    expect(faces.map((face) => face.getAttribute('aria-label'))).not.toContain('Certer')
    expect(faces[0]).toHaveProperty('checked', true)
    await click(editor(), 'Cancel')

    await writeChoice(panel, 'Left to the draw')
    await writeChoice(panel, 'Named', 'Death')
    const [random, named] = await submitted()
    expect(random).not.toHaveProperty('random_event')
    expect(named!.random_event).toBe('death')
  })

  it("previews the chosen NPC's card with the question, and the Mysterious Old Man for Random", async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
    const form = editor()
    const preview = within(form).getByRole('region', { name: 'Preview' })
    expect(within(preview).getByRole('heading', { name: 'Mysterious Old Man' })).toBeTruthy()
    await type(form, 'Question', 'Who runs the inn?')
    await type(form, 'Answer 1', 'Hans')
    await pick(askers(form), 'Reldo')
    expect(within(preview).getByRole('heading', { name: 'Reldo' })).toBeTruthy()
    expect(preview.textContent).toContain('Who runs the inn?')
    expect(within(preview).getByRole('button', { name: /Hans/ })).toBeTruthy()
  })

  it('names the picked NPC beside the label, keeps its theme for hover, and reopens on it', async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
    let form = editor()
    const asker = () => form.querySelector('.asker')!.textContent!.trim()
    expect(asker()).toBe('Who asks it · A random NPC')
    const bob = within(askers(form)).getByRole('radio', { name: 'Evil Bob' })
    expect(bob.closest('label')!.title).toBe('Evil Bob: Fishing, and cats')
    await fireEvent.click(bob)
    expect(asker()).toBe('Who asks it · Evil Bob')
    await click(form, 'Cancel')

    await writeChoice(panel, 'Named', 'Death')
    await click(panel, 'Edit question 1')
    form = editor()
    expect(within(askers(form)).getByRole('radio', { name: 'Death' })).toHaveProperty(
      'checked',
      true,
    )
    expect(asker()).toBe('Who asks it · Death')
  })

  it('draws each answer in the gem of its place and marks the right one instead of a remove button', async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
    const form = editor()
    await click(form, 'Add an answer')
    const rows = () => [...form.querySelectorAll<HTMLElement>('.answer')]
    expect(rows().map((row) => row.style.getPropertyValue('--fill'))).toEqual([
      'var(--gem-sapphire)',
      'var(--gem-emerald)',
      'var(--gem-ruby)',
    ])
    const marked = () => rows().map((row) => row.querySelector('.mark')?.textContent ?? '')
    expect(marked()).toEqual(['Right', '', ''])
    expect(within(form).queryByRole('button', { name: 'Remove answer 1' })).toBeNull()

    await pick(form, 'Answer 3 is right')
    expect(marked()).toEqual(['', '', 'Right'])
    expect(within(form).queryByRole('button', { name: 'Remove answer 3' })).toBeNull()
    expect(within(form).getByRole('button', { name: 'Remove answer 1' })).toBeTruthy()

    await pick(form, 'Pick all that apply')
    await fireEvent.click(within(form).getByRole('checkbox', { name: 'Answer 2 is right' }))
    expect(marked()).toEqual(['', 'Right', ''])
    expect(rows()[1]!.classList.contains('right')).toBe(true)
  })

  it('starts clean, shows a limit next to its field as it is broken, and what is missing only on Add', async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
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
    await click(panel, 'Write a question')
    for (let i = 0; i < 4; i++) await click(editor(), 'Add an answer')
    expect(
      (within(editor()).getByRole('button', { name: 'Add an answer' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    await pick(editor(), 'Type the answer')
    for (let i = 0; i < 19; i++) await click(editor(), 'Add another spelling')
    expect(
      (within(editor()).getByRole('button', { name: 'Add another spelling' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    // Two dozen clicks and renders; the self-hosted runner needs more than the default 5 s.
  }, 10_000)

  it('saves the question on Enter in a field rather than creating the room', async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
    const form = editor()
    await type(form, 'Question', 'Who runs the inn?')
    await type(form, 'Answer 1', 'Hans')
    await type(form, 'Answer 2', 'Bartender')
    await fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Answer 2' }), {
      key: 'Enter',
    })
    expect(listed(panel)).toEqual(['Who runs the inn?'])
    expect(api.createRoom).not.toHaveBeenCalled()
  })

  it('will not create the room while a question is open and unsaved', async () => {
    const panel = await loaded()
    await click(panel, 'Write a question')
    const create = screen.getByRole('button', { name: 'Open the doors' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    expect(document.body.textContent).toContain('Add or cancel the question you are writing')
    await click(editor(), 'Cancel')
    expect(create.disabled).toBe(false)
  })

  it('stops ticking at the event cap, banks a new question unticked, and says More would allow more', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'One')
    await writeChoice(panel, 'Two')
    expect(panel.textContent).toContain('Every random event is already one of yours.')
    expect(panel.textContent).toContain('pick More frequency')
    await writeChoice(panel, 'Three')
    expect(listed(panel)).toEqual(['One', 'Two', 'Three'])
    expect(ticks(panel)).toEqual([true, true, false])
    expect(tick(panel, 3).disabled).toBe(true)
    await setFrequency('More')
    expect(tick(panel, 3).disabled).toBe(false)
  })

  it('warns past the event cap, leaving the doors free to open, naming the count, the limit and the frequency', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'One')
    await writeChoice(panel, 'Two')
    await setFrequency('Less')
    const message =
      'Your rounds make room for 1 random event at Less frequency, and you have 2 questions of your own. More frequency would make room for 4.'
    expect(panel.querySelector('.error')?.textContent).toBe(message)
    expect(screen.getAllByText(message)).toHaveLength(2)
    await setFrequency('Default')
    expect(screen.queryByText(message)).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Open the doors' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('exports the list as the file Import reads', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'Named', 'Genie')
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
      {
        type: 'multiple_choice',
        payload: { prompt: 'Named', options: ['Hans', 'Bartender'], answer_index: 1 },
        random_event: 'genie',
      },
    ])
  })

  it('adds an imported file to the bank, unticked, skipping questions already in it', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'Old')
    const old: CustomQuestion = {
      type: 'multiple_choice',
      payload: { prompt: 'Old', options: ['Hans', 'Bartender'], answer_index: 1 },
    }
    const file: CustomQuestion[] = [
      old,
      { type: 'free_text', payload: { prompt: 'New', accepted: ['Fluffs'] }, random_event: 'bob' },
    ]
    await chooseFile(panel, exportText(file))
    await waitFor(() => expect(listed(panel)).toEqual(['Old', 'New']))
    expect(ticks(panel)).toEqual([true, false])
    expect(panel.textContent).toContain('Type the answer · Evil Bob')
    expect(panel.textContent).toContain('Added 1 question, unticked; 1 was already in your list.')
    await chooseFile(panel, exportText(file))
    await within(panel).findByText('Every question in this file is already in your list.')
    expect(listed(panel)).toEqual(['Old', 'New'])
    await fireEvent.click(tick(panel, 2))
    expect(await submitted()).toEqual(file)
  })

  it('refuses a bad file with a readable message and changes nothing', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'Kept')
    const bad = [
      {
        type: 'multiple_choice',
        payload: { prompt: 'Q', options: ['A', 'B'], answer_index: 0 },
        random_event: 'zezima',
      },
    ]
    await chooseFile(panel, JSON.stringify(bad))
    await within(panel).findByText(/Nothing was imported/)
    const alert = panel.querySelector('.banner')!
    expect(alert.textContent).toContain('Nothing was imported')
    expect(alert.textContent).toContain('Question 1, NPC: “zezima” is not an NPC this game knows.')
    expect(listed(panel)).toEqual(['Kept'])
  })

  it(`refuses a file that would take the bank past ${BANK_MAX} questions`, async () => {
    saveBank(Array.from({ length: BANK_MAX - 2 }, (_, i) => banked(`Q${i}`, false)))
    const panel = await loaded()
    const three = ['A', 'B', 'C'].map((prompt) => question(prompt))
    await chooseFile(panel, JSON.stringify(three))
    await within(panel).findByText(/Nothing was imported/)
    expect(panel.querySelector('.banner')!.textContent).toContain(
      `This file has 3 new questions, and your list has room for 2 more of the ${BANK_MAX} it keeps.`,
    )
    expect(listed(panel)).toHaveLength(BANK_MAX - 2)
  })

  it(`stops writing at ${BANK_MAX} questions`, async () => {
    saveBank(Array.from({ length: BANK_MAX }, (_, i) => banked(`Q${i}`, false)))
    const panel = await loaded()
    const write = within(panel).getByRole('button', { name: 'Write a question' })
    expect((write as HTMLButtonElement).disabled).toBe(true)
    expect(panel.textContent).toContain(
      `Saved in this browser for your next room, ${BANK_MAX} at most.`,
    )
  })

  it('sends only the ticked questions, in bank order', async () => {
    const panel = await loaded()
    await setFrequency('More')
    for (const prompt of ['A', 'B', 'C']) await writeChoice(panel, prompt)
    await fireEvent.click(tick(panel, 2))
    expect(ticks(panel)).toEqual([true, false, true])
    expect((await submitted()).map((q) => q.payload.prompt)).toEqual(['A', 'C'])
  })

  it('unticks every question at once and keeps them all in the bank', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'A')
    await writeChoice(panel, 'B')
    await click(panel, 'Untick all')
    expect(ticks(panel)).toEqual([false, false])
    expect(listed(panel)).toEqual(['A', 'B'])
    expect(within(panel).queryByRole('button', { name: 'Untick all' })).toBeNull()
    expect(await submitted()).toEqual([])
  })

  it('keeps the bank and its ticks in this browser, so the next Create starts with them', async () => {
    let panel = await loaded()
    await writeChoice(panel, 'First', 'Genie')
    await writeChoice(panel, 'Second')
    await fireEvent.click(tick(panel, 2))
    expect(panel.textContent).toContain('Saved in this browser for your next room.')
    await submitted()
    cleanup()
    panel = await loaded()
    expect(listed(panel)).toEqual(['First', 'Second'])
    expect(ticks(panel)).toEqual([true, false])
    expect(panel.textContent).toContain('Multiple choice · Genie')
  })

  it('leaves out a saved question the rules no longer pass, and says so', async () => {
    saveBank([
      {
        question: { type: 'free_text', payload: { prompt: 'Kept', accepted: ['Fluffs'] } },
        used: true,
      },
      {
        question: {
          type: 'free_text',
          payload: { prompt: 'Gone', accepted: ['Fluffs'] },
          random_event: 'zezima',
        },
        used: true,
      },
    ])
    const panel = await loaded()
    expect(listed(panel)).toEqual(['Kept'])
    expect(panel.textContent).toContain('1 saved question no longer works and was removed.')
    expect(loadBank()).toEqual({ bank: [expect.anything()], dropped: 0 })
  })

  it('loads a bank ticked past these rounds and says so until it fits', async () => {
    saveBank(['A', 'B', 'C'].map((prompt) => banked(prompt)))
    const panel = await loaded()
    expect(ticks(panel)).toEqual([true, true, true])
    expect(panel.textContent).toContain('you have 3 questions of your own')
    await fireEvent.click(tick(panel, 3))
    expect(panel.textContent).not.toContain('you have 3 questions of your own')
  })

  it('deletes a question, here and in the browser, only once the host confirms', async () => {
    const panel = await loaded()
    await writeChoice(panel, 'Doomed')
    await writeChoice(panel, 'Kept')
    await click(panel, 'Delete question 1')
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(listed(panel)).toEqual(['Doomed', 'Kept'])
    await click(panel, 'Delete question 1')
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Delete “Doomed” from your questions? It can’t be undone.')
    await click(dialog, 'Delete')
    expect(listed(panel)).toEqual(['Kept'])
    expect(loadBank().bank.map((entry) => entry.question.payload.prompt)).toEqual(['Kept'])
  })
})
