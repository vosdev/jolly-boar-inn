/**
 * The answers sized to the question (design.md §10): on the desktop frame's wide stage and
 * on a phone. jsdom lays nothing out and knows no container queries, so each layout is
 * read from the rules the component ships and from the DOM those rules select.
 */

import { render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { describe, expect, it } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import dragLayout from './DragLayout.svelte?raw'
import GemChoices from './GemChoices.svelte'
import gemChoices from './GemChoices.svelte?raw'
import Question from './Question.svelte'
import moreLess from './types/MoreLess.svelte?raw'

/** The style block, split at its container query: what holds everywhere, and on a wide stage. */
function styles(source: string): { base: string; wide: string } {
  const css = source.slice(source.indexOf('<style>'))
  const at = css.indexOf('@container (min-width: 40rem)')
  return { base: at < 0 ? css : css.slice(0, at), wide: at < 0 ? '' : css.slice(at) }
}

/** The declarations of the first rule for `selector` in `css`. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(?:^|\\n)\\s*${escaped} \\{([^}]*)\\}`))?.[1] ?? ''
}

/** How many gems stand in a row when each spans `rule`'s tracks of the grid's six. */
function abreast(declarations: string): number {
  const span = Number(declarations.match(/grid-column: span (\d+)/)?.[1])
  return 6 / span
}

function question(type: string, mode: string, view: Record<string, unknown>): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 5,
    type,
    mode,
    segment: { mode, index: 0, total: 1, start: 0, count: 5 },
    view,
    random_event: null,
    opened_at: new Date().toISOString(),
    answerable_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 20_000).toISOString(),
    you_can_answer: true,
    picture: null,
    answered: 0,
    of: 0,
    waiting: [],
    item_used: false,
  }
}

describe('six choices', () => {
  const label = createRawSnippet((option: () => string) => ({
    render: () => `<span>${option()}</span>`,
  }))

  function six() {
    return render(GemChoices<string>, {
      options: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'],
      picked: new Set<number>(),
      answer: new Set<number>(),
      revealed: false,
      canAnswer: true,
      onAnswer: () => {},
      label,
    })
  }

  it('stand three rows of two on a phone', () => {
    const { container } = six()
    const gems = container.querySelector('.gems')!
    expect(gems.classList.contains('odd')).toBe(false)
    expect(abreast(rule(styles(gemChoices).base, '.gems:not(.settled) > :global(*)'))).toBe(2)
  })

  it('stand two rows of three on a desktop, at least 84px tall', () => {
    const { container } = six()
    const gems = container.querySelector('.gems')!
    expect(gems.classList.contains('pairs')).toBe(false)
    const wide = rule(styles(gemChoices).wide, '.gems:not(.settled) > :global(*)')
    expect(abreast(wide)).toBe(3)
    expect(wide).toContain('min-height: 84px')
  })

  it('go two abreast for four on a desktop, and centre the last two of five', () => {
    const wide = styles(gemChoices).wide
    expect(abreast(rule(wide, '.pairs:not(.settled) > :global(*)'))).toBe(2)
    expect(rule(wide, '.five:not(.settled) > :global(:nth-child(4))')).toContain(
      'grid-column: 2 / span 2',
    )
  })
})

describe('More or Less', () => {
  const VIEW = {
    metric: 'ge_price',
    direction: 'more',
    options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
    as_of: '2026-09-01',
  }

  it('puts "or" between the two items, unread', () => {
    render(Question, {
      question: question('more_less', 'more_less', VIEW),
      yourValue: null,
      onAnswer: () => {},
    })
    const or = document.querySelector('.choices .or')!
    expect(or.getAttribute('aria-hidden')).toBe('true')
    const [first, second] = screen.getAllByRole('button')
    expect(first!.compareDocumentPosition(or) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(or.compareDocumentPosition(second!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sizes the items to themselves on a desktop, no taller than 260px', () => {
    const wide = styles(moreLess).wide
    expect(rule(wide, '.choices')).toContain('minmax(0, 16rem) auto minmax(0, 16rem)')
    expect(rule(wide, '.choices > :global(.gem)')).toContain('max-height: 260px')
  })
})

describe('Sort It Out', () => {
  const VIEW = {
    prompt: 'Put these metals in order.',
    ends: ['Weakest', 'Strongest'],
    entries: ['Mithril', 'Bronze', 'Adamant'].map((text) => ({ text })),
  }

  it('sets Submit beside the list on a desktop, under the instruction', () => {
    render(Question, {
      question: question('ordering', 'ordering', VIEW),
      yourValue: null,
      onAnswer: () => {},
    })
    const submit = screen.getByRole('button', { name: 'Submit' })
    expect(submit.closest('.drag > .actions')).not.toBeNull()
    expect(document.querySelector('.drag > .list .entries')).not.toBeNull()
    expect(document.querySelector('.drag > .ask')?.textContent).toContain('Drag into order')
    const wide = styles(dragLayout).wide
    expect(rule(wide, '.list')).toContain('grid-column: 1')
    expect(rule(wide, '.actions')).toContain('grid-column: 2')
    expect(rule(wide, '.ask')).toContain('grid-column: 2')
  })
})

describe('ScapeRune', () => {
  const VIEW = {
    prompt: 'Rush\nBurst\nBlitz\nBarrage',
    options: ['First question?', 'Second question?', 'Third question?', 'Fourth question?'],
  }

  it('stacks its questions on a phone, and stands them two abreast on a desktop', () => {
    render(Question, {
      question: question('multiple_choice', 'scaperune', VIEW),
      yourValue: null,
      onAnswer: () => {},
    })
    const gems = document.querySelector('.gems')!
    expect(gems.classList.contains('stacked')).toBe(true)
    expect(gems.classList.contains('pairs')).toBe(true)
    expect(rule(styles(gemChoices).base, '.stacked:not(.settled) > :global(*)')).toContain(
      'grid-column: 1 / -1',
    )
    expect(abreast(rule(styles(gemChoices).wide, '.pairs:not(.settled) > :global(*)'))).toBe(2)
  })

  it('keeps its reveal to one column on a phone, and only its own', () => {
    const css = gemChoices.slice(gemChoices.indexOf('<style>'))
    expect(rule(css, '.stacked.settled')).toContain('minmax(0, 1fr)')
    render(Question, {
      question: question('multiple_choice', 'who_said_that', VIEW),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(document.querySelectorAll('.gems.stacked')).toHaveLength(0)
  })

  it('numbers an ordered answer, one entry a line, and leaves a single answer plain', () => {
    render(Question, {
      question: question('multiple_choice', 'scaperune', VIEW),
      yourValue: null,
      onAnswer: () => {},
    })
    const entries = [...document.querySelectorAll('ol.board li')].map((li) => li.textContent)
    expect(entries).toEqual(['Rush', 'Burst', 'Blitz', 'Barrage'])
    render(Question, {
      question: question('multiple_choice', 'scaperune', { ...VIEW, prompt: 'Zaff' }),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(document.querySelector('p.board')?.textContent).toBe('Zaff')
  })
})
