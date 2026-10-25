/**
 * `pick_from_list` on screen: the strict combobox. Typed text with no
 * selection leaves Submit disabled; selecting enables it; editing the text after selecting
 * clears the selection; no match selects nothing and says so; the value sent is the entry's
 * id; and all of it works from the keyboard alone.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { clearVocabCache } from '../../lib/vocab'
import Question from './Question.svelte'

const ENTRIES = [
  { id: 4151, name: 'Abyssal whip' },
  { id: 12006, name: 'Abyssal tentacle' },
  { id: 4587, name: 'Dragon scimitar' },
  { id: 1333, name: 'Rune scimitar' },
  { id: 6585, name: 'Amulet of fury' },
]

const VIEW = { prompt: 'A very powerful onyx amulet.', vocab: 'items' }
const REVEAL = {
  ...VIEW,
  answer_id: 6585,
  subject: { name: 'Amulet of fury', asset: 'item:6585' },
}

function open(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 5,
    type: 'pick_from_list',
    mode: 'guess_examine',
    segment: { mode: 'guess_examine', index: 0, total: 1, start: 0, count: 5 },
    view: VIEW,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:20Z',
    you_can_answer: true,
    picture: null,
    random_event: null,
    answered: 0,
    of: 0,
    waiting: [],
    answerable_at: '2026-09-21T20:00:00Z',
    ...overrides,
  }
}

let fetchCalls = 0

beforeEach(() => {
  fetchCalls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      fetchCalls += 1
      return new Response(JSON.stringify({ vocab: 'items', version: 'v1', entries: ENTRIES }))
    }),
  )
})

afterEach(() => {
  clearVocabCache()
  vi.unstubAllGlobals()
})

async function mount(onAnswer: (value: unknown) => void = () => {}, target?: HTMLElement) {
  render(Question, {
    props: { question: open(), yourValue: null, onAnswer },
    ...(target === undefined ? {} : { target }),
  })
  const box = (await screen.findByRole('combobox')) as HTMLInputElement
  const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
  return { box, submit }
}

const listbox = () => screen.getByRole('listbox', { hidden: true })
const options = () =>
  Array.from(listbox().querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim())
const highlighted = (box: HTMLInputElement) =>
  document.getElementById(box.getAttribute('aria-activedescendant') ?? '')?.textContent?.trim()

describe('pick_from_list', () => {
  it('shows the examine above the box, and nothing that names the answer', async () => {
    await mount()
    const examine = screen.getByText('A very powerful onyx amulet.')
    expect(examine.tagName).toBe('BLOCKQUOTE')
    expect(examine.compareDocumentPosition(screen.getByRole('combobox'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(listbox().hidden).toBe(true)
  })

  it('names the box for a screen reader, with no visible label', async () => {
    const { container } = render(Question, {
      question: open(),
      yourValue: null,
      onAnswer: () => {},
    })
    const input = await screen.findByRole('combobox', { name: 'Search the list' })
    expect(input.getAttribute('placeholder')).toBe('Start typing a name…')
    expect(container.querySelector('label')).toBeNull()
    expect(container.textContent).not.toContain('Search the list')
  })

  it('is the WAI-ARIA combobox pattern', async () => {
    const { box } = await mount()
    expect(box.getAttribute('aria-autocomplete')).toBe('list')
    expect(box.getAttribute('aria-controls')).toBe(listbox().id)
    expect(box.getAttribute('aria-expanded')).toBe('false')
    await fireEvent.focus(box)
    expect(box.getAttribute('aria-expanded')).toBe('true')
    expect(highlighted(box)).toBe('Abyssal tentacle')
    expect(listbox().querySelector('[aria-selected="true"]')?.textContent?.trim()).toBe(
      'Abyssal tentacle',
    )
  })

  it('opens the whole list, alphabetical, on focus', async () => {
    const { box } = await mount()
    await fireEvent.focus(box)
    expect(listbox().hidden).toBe(false)
    expect(options()).toEqual([
      'Abyssal tentacle',
      'Abyssal whip',
      'Amulet of fury',
      'Dragon scimitar',
      'Rune scimitar',
    ])
  })

  describe('where the list opens', () => {
    function screenOf(phone: boolean, top: number, viewportHeight: number): void {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({ matches: phone && query.includes('max-width') })),
      )
      vi.stubGlobal('visualViewport', {
        offsetTop: 0,
        height: viewportHeight,
        addEventListener: () => {},
        removeEventListener: () => {},
      })
      vi.spyOn(HTMLInputElement.prototype, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom: top + 56,
      } as DOMRect)
    }

    afterEach(() => vi.restoreAllMocks())

    it('opens below the box on a desktop', async () => {
      screenOf(false, 200, 800)
      const { box } = await mount()
      await fireEvent.focus(box)
      expect(listbox().classList.contains('above')).toBe(false)
    })

    it('opens above the box on a phone, clear of the keyboard', async () => {
      screenOf(true, 300, 400)
      const { box } = await mount()
      await fireEvent.focus(box)
      expect(listbox().classList.contains('above')).toBe(true)
      expect(listbox().style.maxHeight).toBe('288px')
    })

    it('flips below when a phone has no room above the box', async () => {
      screenOf(true, 40, 800)
      const { box } = await mount()
      await fireEvent.focus(box)
      expect(listbox().classList.contains('above')).toBe(false)
    })

    it('flips above when a desktop has no room below the box', async () => {
      screenOf(false, 700, 800)
      const { box } = await mount()
      await fireEvent.focus(box)
      expect(listbox().classList.contains('above')).toBe(true)
    })

    it('keeps the list inside a scrolling stage, so the stage never scrolls for it', async () => {
      screenOf(false, 200, 800)
      const stage = document.createElement('div')
      stage.style.overflowY = 'auto'
      vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 456 } as DOMRect)
      document.body.append(stage)
      const { box } = await mount(undefined, stage)
      await fireEvent.focus(box)
      expect(listbox().classList.contains('above')).toBe(false)
      expect(listbox().style.maxHeight).toBe('188px')
      stage.remove()
    })

    it('scrolls the page for a box the keyboard hides, never to the top', async () => {
      screenOf(true, 300, 400)
      const scroll = vi.fn()
      HTMLElement.prototype.scrollIntoView = scroll
      const { box } = await mount()
      await fireEvent.focus(box)
      expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }))
    })
  })

  it('draws at most fifty matches, and says how many more typing would find', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      name: `Item ${String(i).padStart(3, '0')}`,
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ vocab: 'items', version: 'v2', entries: many })),
      ),
    )
    const { box } = await mount()
    await fireEvent.focus(box)
    const drawn = options()
    expect(drawn).toHaveLength(51)
    expect(drawn[0]).toBe('Item 000')
    expect(drawn[49]).toBe('Item 049')
    expect(drawn[50]).toBe('70 more — keep typing to narrow the list.')
    await fireEvent.input(box, { target: { value: 'item 11' } })
    expect(options()).toEqual(Array.from({ length: 10 }, (_, i) => `Item 11${i}`))
  })

  it('filters as you type and highlights the first match', async () => {
    const { box } = await mount()
    await fireEvent.focus(box)
    await fireEvent.input(box, { target: { value: 'scim' } })
    expect(options()).toEqual(['Dragon scimitar', 'Rune scimitar'])
    expect(highlighted(box)).toBe('Dragon scimitar')
  })

  it('leaves Submit disabled for typed text with no selection', async () => {
    const { box, submit } = await mount()
    await fireEvent.focus(box)
    await fireEvent.input(box, { target: { value: 'Amulet of fury' } })
    expect(submit.disabled).toBe(true) // the whole name, typed, is still only a search
  })

  it('enables Submit on a selection, and sends the entry id, not the text', async () => {
    const onAnswer = vi.fn()
    const { box, submit } = await mount(onAnswer)
    await fireEvent.focus(box)
    await fireEvent.input(box, { target: { value: 'fury' } })
    await fireEvent.click(screen.getByRole('option', { name: 'Amulet of fury' }))
    expect(box.value).toBe('Amulet of fury')
    expect(listbox().hidden).toBe(true)
    expect(onAnswer).not.toHaveBeenCalled() // selecting is not submitting
    expect(submit.disabled).toBe(false)
    await fireEvent.click(submit)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith(6585)
  })

  it('clears the selection when the text is edited afterwards', async () => {
    const onAnswer = vi.fn()
    const { box, submit } = await mount(onAnswer)
    await fireEvent.focus(box)
    await fireEvent.click(screen.getByRole('option', { name: 'Abyssal whip' }))
    expect(submit.disabled).toBe(false)
    await fireEvent.input(box, { target: { value: 'Abyssal whi' } })
    expect(submit.disabled).toBe(true)
    await fireEvent.submit(submit.form as HTMLFormElement)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('says so when nothing matches, and selects nothing', async () => {
    const { box, submit } = await mount()
    await fireEvent.focus(box)
    await fireEvent.input(box, { target: { value: 'granite maul' } })
    expect(options()).toEqual(['Nothing in the list matches “granite maul”.'])
    expect(box.hasAttribute('aria-activedescendant')).toBe(false)
    await fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.value).toBe('granite maul')
    expect(submit.disabled).toBe(true)
  })

  it('works from the keyboard alone: arrows, Enter to pick, Escape to close', async () => {
    const onAnswer = vi.fn()
    const { box, submit } = await mount(onAnswer)
    box.focus()
    await fireEvent.focus(box)
    await fireEvent.keyDown(box, { key: 'Escape' })
    expect(listbox().hidden).toBe(true)
    await fireEvent.keyDown(box, { key: 'ArrowDown' }) // reopens, on the first entry
    expect(listbox().hidden).toBe(false)
    expect(highlighted(box)).toBe('Abyssal tentacle')
    await fireEvent.keyDown(box, { key: 'ArrowDown' })
    await fireEvent.keyDown(box, { key: 'ArrowDown' })
    await fireEvent.keyDown(box, { key: 'ArrowUp' })
    expect(highlighted(box)).toBe('Abyssal whip')
    await fireEvent.keyDown(box, { key: 'ArrowUp' })
    await fireEvent.keyDown(box, { key: 'ArrowUp' }) // clamps at the top
    expect(highlighted(box)).toBe('Abyssal tentacle')
    await fireEvent.input(box, { target: { value: 'rune' } })
    await fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.value).toBe('Rune scimitar')
    expect(onAnswer).not.toHaveBeenCalled() // Enter picks; it does not submit
    expect(listbox().hidden).toBe(true)
    submit.focus()
    await fireEvent.click(submit)
    expect(onAnswer).toHaveBeenCalledWith(1333)
  })

  it('keeps focus in the box when an option is tapped', async () => {
    const { box } = await mount()
    await fireEvent.focus(box)
    const option = screen.getByRole('option', { name: 'Rune scimitar' })
    // A mouse or touch press on an option would otherwise blur the input and close the
    // list before the click lands.
    expect(await fireEvent.pointerDown(option)).toBe(false)
  })

  it('fetches the list once for every question of the round', async () => {
    const first = render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    await screen.findByRole('combobox')
    first.unmount()
    render(Question, {
      question: open({ question_id: 'q2', index: 1 }),
      yourValue: null,
      onAnswer: () => {},
    })
    await screen.findByRole('combobox')
    expect(fetchCalls).toBe(1)
  })

  it('offers to try again when the list will not load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    )
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(await screen.findByText('The list could not be loaded.')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows what was answered, and holds the box, once an answer is in', async () => {
    render(Question, { question: open(), yourValue: 4587, onAnswer: () => {} })
    await waitFor(() => expect(screen.getByText('Dragon scimitar')).toBeTruthy())
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
  })

  it('offers no box to someone who cannot answer', async () => {
    render(Question, {
      question: open({ you_can_answer: false }),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(screen.getByText('This one is not scored for you — sit back and watch.')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('names the answer on the reveal, with our pick beside it', async () => {
    render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: 4587,
      result: { value: 4587, correct: false, credit: 0, points: 0 },
      onAnswer: () => {},
    })
    expect(screen.getByText('Amulet of fury').parentElement?.textContent).toBe(
      'It was Amulet of fury.',
    )
    await waitFor(() => expect(screen.getByText('Dragon scimitar')).toBeTruthy())
    expect(screen.getByText('Dragon scimitar').closest('p')?.classList.contains('picked')).toBe(
      true,
    )
    expect(screen.queryByText(/no points/)).toBeNull()
    expect(screen.getByText('A very powerful onyx amulet.')).toBeTruthy()
  })
})
