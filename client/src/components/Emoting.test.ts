/** Overhead text: the line shows over the pet that sent it, acted out, and never clipped. */

import { cleanup, render } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMOTE_MS, clearEmotes, noteEmote } from '../lib/emotes'
import type { PlayerView } from '../lib/protocol'
import emotingSource from './Emoting.svelte?raw'
import Hiscores from './Hiscores.svelte'
import hiscoresSource from './Hiscores.svelte?raw'
import questionTableSource from './QuestionTable.svelte?raw'
import RevealTally from './RevealTally.svelte'
import revealTallySource from './RevealTally.svelte?raw'
import rosterPetSource from './RosterPet.svelte?raw'
import TablePet from './TablePet.svelte'
import tablePetSource from './TablePet.svelte?raw'
import tablePanelSource from './TablePanel.svelte?raw'

const WOOX: PlayerView = {
  id: 'woox',
  display_name: 'Woox',
  avatar: null,
  role: 'player',
  team: null,
  connected: true,
  ready: false,
  editing: false,
  item: null,
}

afterEach(() => {
  cleanup()
  clearEmotes()
  vi.useRealTimers()
})

describe('Emoting', () => {
  it("shows the line over the sender's pet while its chathead acts the emote out", async () => {
    vi.useFakeTimers()
    const { container } = render(TablePet, { player: WOOX })
    expect(container.querySelector('.say')).toBeNull()
    noteEmote({ t: 'emote', player_id: 'woox', emote: 'angry', line: 1 }, null)
    await vi.advanceTimersByTimeAsync(0)
    const say = container.querySelector('.say')
    expect(say?.textContent?.replace(/\s+/g, '')).toBe('saysGrrr!')
    expect(say?.classList.contains('red')).toBe(true)
    expect(say?.classList.contains('shake')).toBe(true)
    expect(container.querySelector('.act')?.getAttribute('data-motion')).toBe('jolt')
    await vi.advanceTimersByTimeAsync(EMOTE_MS)
    expect(container.querySelector('.say')).toBeNull()
    expect(container.querySelector('.act')?.hasAttribute('data-motion')).toBe(false)
  })

  it("shows nothing over another player's pet", async () => {
    vi.useFakeTimers()
    const { container } = render(TablePet, { player: WOOX })
    noteEmote({ t: 'emote', player_id: 'lynx', emote: 'wave', line: 0 }, null)
    await vi.advanceTimersByTimeAsync(0)
    expect(container.querySelector('.say')).toBeNull()
  })

  it("plays over a hiscores row's chathead", async () => {
    vi.useFakeTimers()
    const row = (player_id: string, rank: number) => ({
      player_id,
      display_name: player_id,
      avatar: null,
      points: 1000 - rank,
      rank,
      points_gained: 0,
      previous_rank: rank,
    })
    const { container } = render(Hiscores, {
      rows: [row('zezima', 1), row('woox', 2)],
      instant: true,
    })
    noteEmote({ t: 'emote', player_id: 'woox', emote: 'cheer', line: 0 }, null)
    await vi.advanceTimersByTimeAsync(0)
    const says = [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('.say'))
    expect(says[0]).toBeNull()
    expect(says[1]?.textContent?.replace(/\s+/g, '')).toBe('saysGz!')
  })

  it("plays over a chathead beside each name in a desktop reveal's results", async () => {
    vi.useFakeTimers()
    const result = (correct: boolean) => ({
      value: correct ? 0 : 1,
      correct,
      credit: correct ? 1 : 0,
      points: correct ? 900 : 0,
      item_points: 0,
      item: null,
      by_book: false,
    })
    const names: Record<string, string> = { woox: 'Woox', lynx: 'Lynx' }
    const { container } = render(RevealTally, {
      type: 'multiple_choice',
      reveal: { options: ['A', 'B'], answer_index: 0 },
      results: { woox: result(true), lynx: result(false) },
      nameOf: (id: string) => names[id] ?? null,
      youId: null,
      showNames: true,
      panel: true,
      petOf: () => '',
    })
    expect(container.querySelectorAll('.names .who .pet')).toHaveLength(2)
    noteEmote({ t: 'emote', player_id: 'lynx', emote: 'angry', line: 0 }, null)
    await vi.advanceTimersByTimeAsync(0)
    const says = container.querySelectorAll('.say')
    expect(says).toHaveLength(1)
    expect(says[0]?.closest('.who')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'says Rigged! Lynx',
    )
  })

  it('draws no chatheads in the results without pets to draw', () => {
    const { container } = render(RevealTally, {
      type: 'multiple_choice',
      reveal: { options: ['A', 'B'], answer_index: 0 },
      results: {},
      unanswered: ['woox'],
      nameOf: () => 'Woox',
      youId: null,
      showNames: true,
      panel: true,
    })
    expect(container.querySelector('.names')).toBeTruthy()
    expect(container.querySelector('.names .pet')).toBeNull()
  })

  it('holds the text and chathead still under reduced motion', () => {
    const reduced = emotingSource.slice(emotingSource.indexOf('prefers-reduced-motion'))
    expect(reduced).toMatch(/\.act,\s*\.letter,\s*\.say\s*\{\s*animation: none !important;/)
  })

  it('sits in nothing that hides its overflow', () => {
    const around: [string, string[]][] = [
      [emotingSource, ['.emoting', '.act']],
      [tablePetSource, ['.table-pet', '.face']],
      [rosterPetSource, ['.roster-pet', '.face']],
      [tablePanelSource, ['.table-panel', '.group', '.team', '.pets', '.pets li', '.tile']],
      [questionTableSource, ['.strip', '.faces', '.face']],
      [hiscoresSource, ['td', '.name', '.who']],
      [revealTallySource, ['.results', '.rows', '.row', '.names', '.names.pets', '.pets .who']],
    ]
    for (const [source, selectors] of around) {
      for (const selector of selectors) {
        const start = source.indexOf(`\n  ${selector} {`)
        expect(start, selector).toBeGreaterThan(-1)
        expect(source.slice(start, source.indexOf('}', start)), selector).not.toMatch(
          /overflow[-a-z]*: (hidden|clip|auto|scroll)/,
        )
      }
    }
  })
})
