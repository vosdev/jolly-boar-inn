/** Sound: the stored switches, the TV rule, the autoplay unlock, and silence with no files. */

import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerView, RoomView } from './protocol'

type Audio = typeof import('./audio')
type Stores = typeof import('./stores')

function player(id: string, role: PlayerView['role'], connected = true): PlayerView {
  return {
    id,
    display_name: id,
    avatar: null,
    role,
    team: null,
    connected,
    ready: false,
    editing: false,
  }
}

/** A fresh copy of the module, as a reload would give, over whatever storage holds now. */
async function load(): Promise<{ audio: Audio; stores: Stores }> {
  vi.resetModules()
  const stores = await import('./stores')
  const audio = await import('./audio')
  return { audio, stores }
}

function enter(stores: Stores, self: PlayerView, others: PlayerView[]): void {
  stores.room.set({ code: 'FireCape' } as RoomView)
  stores.you.set(self)
  stores.players.set([self, ...others])
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  localStorage.clear()
  consoleError = vi.spyOn(console, 'error')
})

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('the switches', () => {
  it('start on, and keep a change across a reload', async () => {
    let { audio } = await load()
    expect(get(audio.sound)).toEqual({ effects: true, question: true })

    audio.toggleSound('effects')
    audio.toggleSound('question')
    expect(get(audio.sound)).toEqual({ effects: false, question: false })

    ;({ audio } = await load())
    expect(get(audio.sound)).toEqual({ effects: false, question: false })
  })

  it('fall back to on for a mangled value', async () => {
    localStorage.setItem('jbi:sound', '{"effects":"loud"')
    const { audio } = await load()
    expect(get(audio.sound)).toEqual({ effects: true, question: true })
  })

  it('last for the page when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { audio } = await load()
    audio.toggleSound('effects')
    expect(get(audio.sound).effects).toBe(false)
  })
})

describe('a room with a TV', () => {
  it('turns a phone off, keeps its own choice for the room, and forgets it on leaving', async () => {
    const { audio, stores } = await load()
    const you = player('you', 'player')
    enter(stores, you, [player('tv', 'tv')])
    expect(get(audio.sound)).toEqual({ effects: false, question: false })

    audio.toggleSound('effects')
    expect(get(audio.sound)).toEqual({ effects: true, question: false })
    expect(localStorage.getItem('jbi:sound')).toBeNull()

    stores.resetRoom()
    expect(get(audio.sound)).toEqual({ effects: true, question: true })

    enter(stores, you, [player('tv', 'tv')])
    expect(get(audio.sound)).toEqual({ effects: false, question: false })
  })

  it('gives the phone its own settings back while the TV is disconnected', async () => {
    const { audio, stores } = await load()
    enter(stores, player('you', 'player'), [player('tv', 'tv', false)])
    expect(get(audio.source)).toBe('stored')
    expect(get(audio.sound)).toEqual({ effects: true, question: true })
  })

  it('forces the TV on, and gives it its stored settings back once it is a player', async () => {
    const first = await load()
    first.audio.toggleSound('question')
    const { audio, stores } = await load()

    enter(stores, player('tv', 'tv'), [player('ann', 'player')])
    expect(get(audio.sound)).toEqual({ effects: true, question: true })
    audio.toggleSound('effects')
    expect(get(audio.sound)).toEqual({ effects: true, question: true })

    enter(stores, player('tv', 'player'), [player('ann', 'player')])
    expect(get(audio.sound)).toEqual({ effects: true, question: false })
  })
})

describe('unlocking', () => {
  it('waits for the first tap or key press, and is silent with no sound files', async () => {
    const { audio } = await load()
    audio.listenForUnlock()
    expect(get(audio.unlocked)).toBe(false)
    expect(audio.questionAudioBlocked()).toBe('locked')
    audio.playEffect('splash')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(get(audio.unlocked)).toBe(true)
    expect(audio.questionAudioBlocked()).toBeNull()
    audio.playEffect('splash')
  })

  it('says question audio is muted when its switch is off', async () => {
    const { audio } = await load()
    audio.listenForUnlock()
    window.dispatchEvent(new PointerEvent('pointerdown'))
    audio.toggleSound('question')
    expect(audio.questionAudioBlocked()).toBe('muted')
  })
})
