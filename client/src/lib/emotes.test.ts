/** Emotes: the tab's eight and their words, who may send one when, and how long one shows. */

import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EMOTE_MS,
  EMOTES,
  canEmote,
  clearEmotes,
  emoteIcon,
  noteEmote,
  shownEmotes,
  yourEmoteAt,
} from './emotes'
import type { EmoteSent, OpenQuestion, PlayerView, RoomView } from './protocol'
import { applyServerMessage, resetRoom } from './stores'

const YOU: PlayerView = {
  id: 'you',
  display_name: 'Zezima',
  avatar: null,
  role: 'player',
  team: null,
  connected: true,
  ready: false,
  editing: false,
  item: null,
}

const ROOM = {
  code: 'ABYSSAL',
  status: 'lobby',
  phase: 'idle',
  daily: null,
} as unknown as RoomView

const OPEN = { question_id: 'q', you_can_answer: true } as unknown as OpenQuestion

function playing(phase: RoomView['phase']): RoomView {
  return { ...ROOM, status: 'playing', phase }
}

function emote(player_id: string, name: EmoteSent['emote'] = 'wave', line = 0): EmoteSent {
  return { t: 'emote', player_id, emote: name, line }
}

afterEach(() => {
  clearEmotes()
  vi.useRealTimers()
})

describe('EMOTES', () => {
  it('is the eight, in the tab order, with the lines, colours and effects the spec gives', () => {
    expect(EMOTES.map((e) => [e.name, ...e.lines, e.colour, e.effect])).toEqual([
      ['Wave', 'Hi all!', 'Hey!', 'yellow', 'wave'],
      ['Cheer', 'Gz!', 'Woo!', 'yellow', 'wave'],
      ['Clap', 'Nice one!', 'Gg!', 'glow', null],
      ['Laugh', 'Hahaha!', 'Lol!', 'yellow', null],
      ['Think', 'Hmm...', 'Uhh...', 'white', null],
      ['Panic', 'Panic!', 'Please!', 'yellow', 'shake'],
      ['Cry', 'Nooo...', 'Why...', 'cyan', 'sinks'],
      ['Angry', 'Rigged!', 'Grrr!', 'red', 'shake'],
    ])
  })

  it('finds an icon by its emote, and none for one the fetch did not bring', () => {
    const files = {
      '../assets/emotes/cheer.png': '/a/cheer.png',
      '../assets/emotes/button.png': '/a/button.png',
    }
    expect(emoteIcon('cheer', files)).toBe('/a/cheer.png')
    expect(emoteIcon('button', files)).toBe('/a/button.png')
    expect(emoteIcon('wave', files)).toBeNull()
  })
})

describe('canEmote', () => {
  it('allows the lobby and a reveal', () => {
    expect(canEmote(ROOM, YOU, null, false)).toBe(true)
    expect(canEmote(playing('reveal'), YOU, null, false)).toBe(true)
  })

  it('allows an open question only once answered, or one you cannot answer', () => {
    expect(canEmote(playing('open'), YOU, OPEN, false)).toBe(false)
    expect(canEmote(playing('open'), YOU, OPEN, true)).toBe(true)
    expect(canEmote(playing('open'), YOU, { ...OPEN, you_can_answer: false }, false)).toBe(true)
  })

  it('refuses the splash, the standings, the final, a daily room and the TV', () => {
    expect(canEmote(playing('splash'), YOU, null, false)).toBe(false)
    expect(canEmote(playing('standings'), YOU, null, false)).toBe(false)
    expect(canEmote({ ...ROOM, status: 'finished' }, YOU, null, false)).toBe(false)
    const daily = { ...playing('reveal'), daily: { day: '2026-11-24', number: 1 } }
    expect(canEmote(daily, YOU, null, false)).toBe(false)
    expect(canEmote(ROOM, { ...YOU, role: 'tv' }, null, false)).toBe(false)
  })

  it('refuses before the room is known', () => {
    expect(canEmote(null, YOU, null, false)).toBe(false)
    expect(canEmote(ROOM, null, null, false)).toBe(false)
  })
})

describe('noteEmote', () => {
  beforeEach(() => vi.useFakeTimers())

  it("shows the server's line over the pet for three seconds", () => {
    noteEmote(emote('woox', 'cheer', 1), 'you')
    expect(get(shownEmotes).get('woox')?.line).toBe('Woo!')
    vi.advanceTimersByTime(EMOTE_MS - 1)
    expect(get(shownEmotes).has('woox')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(get(shownEmotes).has('woox')).toBe(false)
  })

  it("replaces a player's line with their next, which then gets its own three seconds", () => {
    noteEmote(emote('woox', 'wave'), 'you')
    vi.advanceTimersByTime(2000)
    noteEmote(emote('woox', 'angry'), 'you')
    vi.advanceTimersByTime(2000)
    expect(get(shownEmotes).get('woox')?.line).toBe('Rigged!')
    vi.advanceTimersByTime(1000)
    expect(get(shownEmotes).has('woox')).toBe(false)
  })

  it('notes when your own lands, for the cooldown, and nobody else', () => {
    noteEmote(emote('woox'), 'you', 5)
    expect(get(yourEmoteAt)).toBeNull()
    noteEmote(emote('you'), 'you', 7)
    expect(get(yourEmoteAt)).toBe(7)
  })

  it('arrives as an emote frame, and a welcome replays none', () => {
    resetRoom()
    applyServerMessage(emote('woox', 'think'))
    expect(get(shownEmotes).get('woox')?.line).toBe('Hmm...')
    applyServerMessage({
      t: 'welcome',
      room: ROOM,
      you: YOU,
      players: [YOU],
      question: null,
      your_answer: null,
      standings: [],
      team_standings: null,
      server_time: new Date().toISOString(),
      server_version: __APP_VERSION__,
    })
    expect(get(shownEmotes).size).toBe(0)
  })
})
