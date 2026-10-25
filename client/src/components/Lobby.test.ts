/**
 * The lobby: a stage with the room code, and the table panel beside it. The host's controls
 * ask in the page first, not through `window.confirm`, which some in-app browsers answer
 * no to unasked.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOBBY_COOLDOWN_MS } from '../lib/cooldown.svelte'
import { npcArt } from '../lib/npcs'
import type { PlayerView, RoomView } from '../lib/protocol'
import { applyServerMessage, resetRoom } from '../lib/stores'
import type { RoomSocket } from '../lib/ws'
import { petsDrawn } from '../test-pets'
import Lobby from './Lobby.svelte'

const HOST: PlayerView = {
  id: 'a',
  display_name: 'Zezima',
  role: 'admin',
  connected: true,
  avatar: null,
  ready: false,
  editing: false,
  team: null,
}
const WOOX: PlayerView = {
  id: 'b',
  display_name: 'Woox',
  role: 'player',
  connected: true,
  avatar: null,
  ready: false,
  editing: false,
  team: null,
}

const ROOM: RoomView = {
  code: 'ABYSSAL',
  status: 'lobby',
  settings: {
    modes: [{ mode: 'more_less', questions: 5 }],
    mode_order: 'listed',
    random_event_frequency: 'default',
    pace: 'run',
    difficulty: 'mixed',
    standings_seconds: 10,
    close_when_all_answered: true,
    max_players: 50,
    name_wrong_answers: false,
    teams: [],
  },
  current_index: null,
  total: 5,
  events: 0,
  phase: 'idle',
  next_at: null,
  reveal_seconds: null,
  estimated_seconds: 300,
  played: [],
  segment: null,
  finished_at: null,
}

let sent: unknown[] = []

/** A surprise room as a player is sent it: no modes, until a round starts. */
const SECRET: RoomView = {
  ...ROOM,
  settings: { ...ROOM.settings, modes: [], hide_rounds: true },
  total: 42,
  events: 2,
  rounds: 5,
}

function lobby(
  players: PlayerView[] = [HOST, WOOX],
  room: RoomView = ROOM,
  you: PlayerView = HOST,
): void {
  resetRoom()
  applyServerMessage({
    t: 'welcome',
    room,
    you,
    players,
    question: null,
    your_answer: null,
    standings: [],
    team_standings: null,
    server_time: new Date().toISOString(),
    server_version: __APP_VERSION__,
  })
  const socket = {
    send: (message: unknown) => {
      sent.push(message)
      return true
    },
  } as unknown as RoomSocket
  render(Lobby, { socket })
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog')
}

