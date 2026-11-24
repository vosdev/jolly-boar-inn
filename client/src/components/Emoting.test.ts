/** Overhead text: the line shows over the pet that sent it, acted out, and never clipped. */

import { cleanup, render } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMOTE_MS, clearEmotes, noteEmote } from '../lib/emotes'
import type { PlayerView } from '../lib/protocol'
import emotingSource from './Emoting.svelte?raw'
import questionTableSource from './QuestionTable.svelte?raw'
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