/** The pet an admin taps to kick, promote or move its player. */
function tile(name: string, menu = 'kick or make host'): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${name}, .*: ${menu}$`) })
}

function clipboard(writeText: ReturnType<typeof vi.fn> | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  })
}

function panel(): HTMLElement {
  return screen.getByRole('group', { name: 'At the table' })
}

/** Every pet at the table, half by half. */
function pets(): HTMLElement[] {
  return within(panel()).getAllByRole('listitem')
}

/** The names in one of the panel's lists: a half, a team in a half, or the TV. */
function names(list: string): string[] {
  return within(within(panel()).getByRole('list', { name: list }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.pet-name')?.textContent ?? '')
}

/** A half's heading, its label and count. */
function heading(label: string): string {
  return (
    within(panel())
      .getAllByRole('heading', { level: 3 })
      .find((h) => h.textContent?.startsWith(label))
      ?.textContent?.replace(/\s+/g, ' ') ?? ''
  )
}

function away(pet: HTMLElement): boolean {
  return pet.querySelector('.table-pet')?.classList.contains('away') === true
}

beforeEach(() => {
  sent = []
})

describe('Lobby', () => {
  it("explains how to play the room's own ways of answering", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json([
            { id: 'more_less', types: ['more_less'], questions: null, seconds: null, as_of: null },
            { id: 'sort_it_out', types: ['ordering'], questions: null, seconds: null, as_of: null },
          ]),
        ),
      ),
    )
    lobby()
    await fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
    const sheet = screen.getByRole('dialog', { name: 'How to play' })
    await within(sheet).findByRole('heading', { name: 'One answer' })
    expect(within(sheet).getAllByRole('heading', { level: 3 })).toHaveLength(1)
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('kicks from the pet the host taps, the choice being its own confirmation', async () => {
    lobby()
    await fireEvent.click(tile('Woox'))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain('Kick Woox, or make them a host?')
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Kick' }))
    expect(sent).toEqual([{ t: 'kick', player_id: 'b' }])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks once more before making a host, which cannot be undone', async () => {
    lobby()
    await fireEvent.click(tile('Woox'))
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Make host…' }))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain("Make Woox a host? This can't be undone.")
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Make host' }))
    expect(sent).toEqual([{ t: 'promote', player_id: 'b' }])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends start_game below the threshold only once the host confirms', async () => {
    lobby()
    await fireEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain('Start anyway? Still waiting on you and Woox.')
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Start anyway' }))
    expect(sent).toEqual([{ t: 'start_game' }])
  })

  it('names the difficulty only when the host narrowed it', () => {
    lobby([HOST, WOOX], { ...ROOM, settings: { ...ROOM.settings, difficulty: 'hard' } })
    expect(
      screen.getByText('1 round · 5 questions · Run pace · Hard questions · ~5 min'),
    ).toBeTruthy()
  })

  it.each([
    ['a pet', () => tile('Woox')],
    ['Make host', null],
    ['Start anyway', () => screen.getByRole('button', { name: 'Start anyway' })],
  ])('sends nothing when %s is cancelled', async (_, open) => {
    lobby()
    const show = async () => {
      if (open !== null) return fireEvent.click(open())
      await fireEvent.click(tile('Woox'))
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Make host…' }))
    }
    await show()
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await show()
    await fireEvent(dialog(), new Event('cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([])
  })

  it('offers kick and promote on nobody’s pet to a player, nor on a host’s to a host', () => {
    lobby([HOST, WOOX], ROOM, WOOX)
    expect(screen.queryByRole('button', { name: /kick or make host/ })).toBeNull()
    cleanup()
    lobby([HOST, WOOX, { ...WOOX, id: 'c', display_name: 'Lynx', role: 'admin' }])
    expect(screen.getAllByRole('button', { name: /kick or make host/ })).toHaveLength(1)
  })

  describe('with a TV', () => {
    const TV: PlayerView = { ...WOOX, id: 't', display_name: 'Lounge', role: 'tv' }

    it('lets an admin make a player the TV from their menu, at once', async () => {
      lobby()
      await fireEvent.click(tile('Woox'))
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Make TV' }))
      expect(sent).toEqual([{ t: 'set_tv', player_id: 'b', on: true }])
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('lets an admin make the TV a player again, or kick it', async () => {
      lobby([HOST, WOOX, TV])
      await fireEvent.click(tile('Lounge', 'kick or not the TV'))
      expect(within(dialog()).queryByRole('button', { name: 'Make TV' })).toBeNull()
      expect(within(dialog()).queryByRole('button', { name: 'Make host…' })).toBeNull()
      expect(within(dialog()).getByRole('button', { name: 'Kick' })).toBeTruthy()
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Not the TV' }))
      expect(sent).toEqual([{ t: 'set_tv', player_id: 't', on: false }])
    })

    it('offers another admin as the TV, but never the last admin', async () => {
      lobby([HOST, WOOX])
      expect(screen.queryByRole('button', { name: /^Zezima, / })).toBeNull()
      cleanup()
      const lynx: PlayerView = { ...WOOX, id: 'c', display_name: 'Lynx', role: 'admin' }
      lobby([HOST, WOOX, lynx])
      await fireEvent.click(tile('Lynx', 'make TV'))
      expect(dialog().textContent).toContain('Make Lynx the TV?')
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Make TV' }))
      expect(sent).toEqual([{ t: 'set_tv', player_id: 'c', on: true }])
    })

    it('gives a player neither entry', () => {
      lobby([HOST, WOOX, TV], ROOM, WOOX)
      expect(screen.queryByRole('button', { name: /: / })).toBeNull()
      expect(screen.queryByRole('button', { name: /TV/ })).toBeNull()
    })

    it('lists the TV apart, under TV with a screen on it, in neither half', () => {
      lobby([{ ...HOST, ready: true }, WOOX, TV])
      const rows = pets()
      expect(rows.map((pet) => pet.querySelector('.screen') !== null)).toEqual([false, false, true])
      expect(names('TV')).toEqual(['Lounge'])
      expect(names('Ready')).toEqual(['Zezima'])
      expect(names('Not ready yet')).toEqual(['Woox'])
      expect(tile('Lounge', 'kick or not the TV').getAttribute('aria-label')).toBe(
        'Lounge, TV: kick or not the TV',
      )
    })

    it('gives the TV no ready button, and no menu on anyone', () => {
      lobby([HOST, WOOX, TV], ROOM, TV)
      expect(screen.queryByRole('switch', { name: 'Ready' })).toBeNull()
      expect(screen.queryByRole('button', { name: /: / })).toBeNull()
      expect(screen.getByText('Waiting for 1 more to be ready.')).toBeTruthy()
    })

    it('shows the TV the code, the link and who is at the table, with no controls', () => {
      lobby([HOST, WOOX, TV], { ...ROOM, key: 'abc' }, TV)
      expect(screen.queryAllByRole('button')).toEqual([])
      expect(screen.getByText('ABYSSAL')).toBeTruthy()
      expect(screen.getByText(`${location.host}/r/ABYSSAL#k=abc`)).toBeTruthy()
      const table = within(screen.getByRole('list', { name: /^Players/ }))
      expect(table.getByText('Zezima')).toBeTruthy()
      expect(table.getByText('Woox')).toBeTruthy()
      expect(table.queryByText('Lounge')).toBeNull()
      expect(document.querySelector('.stage.tv.wide')).not.toBeNull()
    })

    it('waits on the host once enough are ready', () => {
      lobby([{ ...HOST, ready: true }, { ...WOOX, ready: true }, TV], ROOM, TV)
      expect(screen.getByText('Waiting for the host to start…')).toBeTruthy()
    })

    it("groups the TV's table by team, with nothing to join", () => {
      const room: RoomView = {
        ...ROOM,
        settings: { ...ROOM.settings, teams: ['saradomin', 'zamorak'] },
      }
      lobby([{ ...HOST, team: 'zamorak' }, { ...WOOX, team: 'saradomin' }, TV], room, TV)
      expect(screen.queryAllByRole('button')).toEqual([])
      expect(within(screen.getByRole('list', { name: 'Zamorak' })).getByText('Zezima')).toBeTruthy()
    })

    it('puts the TV in its own group in a team game, out of the team-pick wait', () => {
      const room: RoomView = {
        ...ROOM,
        settings: { ...ROOM.settings, teams: ['saradomin', 'zamorak'] },
      }
      lobby([{ ...HOST, team: 'zamorak' }, { ...WOOX, team: 'saradomin' }, TV], room)
      expect(screen.queryByRole('list', { name: /No team/ })).toBeNull()
      expect(within(screen.getByRole('list', { name: 'TV' })).getByText('Lounge')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Start anyway' })).toHaveProperty('disabled', false)
    })

    it('gives the TV no team to pick in a team game', () => {
      const room: RoomView = {
        ...ROOM,
        settings: { ...ROOM.settings, teams: ['saradomin', 'zamorak'] },
      }
      lobby([HOST, TV], room, TV)
      expect(screen.queryByText('Pick a team first.')).toBeNull()
      expect(screen.queryByRole('button', { name: /^Saradomin, / })).toBeNull()
    })
  })

  it('has the Wise Old Man, without a hero in the branding, speak above a scroll that holds the code and the invite link', () => {
    lobby()
    expect(
      [...document.querySelectorAll('.speaker .npc img')].map((img) => img.getAttribute('src')),
    ).toEqual([npcArt('wise_old_man').url])
    const bubble = document.querySelector('.bubble') as HTMLElement
    expect(bubble.textContent).toContain('Wise Old Man')
    expect(bubble.textContent).toContain('Pull up a stool and share the code.')
    const paper = document.querySelector('.paper') as HTMLElement
    expect(within(paper).getByRole('heading', { level: 1, name: 'Lobby' })).toBeTruthy()
    expect(within(paper).getByText('Your friends join with this code')).toBeTruthy()
    expect(
      within(paper).getByRole('button', { name: 'ABYSSAL, copy the invite link' }),
    ).toBeTruthy()
    expect(within(paper).getByText(`${location.host}/r/ABYSSAL`)).toBeTruthy()
    expect(within(paper).getByRole('button', { name: 'Copy invite link' })).toBeTruthy()
    const board = document.querySelector('.board') as HTMLElement
    expect(within(board).getByText('1 round · 5 questions · Run pace · ~5 min')).toBeTruthy()
  })

  it('says an invite-only room is one, instead of printing its link', () => {
    lobby([HOST, WOOX], { ...ROOM, key: 'abc_DEF-123' })
    const paper = document.querySelector('.paper') as HTMLElement
    expect(within(paper).getByText('Invite-only: the link lets people straight in')).toBeTruthy()
    expect(within(paper).getByRole('button', { name: 'New link' })).toBeTruthy()
  })

  it('copies an invite-only room’s whole link from the code, and never draws its key', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    clipboard(writeText)
    lobby([HOST, WOOX], { ...ROOM, key: 'abc_DEF-123' })
    expect(document.querySelector('.copied')?.textContent).toBe('')
    await fireEvent.click(screen.getByRole('button', { name: 'ABYSSAL, copy the invite link' }))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/ABYSSAL#k=abc_DEF-123`)
    expect(await screen.findByText('Link copied')).toBeTruthy()
    expect(document.body.innerHTML).not.toContain('abc_DEF-123')
  })

  it('copies a room without a key by its plain link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    clipboard(writeText)
    lobby()
    await fireEvent.click(screen.getByRole('button', { name: 'ABYSSAL, copy the invite link' }))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/ABYSSAL`)
  })

  it.each([
    ['refuses', vi.fn().mockRejectedValue(new Error('denied'))],
    ['is missing', undefined],
  ])('says so and shows the link to copy by hand when the clipboard %s', async (_, writeText) => {
    clipboard(writeText)
    lobby([HOST, WOOX], { ...ROOM, key: 'abc' })
    await fireEvent.click(screen.getByRole('button', { name: 'ABYSSAL, copy the invite link' }))
    expect(
      (await screen.findByText("Couldn't copy the link. Copy it from here:")).textContent,
    ).toBe("Couldn't copy the link. Copy it from here:")
    const field = screen.getByRole('textbox', { name: 'Link for players' }) as HTMLInputElement
    expect(field.value).toBe(`${location.origin}/r/ABYSSAL#k=abc`)
    expect(screen.queryByText('Link copied')).toBeNull()
  })

  it('sends rotate_key only once the host confirms a new link', async () => {
    lobby([HOST, WOOX], { ...ROOM, key: 'abc' })
    await fireEvent.click(screen.getByRole('button', { name: 'New link' }))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain(
      'The current one stops working. Players already here stay.',
    )
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'New link' }))
    expect(sent).toEqual([{ t: 'rotate_key' }])
  })

  it('offers no new link for a room without a key, nor to a player', () => {
    lobby()
    expect(screen.queryByRole('button', { name: 'New link' })).toBeNull()
    cleanup()
    lobby([HOST, WOOX], { ...ROOM, key: 'abc' }, WOOX)
    expect(screen.queryByRole('button', { name: 'New link' })).toBeNull()
  })

  it('lists who is asking to join, and lets them in or turns them away without asking', async () => {
    const requests = [
      { id: 'r1', display_name: 'Lynx Titan', avatar: 'aggy' },
      { id: 'r2', display_name: 'Durial', avatar: null },
    ]
    lobby([HOST, WOOX], { ...ROOM, key: 'abc', requests })
    const panel = screen.getByRole('region', { name: 'Asking to join (2)' })
    expect(panel.closest('[aria-label="At the table"]')).not.toBeNull()
    const rows = within(panel).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Lynx Titan'),
      expect.stringContaining('Durial'),
    ])
    await fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Let in' }))
    await fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Turn away' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([
      { t: 'decide_request', request_id: 'r1', accept: true },
      { t: 'decide_request', request_id: 'r2', accept: false },
    ])
  })

  it('shows no request panel when nobody is asking', () => {
    lobby([HOST, WOOX], { ...ROOM, key: 'abc', requests: [] })
    expect(screen.queryByText(/Asking to join/)).toBeNull()
  })

  it('starts at once, asking nothing, when enough of the room is ready', async () => {
    lobby([{ ...HOST, ready: true }, WOOX])
    await fireEvent.click(screen.getByRole('button', { name: 'Start the game' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([{ t: 'start_game' }])
  })

  it('counts only who is connected toward Start, and names the rest', async () => {
    const away: PlayerView = {
      id: 'c',
      display_name: 'Lynx',
      role: 'player',
      connected: false,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
    }
    lobby([{ ...HOST, ready: true }, WOOX, { ...away, ready: true }])
    await fireEvent.click(screen.getByRole('button', { name: 'Start the game' }))
    expect(sent).toEqual([{ t: 'start_game' }])
  })

  it('draws each player’s own pet, or the innkeeper for none, at 48px as the splash does', () => {
    lobby([
      { ...HOST, avatar: 'baby_mole' },
      { ...WOOX, avatar: null },
    ])
    expect(petsDrawn(panel())).toEqual([
      { pet: 'baby_mole', size: 48 },
      { pet: '', size: 48 },
    ])
  })

  it('splits the table into Ready and Not ready yet, each with its count', async () => {
    const lynx: PlayerView = {
      id: 'c',
      display_name: 'Lynx',
      role: 'player',
      connected: true,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
    }
    lobby([{ ...HOST, ready: true }, WOOX, lynx])
    expect(heading('Ready')).toBe('Ready 1')
    expect(heading('Not ready yet')).toBe('Not ready yet 2')
    expect(names('Ready')).toEqual(['Zezima'])
    expect(names('Not ready yet')).toEqual(['Woox', 'Lynx'])
    applyServerMessage({
      t: 'players_updated',
      players: [{ ...HOST, ready: true }, WOOX, { ...lynx, ready: true }],
    })
    await tick()
    expect(names('Ready')).toEqual(['Zezima', 'Lynx'])
    expect(names('Not ready yet')).toEqual(['Woox'])
    expect(heading('Ready')).toBe('Ready 2')
  })

  it('shows the ready switch on when you are ready and off when not', () => {
    lobby([HOST, WOOX])
    expect(screen.getByRole('switch', { name: 'Ready' }).getAttribute('aria-checked')).toBe('false')
    cleanup()
    lobby([{ ...HOST, ready: true }, WOOX])
    expect(screen.getByRole('switch', { name: 'Ready' }).getAttribute('aria-checked')).toBe('true')
  })

  it('greys ready out after a tap until the server takes another change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      lobby([HOST, WOOX])
      const ready = screen.getByRole('switch', { name: 'Ready' }) as HTMLButtonElement
      await fireEvent.click(ready)
      expect(sent).toEqual([{ t: 'ready', ready: true }])
      expect(ready.disabled).toBe(true)
      vi.advanceTimersByTime(LOBBY_COOLDOWN_MS)
      await tick()
      expect(ready.disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fades an away player and keeps them under Not ready yet, ready or not', () => {
    const lynx: PlayerView = {
      id: 'c',
      display_name: 'Lynx',
      role: 'player',
      connected: false,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
    }
    lobby([
      { ...HOST, ready: true },
      WOOX,
      lynx,
      { ...lynx, id: 'd', display_name: 'Cow', ready: true },
    ])
    expect(names('Ready')).toEqual(['Zezima'])
    expect(names('Not ready yet')).toEqual(['Woox', 'Lynx', 'Cow'])
    expect(pets().map(away)).toEqual([false, false, true, true])
    expect(tile('Lynx').getAttribute('aria-label')).toBe(
      'Lynx, away, not ready yet: kick or make host',
    )
  })

  it('shows the code as the server spells it', () => {
    lobby([HOST], { ...ROOM, code: 'AbyssalWhip07' })
    expect(
      screen.getByRole('button', { name: 'AbyssalWhip07, copy the invite link' }).textContent,
    ).toContain('AbyssalWhip07')
  })

  it('says under each pet who hosts and who is away, and bolds yours', () => {
    const lynx: PlayerView = {
      id: 'c',
      display_name: 'Lynx',
      role: 'player',
      connected: false,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
    }
    lobby([HOST, WOOX, lynx])
    expect(pets().map((pet) => pet.querySelector('.status')?.textContent ?? '')).toEqual([
      'host',
      '',
      'away',
    ])
    expect(pets().map((pet) => pet.querySelector('.table-pet.you') !== null)).toEqual([
      true,
      false,
      false,
    ])
  })

  it('says who is picking a name, dims them, and counts them as before', () => {
    lobby([
      { ...HOST, ready: true },
      { ...WOOX, editing: true },
    ])
    const [host, woox] = pets()
    expect(woox?.textContent).toContain('picking a name…')
    expect(woox?.querySelector('.status.editing')).not.toBeNull()
    expect(host?.textContent).not.toContain('picking a name…')
    expect(heading('Ready')).toBe('Ready 1')
    expect(heading('Not ready yet')).toBe('Not ready yet 1')
  })

  it('tells a player the host starts, at the table, and gives them no Start', () => {
    lobby([HOST, WOOX], ROOM, WOOX)
    const table = screen.getByRole('group', { name: 'At the table' })
    expect(within(table).getByText('Waiting for the host to start…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull()
  })

  it.each([
    [1, '3 rounds · 15 questions · 1 random event · Run pace · ~5 min'],
    [3, '3 rounds · 15 questions · 3 random events · Run pace · ~5 min'],
  ])('counts %i random events apart from the rounds’ questions', (events, line) => {
    const modes = [
      { mode: 'more_less', questions: 5 },
      { mode: 'drop_table', questions: 5 },
      { mode: 'sort_it_out', questions: 5 },
    ]
    lobby([HOST, WOOX], {
      ...ROOM,
      settings: { ...ROOM.settings, modes },
      total: 15 + events,
      events,
    })
    expect(screen.getByText(line)).toBeTruthy()
  })

  it('shows a card per round, A–Z, with its host and its question count', () => {
    const modes = [
      { mode: 'more_less', questions: 5 },
      { mode: 'drop_table', questions: 1 },
    ]
    lobby([HOST, WOOX], { ...ROOM, settings: { ...ROOM.settings, modes }, total: 6 })
    expect(screen.getByText('2 rounds · 6 questions · Run pace · ~5 min')).toBeTruthy()
    const cards = [...document.querySelectorAll('.board .round')]
    expect(cards.map((card) => card.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Drop Table 1 question',
      'More or Less 5 questions',
    ])
    expect(cards.every((card) => card.querySelector('.face img') !== null)).toBe(true)
    expect(screen.getByText('Listed A–Z, not in the order they play.')).toBeTruthy()
    expect(screen.getByText('Quicker and correct answers score more.')).toBeTruthy()
  })

  it('gives the server’s estimate of the game in whole minutes', () => {
    lobby([HOST, WOOX], { ...ROOM, estimated_seconds: 1290 })
    expect(screen.getByText('1 round · 5 questions · Run pace · ~22 min')).toBeTruthy()
  })

  it('names the pace the host picked', () => {
    lobby([HOST, WOOX], { ...ROOM, settings: { ...ROOM.settings, pace: 'teleport' } })
    expect(screen.getByText('1 round · 5 questions · Teleport pace · ~5 min')).toBeTruthy()
  })

  it.each([
    ['player', WOOX, SECRET],
    // The host is sent every round, and the lobby still keeps them off a shared screen.
    ['host', HOST, { ...SECRET, settings: { ...SECRET.settings, modes: ROOM.settings.modes } }],
  ])('counts surprise rounds for the %s and offers none to show', (_, you, room) => {
    lobby([HOST, WOOX], room, you)
    expect(
      screen.getByText('5 secret rounds · 40 questions · 2 random events · Run pace · ~5 min'),
    ).toBeTruthy()
    expect(
      screen.getByText("Tonight's rounds are a surprise. Each one is revealed when it starts."),
    ).toBeTruthy()
    const cards = [...document.querySelectorAll('.board .round')]
    expect(cards).toHaveLength(5)
    expect(cards.every((card) => card.textContent?.trim() === 'A surprise')).toBe(true)
    expect(screen.queryByText('More or Less')).toBeNull()
  })

  it('says a refusal in its own words', async () => {
    lobby()
    applyServerMessage({ t: 'error', code: 'not_admin', message: 'only an admin can do that' })
    expect(await screen.findByText('Only a host can do that.')).toBeTruthy()
  })
  describe('in a team game', () => {
    const TEAMS_ROOM: RoomView = {
      ...ROOM,
      settings: { ...ROOM.settings, teams: ['saradomin', 'zamorak', 'guthix'] },
    }
    const LYNX: PlayerView = { ...WOOX, id: 'c', display_name: 'Lynx' }

    function god(name: string): HTMLElement {
      return screen.getByRole('button', { name: new RegExp(`^${name}, \\d+ players?$`) })
    }

    it('groups each half by team in god order, the teamless last, with a button per god', () => {
      lobby(
        [
          { ...HOST, team: 'zamorak' },
          WOOX,
          { ...LYNX, team: 'zamorak', ready: true },
          { ...WOOX, id: 'd', display_name: 'Cow', team: 'saradomin', ready: true },
        ],
        TEAMS_ROOM,
      )
      expect(names('Ready, Saradomin')).toEqual(['Cow'])
      expect(names('Ready, Zamorak')).toEqual(['Lynx'])
      expect(names('Not ready yet, Zamorak')).toEqual(['Zezima'])
      expect(names('Not ready yet, No team')).toEqual(['Woox'])
      expect(screen.queryByRole('list', { name: /Guthix/ })).toBeNull()
      expect(
        within(panel())
          .getAllByRole('list')
          .map((list) => list.getAttribute('aria-label')),
      ).toEqual([
        'Ready, Saradomin',
        'Ready, Zamorak',
        'Not ready yet, Zamorak',
        'Not ready yet, No team',
      ])
      expect(god('Saradomin').getAttribute('aria-label')).toBe('Saradomin, 1 player')
      expect(god('Guthix').getAttribute('aria-label')).toBe('Guthix, 0 players')
      expect(screen.queryByRole('button', { name: /^Bandos/ })).toBeNull()
    })

    it('drops No team once everyone has one', () => {
      lobby(
        [
          { ...HOST, team: 'zamorak' },
          { ...WOOX, team: 'guthix' },
        ],
        TEAMS_ROOM,
      )
      expect(screen.queryByRole('list', { name: /No team/ })).toBeNull()
    })

    it('sends set_team for the god tapped, and marks yours', async () => {
      lobby([HOST, { ...WOOX, team: 'guthix' }], TEAMS_ROOM, WOOX)
      expect(god('Guthix').getAttribute('aria-pressed')).toBe('true')
      expect(god('Saradomin').getAttribute('aria-pressed')).toBe('false')
      await fireEvent.click(god('Saradomin'))
      await fireEvent.click(god('Guthix'))
      expect(sent).toEqual([{ t: 'set_team', team: 'saradomin' }])
    })

    it('greys the gods out after a pick until the server takes another', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        lobby([HOST, { ...WOOX, team: 'guthix' }], TEAMS_ROOM, WOOX)
        await fireEvent.click(god('Saradomin'))
        expect((god('Zamorak') as HTMLButtonElement).disabled).toBe(true)
        vi.advanceTimersByTime(LOBBY_COOLDOWN_MS)
        await tick()
        expect((god('Zamorak') as HTMLButtonElement).disabled).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('lets nobody tap a god while ready, and says how to change', async () => {
      const ready = { ...WOOX, team: 'guthix' as const, ready: true }
      lobby([HOST, ready], TEAMS_ROOM, ready)
      for (const name of ['Saradomin', 'Zamorak', 'Guthix']) {
        expect((god(name) as HTMLButtonElement).disabled).toBe(true)
      }
      await fireEvent.click(god('Saradomin'))
      expect(sent).toEqual([])
      expect(screen.getByText('Take your ready back to change team.')).toBeTruthy()
    })

    it('disables ready while you are teamless, saying to pick a team first', async () => {
      lobby([HOST, WOOX], TEAMS_ROOM, WOOX)
      const ready = screen.getByRole('switch', { name: 'Ready' }) as HTMLButtonElement
      expect(ready.disabled).toBe(true)
      expect(ready.getAttribute('aria-describedby')).toBe('pick-first')
      expect(screen.getByText('Pick a team first.')).toBeTruthy()
      cleanup()
      lobby([HOST, { ...WOOX, team: 'zamorak' }], TEAMS_ROOM, { ...WOOX, team: 'zamorak' })
      expect((screen.getByRole('switch', { name: 'Ready' }) as HTMLButtonElement).disabled).toBe(
        false,
      )
      expect(screen.queryByText('Pick a team first.')).toBeNull()
    })

    it('lets an admin move a player to another team from their menu', async () => {
      lobby(
        [
          { ...HOST, team: 'zamorak' },
          { ...WOOX, team: 'saradomin' },
        ],
        TEAMS_ROOM,
      )
      await fireEvent.click(tile('Woox', 'kick, make host or move team'))
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Move team…' }))
      expect(sent).toEqual([])
      expect(dialog().textContent).toContain('Move Woox to which team?')
      expect(within(dialog()).queryByRole('button', { name: 'Saradomin' })).toBeNull()
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Guthix' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(sent).toEqual([{ t: 'move_team', player_id: 'b', team: 'guthix' }])
    })

    it('lets an admin move another admin, who cannot be kicked', async () => {
      const lynx = { ...LYNX, role: 'admin' as const }
      lobby([HOST, WOOX, lynx], TEAMS_ROOM)
      await fireEvent.click(tile('Lynx', 'make TV or move team'))
      expect(within(dialog()).queryByRole('button', { name: 'Kick' })).toBeNull()
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Move team…' }))
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Zamorak' }))
      expect(sent).toEqual([{ t: 'move_team', player_id: 'c', team: 'zamorak' }])
    })

    it('lets an admin add a god the room lacks', async () => {
      lobby([HOST, WOOX], TEAMS_ROOM)
      await fireEvent.click(screen.getByRole('button', { name: 'Add a team…' }))
      expect(dialog().textContent).toContain('Add which team?')
      expect(within(dialog()).queryByRole('button', { name: 'Zamorak' })).toBeNull()
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Bandos' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(sent).toEqual([
        { t: 'set_teams', teams: ['saradomin', 'zamorak', 'guthix', 'bandos'] },
      ])
    })

    it('offers no add once all six gods play', () => {
      const all = ['saradomin', 'zamorak', 'guthix', 'armadyl', 'bandos', 'zaros'] as const
      lobby([HOST, WOOX], { ...TEAMS_ROOM, settings: { ...TEAMS_ROOM.settings, teams: [...all] } })
      expect(screen.queryByRole('button', { name: 'Add a team…' })).toBeNull()
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(6)
    })

    it('removes an empty team at once, and asks before removing one with players', async () => {
      lobby([HOST, { ...WOOX, team: 'zamorak' }], TEAMS_ROOM)
      await fireEvent.click(screen.getByRole('button', { name: 'Remove Guthix' }))
      expect(sent).toEqual([{ t: 'set_teams', teams: ['saradomin', 'zamorak'] }])
      sent = []
      await fireEvent.click(screen.getByRole('button', { name: 'Remove Zamorak' }))
      expect(sent).toEqual([])
      expect(dialog().textContent).toContain('Remove Zamorak? Its player goes back to no team')
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove' }))
      expect(sent).toEqual([{ t: 'set_teams', teams: ['saradomin', 'guthix'] }])
    })

    it('never offers to go below two teams', () => {
      const two = {
        ...TEAMS_ROOM,
        settings: { ...TEAMS_ROOM.settings, teams: ['saradomin', 'zamorak'] },
      }
      lobby([HOST, WOOX], two as RoomView)
      expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
      expect(screen.getByRole('button', { name: 'Add a team…' })).toBeTruthy()
    })

    it('gives a player no add or remove control', () => {
      lobby([HOST, WOOX], TEAMS_ROOM, WOOX)
      expect(screen.queryByRole('button', { name: 'Add a team…' })).toBeNull()
      expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
    })

    it('gives a player no move control', () => {
      lobby([HOST, WOOX, LYNX], TEAMS_ROOM, WOOX)
      expect(screen.queryByRole('button', { name: /move team/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /^(Woox|Lynx|Zezima),/ })).toBeNull()
    })

    it.each([
      [
        'someone is teamless',
        [{ ...HOST, team: 'zamorak' as const }, WOOX, LYNX],
        'Waiting on Woox and Lynx to pick a team.',
      ],
      [
        'fewer than two teams have players',
        [
          { ...HOST, team: 'zamorak' as const },
          { ...WOOX, team: 'zamorak' as const },
        ],
        'Players are needed in two teams or more.',
      ],
    ])('disables Start, saying why, while %s', (_, players, why) => {
      lobby(players, TEAMS_ROOM)
      const start = screen.getByRole('button', { name: /^Start/ }) as HTMLButtonElement
      expect(start.disabled).toBe(true)
      expect(screen.getByText(why).id).toBe(start.getAttribute('aria-describedby'))
    })

    it('enables Start once everyone has a team, in two teams', () => {
      lobby(
        [
          { ...HOST, team: 'zamorak' },
          { ...WOOX, team: 'guthix' },
        ],
        TEAMS_ROOM,
      )
      const start = screen.getByRole('button', { name: /^Start/ }) as HTMLButtonElement
      expect(start.disabled).toBe(false)
      expect(start.getAttribute('aria-describedby')).toBeNull()
    })
  })
})
