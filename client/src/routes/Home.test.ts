/** The front page: the host's line, a code typed the way it was shouted, the public lobbies, and the rooms created here. */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as admin from '../lib/admin'
import * as api from '../lib/api'
import { noteDaily, saveScore } from '../lib/daily'
import { pastGames, savePastGame } from '../lib/history'
import { NIGHT_STOPS, loadModes, slugOf } from '../lib/howToPlay'
import { DISCORD_URL } from '../lib/links'
import { MODES } from '../lib/modes'
import { npcArt } from '../lib/npcs'
import { RANDOM_EVENTS } from '../lib/randomEvents'
import { SHOWN } from '../components/ModeShowcase.svelte'
import { rememberCreated, setSession } from '../lib/session'
import { petsDrawn } from '../test-pets'
import { HINT_FADE_MS, HINT_MS, HINT_WORDS } from '../lib/codeHints'
import Home from './Home.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return {
    ...real,
    deleteRoom: vi.fn(),
    getDaily: vi.fn(),
    getModes: vi.fn(),
    getPublicRooms: vi.fn(),
    getRoom: vi.fn(),
  }
})

vi.mock('../lib/admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/admin')>()
  return { ...real, getQueue: vi.fn() }
})

vi.mock('../lib/howToPlay', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/howToPlay')>()
  return { ...real, loadModes: vi.fn() }
})

const navigate = vi.fn()

const PACING: api.ModePacing[] = [
  { id: 'more_less', types: ['more_less'], questions: null, seconds: null, as_of: null },
  { id: 'sort_it_out', types: ['ordering'], questions: null, seconds: null, as_of: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.mocked(loadModes).mockResolvedValue(PACING)
  vi.mocked(api.deleteRoom).mockResolvedValue(undefined)
  vi.mocked(api.getDaily).mockRejectedValue(new Error('offline'))
  vi.mocked(api.getPublicRooms).mockResolvedValue([])
  vi.mocked(api.getModes).mockResolvedValue([])
  vi.mocked(api.getRoom).mockResolvedValue({ status: 'lobby', players: 1 })
})

const LOBBY: api.PublicRoom = {
  code: 'DRAGON',
  host: {
    id: '7da6f39a-535d-46db-9c02-801eff2c2eb1',
    display_name: 'Zezima',
    avatar: 'baby_mole',
  },
  players: 3,
  max_players: 50,
  rounds: 2,
  modes: ['more_less', 'price_is_right'],
}

async function typeCode(typed: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText('Join an existing room'), {
    target: { value: typed },
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Join' }))
}

describe('How to play on Home', () => {
  const speaker = (): string | null | undefined =>
    document.querySelector('.bubble .name')?.textContent
  const said = (): string | undefined =>
    document.querySelector('.bubble .speech')?.textContent?.replace(/\s+/g, ' ')

  function openPage(howTo: string = 'overview'): void {
    render(Home, { navigate, howTo })
  }

  it("goes to /how-to-play from Reldo's box", async () => {
    render(Home, { navigate })
    await fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
    expect(navigate).toHaveBeenCalledWith('/how-to-play', {
      howTo: { from: null, home: 1 },
    })
  })

  it('leaves How to play out of the slideshow, for Reldo to offer', () => {
    render(Home, { navigate })
    const showcase = document.querySelector('.showcase') as HTMLElement
    expect(within(showcase).queryByRole('button', { name: 'How to play' })).toBeNull()
    const reldo = screen.getByRole('heading', { name: 'Talk to Reldo' }).closest('section')!
    expect(within(reldo).getByRole('button', { name: 'How to play' })).toBeTruthy()
    expect(reldo.textContent).toContain('free for all')
  })

  it('draws the page in place of the sheet, the dialogue box still on top', () => {
    openPage()
    expect(screen.getByRole('heading', { level: 1, name: 'How to play' })).toBeTruthy()
    expect(screen.queryByLabelText('Join an existing room')).toBeNull()
    expect(document.querySelector('.scroll .trail')).toBeTruthy()
    expect(speaker()).toBe('Reldo')
    expect(said()).toContain('a new face')
  })

  it('fades from Home to the page when the address changes, the dialogue box staying', async () => {
    const { rerender } = render(Home, { navigate })
    const box = document.querySelector('.bubble')
    await rerender({ howTo: 'overview' })
    await screen.findByRole('heading', { level: 1, name: 'How to play' })
    expect(document.querySelector('.bubble')).toBe(box)
    await rerender({ howTo: null })
    await waitFor(() => expect(screen.getByLabelText('Join an existing room')).toBeTruthy())
  })

  it('walks a night along the trail, ending on every way of answering', async () => {
    openPage()
    const night = screen.getByRole('region', { name: 'A night at the inn' })
    expect(within(night).getAllByRole('listitem')).toHaveLength(NIGHT_STOPS.length)
    await fireEvent.click(within(night).getByRole('button', { name: /Answer$/ }))
    await within(night).findByRole('heading', { name: 'One answer' })
    expect(within(night).getByText('Faster correct answers score more points.')).toBeTruthy()
  })

  it('goes to Create from the last stop, as Home does', async () => {
    openPage()
    const night = screen.getByRole('region', { name: 'A night at the inn' })
    await fireEvent.click(within(night).getByRole('button', { name: /Answer$/ }))
    await fireEvent.click(within(night).getByRole('button', { name: 'Create a room' }))
    expect(navigate).toHaveBeenCalledWith('/create')
  })

  it('draws the three ways to play, teams and the TV explained', () => {
    openPage()
    const ways = screen.getByRole('heading', { name: 'Ways to play' }).nextElementSibling
    const shown = within(ways as HTMLElement).getAllByRole('listitem')
    expect(shown.map((way) => way.querySelector('h3')?.textContent)).toEqual([
      'Free for all',
      'Team against team',
      'On the sofa',
    ])
    expect(shown[1]?.textContent).toContain('Speed is less important')
    expect(shown[1]?.textContent).toContain('average')
    expect(shown[2]?.textContent).toContain("room's TV")
    expect(within(ways as HTMLElement).getAllByRole('img')).toHaveLength(3)
  })

  it('has a tile for every playable mode, and one for random events', () => {
    openPage()
    const tiles = within(screen.getByRole('region', { name: 'Game modes' })).getAllByRole('button')
    expect(tiles.map((tile) => tile.querySelector('strong')?.textContent)).toEqual([
      ...SHOWN.map((mode) => mode.label),
      'Random events',
    ])
  })

  it("goes to a mode's address from its tile, and to random-events from theirs", async () => {
    openPage()
    await fireEvent.click(screen.getByRole('button', { name: /^More or Less/ }))
    expect(navigate).toHaveBeenLastCalledWith('/how-to-play/more-or-less', {
      howTo: { from: 'overview', home: null },
    })
    await fireEvent.click(screen.getByRole('button', { name: /^Random events/ }))
    expect(navigate).toHaveBeenLastCalledWith('/how-to-play/random-events', expect.anything())
  })

  it("shows a mode's host, greeting, blurb, hint and only its answer types", async () => {
    openPage('sort_it_out')
    const mode = MODES.sort_it_out!
    expect(screen.getByRole('heading', { level: 1, name: 'Sort It Out' })).toBeTruthy()
    expect(screen.getByText(`Hosted by ${mode.host.name}`)).toBeTruthy()
    expect(screen.getByText(mode.hint)).toBeTruthy()
    expect(speaker()).toBe(mode.host.name)
    expect(said()).toContain(mode.greeting)
    expect(said()).toContain(mode.blurb)
    const art = document.querySelector('.stage .bubble .npc img')?.getAttribute('src')
    expect(art).toBe(npcArt(mode.host.id).url)
    await screen.findByRole('heading', { name: 'Put in order' })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Put in order',
    ])
  })

  it('lists every event NPC with its theme, said by the Mysterious Old Man', () => {
    openPage('events')
    expect(screen.getByRole('heading', { level: 1, name: 'Random events' })).toBeTruthy()
    expect(speaker()).toBe('Mysterious Old Man')
    for (const npc of RANDOM_EVENTS) {
      const name = screen.getByText(npc.name, { selector: 'strong' })
      expect(name.nextElementSibling?.textContent).toBe(npc.theme)
    }
  })

  it("goes to a mode's address from its name in the slideshow", async () => {
    render(Home, { navigate })
    const slide = document.querySelector<HTMLElement>('.showcase .slide.on')!
    await fireEvent.click(slide.querySelector('.name button')!)
    const slug =
      slide.dataset.mode === 'events'
        ? 'random-events'
        : slugOf(MODES[slide.dataset.mode ?? '']?.label ?? '')
    expect(navigate).toHaveBeenCalledWith(`/how-to-play/${slug}`, expect.anything())
  })
})

describe('Home', () => {
  it("challenges the visitor in the site's name, and one tap goes to Create", async () => {
    render(Home, { navigate })
    expect(document.querySelector('.bubble .speech')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Think you know Gielinor? Prove it at The Jolly Boar Inn! Enter a room code to join a game, ' +
        'or host your own for your friends, clan, or stream.',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Create a room' }))
    expect(navigate).toHaveBeenCalledWith('/create')
  })

  it("puts Join and Create on the theme's own sheet: the clue scroll in the inn", () => {
    document.documentElement.dataset.theme = 'jolly'
    try {
      const { unmount } = render(Home, { navigate })
      const sheet = () =>
        (screen.getByLabelText('Join an existing room').closest('.scroll') as HTMLElement).dataset
          .sheet
      expect(sheet()).toBe('scroll')
      expect(screen.getByRole('button', { name: 'Create a room' }).closest('.scroll')).toBeTruthy()
      unmount()
      document.documentElement.dataset.theme = 'tzhaar'
      render(Home, { navigate })
      expect(sheet()).toBe('slab')
    } finally {
      delete document.documentElement.dataset.theme
    }
  })

  it('shows the game modes on the same sheet as Join and Create', () => {
    render(Home, { navigate })
    const sheet = screen.getByLabelText('Join an existing room').closest('.scroll')
    expect(screen.getByRole('region', { name: 'Game modes' }).closest('.scroll')).toBe(sheet)
  })

  it('is hosted by the Wise Old Man, in the dialogue box, without a hero in the branding', () => {
    render(Home, { navigate })
    const art = [...document.querySelectorAll('.stage .bubble .npc img')]
    expect(art.map((img) => img.getAttribute('src'))).toEqual([npcArt('wise_old_man').url])
    expect(document.querySelector('.bubble .name')?.textContent).toBe('Wise Old Man')
  })

  it('suggests a code the way codes look, one short enough to fit', () => {
    render(Home, { navigate })
    const field = screen.getByLabelText('Join an existing room') as HTMLInputElement
    expect(HINT_WORDS).toContain(field.placeholder)
    expect(field.getAttribute('autocapitalize')).toBeNull()
  })

  it('fades to another example code every few seconds, but not while you are in the field', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      render(Home, { navigate })
      const field = screen.getByLabelText('Join an existing room') as HTMLInputElement
      const first = field.placeholder
      await vi.advanceTimersByTimeAsync(HINT_MS)
      expect(field.classList.contains('fading')).toBe(true)
      await vi.advanceTimersByTimeAsync(HINT_FADE_MS)
      expect(field.classList.contains('fading')).toBe(false)
      const second = field.placeholder
      expect(second).not.toBe(first)
      expect(HINT_WORDS).toContain(second)

      await fireEvent.focus(field)
      await vi.advanceTimersByTimeAsync(3 * HINT_MS)
      expect(field.placeholder).toBe(second)
      await fireEvent.blur(field)
      await fireEvent.input(field, { target: { value: 'Rune' } })
      await vi.advanceTimersByTimeAsync(3 * HINT_MS)
      expect(field.placeholder).toBe(second)
    } finally {
      vi.useRealTimers()
    }
  })

  it('joins with Enter as with Join', async () => {
    render(Home, { navigate })
    const field = screen.getByLabelText('Join an existing room') as HTMLInputElement
    await fireEvent.input(field, { target: { value: 'FireCape' } })
    await fireEvent.submit(field.form!)
    expect(navigate).toHaveBeenCalledWith('/r/FIRECAPE', { via: 'code' })
  })

  it('joins a code typed as two words', async () => {
    render(Home, { navigate })
    await typeCode("Ahrim's Staff")
    expect(navigate).toHaveBeenCalledWith('/r/AHRIMSSTAFF', { via: 'code' })
  })

  it('says so when what was typed is not a code, and stays put', async () => {
    render(Home, { navigate })
    await typeCode('- -')
    expect(screen.getByText("That doesn't look like a room code.")).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
    await fireEvent.input(screen.getByLabelText('Join an existing room'), {
      target: { value: 'dragon' },
    })
    expect(screen.queryByText("That doesn't look like a room code.")).toBeNull()
  })

  it('lists only the rooms created here that have not expired', () => {
    localStorage.setItem(
      'jbi:created',
      JSON.stringify([
        { code: 'RUNE', expires_at: '2099-01-01T00:00:00Z' },
        { code: 'BRONZE', expires_at: '2000-01-01T00:00:00Z' },
      ]),
    )
    render(Home, { navigate })
    expect(screen.getByText('RUNE')).toBeTruthy()
    expect(screen.queryByText('BRONZE')).toBeNull()
  })

  it('tells each created room roughly how long it has left', () => {
    const left = (hours: number): string =>
      new Date(Date.now() + hours * 3_600_000 + 60_000).toISOString()
    rememberCreated('RUNE', left(31))
    rememberCreated('DRAGON', left(0.5))
    render(Home, { navigate })
    expect(screen.getByText('RUNE').closest('li')!.textContent).toContain('Expires in 31 hours')
    expect(screen.getByText('DRAGON').closest('li')!.textContent).toContain(
      'Expires in under an hour',
    )
  })

  it('tells each created room roughly how long it has left', () => {
    const left = (hours: number): string =>
      new Date(Date.now() + hours * 3_600_000 + 60_000).toISOString()
    rememberCreated('RUNE', left(31))
    rememberCreated('DRAGON', left(0.5))
    render(Home, { navigate })
    expect(screen.getByText('RUNE').closest('li')!.textContent).toContain('Expires in 31 hours')
    expect(screen.getByText('DRAGON').closest('li')!.textContent).toContain(
      'Expires in under an hour',
    )
  })

  describe('Public rooms', () => {
    it('lists each public lobby with its host, pet and rounds, and joins it', async () => {
      vi.mocked(api.getPublicRooms).mockResolvedValue([LOBBY])
      render(Home, { navigate })
      const row = (await screen.findByText('DRAGON')).closest('li')!
      expect(screen.getByRole('heading', { name: 'Public rooms' })).toBeTruthy()
      expect(within(row).getByText('Zezima')).toBeTruthy()
      expect(
        within(row).getByText('3/50 players · 2 rounds: More or Less, The Price is Right'),
      ).toBeTruthy()
      expect(petsDrawn(row)).toEqual([{ pet: 'baby_mole', size: 32 }])
      await fireEvent.click(within(row).getByRole('button', { name: 'Join DRAGON' }))
      expect(navigate).toHaveBeenCalledWith('/r/DRAGON', { via: 'public' })
    })

    it('names no rounds for a room that keeps them a surprise', async () => {
      const { modes: _, ...hidden } = LOBBY
      vi.mocked(api.getPublicRooms).mockResolvedValue([{ ...hidden, rounds: 1 }])
      render(Home, { navigate })
      expect(await screen.findByText('3/50 players · 1 round')).toBeTruthy()
    })

    it('has no panel, and no word, while the list is empty or unreachable', async () => {
      render(Home, { navigate })
      await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalledOnce())
      expect(screen.queryByRole('heading', { name: 'Public rooms' })).toBeNull()
      expect(screen.queryByText(/no public rooms/)).toBeNull()
      cleanup()

      vi.mocked(api.getPublicRooms).mockRejectedValue(new api.ApiFailure(0, 'unreachable', 'down'))
      render(Home, { navigate })
      await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalledTimes(2))
      expect(screen.queryByRole('heading', { name: 'Public rooms' })).toBeNull()
    })

    it('puts the panel up when a room is listed', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      try {
        render(Home, { navigate })
        await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalledOnce())
        expect(screen.queryByRole('heading', { name: 'Public rooms' })).toBeNull()
        vi.mocked(api.getPublicRooms).mockResolvedValue([LOBBY])
        await vi.advanceTimersByTimeAsync(10_000)
        expect(await screen.findByRole('heading', { name: 'Public rooms' })).toBeTruthy()
        expect(screen.getByText('DRAGON')).toBeTruthy()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('Remove', () => {
    beforeEach(() => {
      rememberCreated('RUNE', '2099-01-01T00:00:00Z')
      setSession('RUNE', 'host-session')
    })

    it('removes the room only once the host confirms', async () => {
      render(Home, { navigate })
      await fireEvent.click(screen.getByRole('button', { name: 'Remove room RUNE' }))
      expect(api.deleteRoom).not.toHaveBeenCalled()
      const dialog = screen.getByRole('dialog')
      expect(dialog.textContent).toContain(
        "Remove room RUNE? Anyone still inside will be disconnected. This can't be undone.",
      )
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
      expect(api.deleteRoom).toHaveBeenCalledWith('RUNE', 'host-session')
      await waitFor(() => expect(screen.queryByText('RUNE')).toBeNull())
    })

    it('removes nothing when cancelled', async () => {
      render(Home, { navigate })
      await fireEvent.click(screen.getByRole('button', { name: 'Remove room RUNE' }))
      await fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Cancel',
        }),
      )
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(api.deleteRoom).not.toHaveBeenCalled()
      expect(screen.getByText('RUNE')).toBeTruthy()
    })
  })
})

describe('Room limit', () => {
  const HOSTED = ['RUNE', 'DRAGON', 'BARROWS', 'ZULRAH', 'VORKATH']

  function host(codes: string[]): void {
    for (const code of codes) {
      rememberCreated(code, '2099-01-01T00:00:00Z')
      setSession(code, `s-${code}`)
    }
  }

  const create = (): HTMLButtonElement => screen.getByRole('button', { name: 'Create a room' })

  it('disables Create with a reason once five rooms are hosted here', async () => {
    host(HOSTED)
    render(Home, { navigate })
    const banner = await screen.findByText(/You already have 5 rooms open/)
    expect(create().disabled).toBe(true)
    expect(create().getAttribute('aria-describedby')).toBe(banner.id)
  })

  it('leaves Create alone under five rooms, and asks the server nothing', async () => {
    host(HOSTED.slice(1))
    render(Home, { navigate })
    await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalled())
    expect(create().disabled).toBe(false)
    expect(screen.queryByText(/You already have 5 rooms open/)).toBeNull()
    expect(api.getRoom).not.toHaveBeenCalled()
  })

  it('does not count a room the server has already dropped', async () => {
    host(HOSTED)
    vi.mocked(api.getRoom).mockImplementation(async (code) => {
      if (code === 'ZULRAH') throw new api.ApiFailure(410, 'gone', 'gone')
      return { status: 'lobby', players: 1 }
    })
    render(Home, { navigate })
    await waitFor(() => expect(api.getRoom).toHaveBeenCalledTimes(5))
    await waitFor(() => expect(create().disabled).toBe(false))
  })

  it('frees Create the moment a room is removed', async () => {
    host(HOSTED)
    render(Home, { navigate })
    await screen.findByText(/You already have 5 rooms open/)
    const rune = screen.getByText('RUNE').closest('li')!
    await fireEvent.click(within(rune).getByRole('button', { name: 'Remove room RUNE' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
    )
    await waitFor(() => expect(create().disabled).toBe(false))
    expect(screen.queryByText(/You already have 5 rooms open/)).toBeNull()
  })
})

describe('Layout', () => {
  function played(): void {
    rememberCreated('MINE', '2099-01-01T00:00:00Z')
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [
        {
          player_id: 'a',
          display_name: 'Zezima',
          points: 900,
          rank: 1,
          points_gained: 900,
          previous_rank: null,
          avatar: null,
        },
      ],
      youId: 'a',
    })
  }

  it('reads the sheet, the public rooms, your rooms, then Reldo, which is the tab order too', async () => {
    vi.mocked(api.getPublicRooms).mockResolvedValue([LOBBY])
    played()
    render(Home, { navigate })
    await screen.findByRole('heading', { name: 'Public rooms' })
    const order = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(order).toEqual(['Public rooms', 'Your rooms', 'Past party games', 'Talk to Reldo'])
    const field = screen.getByLabelText('Join an existing room')
    const first = screen.getByRole('heading', { name: 'Public rooms' })
    expect(field.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('puts your rooms and past games side by side, each only with rows', () => {
    played()
    render(Home, { navigate })
    const pair = (heading: string) =>
      screen.getByRole('heading', { name: heading }).closest('section')!.parentElement
    expect(pair('Your rooms')?.classList.contains('yours')).toBe(true)
    expect(pair('Past party games')).toBe(pair('Your rooms'))
  })

  it('has neither list, nor anything in their place, on a first visit', () => {
    render(Home, { navigate })
    expect(screen.queryByRole('heading', { name: 'Your rooms' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Past party games' })).toBeNull()
    expect(document.querySelector('.yours')).toBeNull()
  })

  it('shows Your rooms without past games, and past games without rooms', () => {
    rememberCreated('MINE', '2099-01-01T00:00:00Z')
    render(Home, { navigate })
    expect(screen.getByRole('heading', { name: 'Your rooms' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Past party games' })).toBeNull()
    cleanup()
    localStorage.clear()

    played()
    localStorage.removeItem('jbi:created')
    render(Home, { navigate })
    expect(screen.getByRole('heading', { name: 'Past party games' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Your rooms' })).toBeNull()
  })

  it('has no Open source panel: the footer carries the link to the code', () => {
    render(Home, { navigate })
    expect(screen.queryByRole('heading', { name: 'Open source' })).toBeNull()
  })
})

describe('the daily', () => {
  const TODAY = { day: '2026-10-31', number: 12, next_at: '2099-01-01T08:00:00+00:00' }
  const RESULT = {
    day: '2026-10-31',
    number: 12,
    points: 7420,
    correct: 7,
    results: Array<'right'>(10).fill('right'),
    others: null,
    beaten: null,
  }

  it('says when the first daily opens before there is one, and offers nothing to play', async () => {
    vi.mocked(api.getDaily).mockRejectedValue(
      new api.ApiFailure(404, 'daily_not_open', 'not yet', undefined, {
        opens_at: '2099-01-01T12:00:00+00:00',
      }),
    )
    render(Home, { navigate })
    const panel = (await screen.findByRole('heading', { name: 'Daily challenge' })).closest(
      'section',
    )!
    expect(panel.textContent).toContain('Available from 1 January.')
    expect(within(panel).queryByRole('button')).toBeNull()
  })

  it("offers today's daily to a new browser, and links to it", async () => {
    vi.mocked(api.getDaily).mockResolvedValue(TODAY)
    render(Home, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: 'Play Daily #12' }))
    expect(navigate).toHaveBeenCalledWith('/daily')
    expect(screen.queryByRole('heading', { name: 'Past dailies' })).toBeNull()
  })

  it("shows today's score once played, and it leads to the result", async () => {
    vi.mocked(api.getDaily).mockResolvedValue(TODAY)
    saveScore(RESULT)
    render(Home, { navigate })
    expect(await screen.findByText('Daily #12: 7,420 points')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Play Daily/ })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'View result' }))
    expect(navigate).toHaveBeenCalledWith('/daily')
  })

  it('offers to finish an unfinished attempt, by its own number', async () => {
    vi.mocked(api.getDaily).mockResolvedValue(TODAY)
    noteDaily({ day: '2026-10-30', finished: false })
    render(Home, { navigate })
    expect(await screen.findByRole('button', { name: 'Finish Daily #11' })).toBeTruthy()
  })

  it('sits under the party panels and above Reldo', async () => {
    vi.mocked(api.getDaily).mockResolvedValue(TODAY)
    rememberCreated('MINE', '2099-01-01T00:00:00Z')
    render(Home, { navigate })
    await screen.findByRole('heading', { name: 'Daily challenge' })
    const order = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(order).toEqual(['Your rooms', 'Daily challenge', 'Talk to Reldo'])
  })

  it('sits under the shorter of your rooms and your past games', async () => {
    vi.mocked(api.getDaily).mockResolvedValue(TODAY)
    const game = (code: string) =>
      savePastGame({ code, finishedAt: '2026-10-01T20:00:00Z', standings: [], youId: null })
    rememberCreated('MINE', '2099-01-01T00:00:00Z')
    game('ROOM01')
    game('ROOM02')
    render(Home, { navigate })
    await screen.findByRole('heading', { name: 'Daily challenge' })
    const yours = document.querySelector('.yours')!
    expect(yours.classList.contains('three')).toBe(true)
    expect(yours.classList.contains('under-past')).toBe(false)
    cleanup()

    rememberCreated('OURS', '2099-01-01T00:00:00Z')
    render(Home, { navigate })
    await screen.findByRole('heading', { name: 'Daily challenge' })
    expect(document.querySelector('.yours')!.classList.contains('under-past')).toBe(true)
  })

  it('keeps the daily on its side when a page of past games is short', async () => {
    vi.mocked(api.getDaily).mockResolvedValue(TODAY)
    for (const room of ['A', 'B', 'C']) rememberCreated(`ROOM${room}`, '2099-01-01T00:00:00Z')
    for (let game = 0; game < 6; game++) {
      savePastGame({
        code: `GAME0${game}`,
        finishedAt: `2026-10-0${game + 1}T20:00:00Z`,
        standings: [],
        youId: null,
      })
    }
    render(Home, { navigate })
    await screen.findByRole('heading', { name: 'Daily challenge' })
    await fireEvent.click(screen.getByRole('button', { name: 'Older' }))
    expect(document.querySelector('.yours')!.classList.contains('under-past')).toBe(false)
  })

  it('keeps the scores when the server does not answer', async () => {
    saveScore(RESULT)
    render(Home, { navigate })
    expect(await screen.findByRole('heading', { name: 'Past dailies' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Daily #/ })).toBeNull()
  })

  it('has no panel with no answer and no scores', async () => {
    render(Home, { navigate })
    await waitFor(() => expect(api.getDaily).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Daily challenge' })).toBeNull()
  })
})

describe('Past party games', () => {
  it('draws Hi-scores and Remove as icons, and puts the date under the room', () => {
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [
        {
          player_id: 'a',
          display_name: 'Zezima',
          points: 900,
          rank: 1,
          points_gained: 900,
          previous_rank: null,
          avatar: null,
        },
      ],
      youId: 'a',
    })
    render(Home, { navigate })
    const row = screen.getByText('ABYSSAL').closest('li')!
    for (const name of ['Hi-scores for ABYSSAL', 'Remove ABYSSAL from past party games']) {
      const button = within(row).getByRole('button', { name })
      expect(button.textContent?.trim()).toBe('')
      expect(button.querySelector('svg')).not.toBeNull()
    }
    const code = screen.getByText('ABYSSAL')
    const when = row.querySelector('.when')!
    expect(code.parentElement).toBe(when.parentElement)
    expect(code.compareDocumentPosition(when) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(when.textContent).toContain('2026')
  })

  it('lists each game with its room, when it finished and our place, and opens it', async () => {
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [
        {
          player_id: 'a',
          display_name: 'Zezima',
          points: 900,
          rank: 1,
          points_gained: 900,
          previous_rank: null,
          avatar: null,
        },
        {
          player_id: 'b',
          display_name: 'Woox',
          points: 400,
          rank: 2,
          points_gained: 400,
          previous_rank: null,
          avatar: null,
        },
      ],
      youId: 'b',
    })
    render(Home, { navigate })
    const section = screen.getByRole('heading', { name: 'Past party games' }).closest('section')!
    const row = within(section).getByText('ABYSSAL').closest('li')!
    expect(row.textContent).toContain('2nd of 2')
    expect(row.textContent).toContain('2026')
    await fireEvent.click(within(row).getByRole('button', { name: 'Hi-scores for ABYSSAL' }))
    expect(navigate).toHaveBeenCalledWith('/history/ABYSSAL/2610012005')
  })

  it('names the winning team of a team game', () => {
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [],
      youId: null,
      teamStandings: [
        { team: 'guthix', points: 800, rank: 1, points_gained: 800, previous_rank: null },
        { team: 'bandos', points: 300, rank: 2, points_gained: 300, previous_rank: null },
      ],
      teams: {},
    })
    render(Home, { navigate })
    const row = screen.getByText('ABYSSAL').closest('li')!
    expect(row.textContent).toContain('Guthix won')
  })

  describe('removing one', () => {
    const standings = [
      {
        player_id: 'a',
        display_name: 'Zezima',
        points: 900,
        rank: 1,
        points_gained: 900,
        previous_rank: null,
        avatar: null,
      },
    ]

    beforeEach(() => {
      savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings, youId: 'a' })
      savePastGame({ code: 'RUNE', finishedAt: '2026-10-02T20:05:00Z', standings, youId: 'a' })
    })

    const section = (): HTMLElement =>
      screen.getByRole('heading', { name: 'Past party games' }).closest('section')!

    async function askToRemove(code: string): Promise<void> {
      await fireEvent.click(
        within(section()).getByRole('button', { name: `Remove ${code} from past party games` }),
      )
    }

    it('asks first, and keeps the game when the answer is cancel', async () => {
      render(Home, { navigate })
      await askToRemove('ABYSSAL')
      const dialog = screen.getByRole('dialog')
      expect(dialog.textContent).toContain('ABYSSAL')
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(within(section()).getByText('ABYSSAL')).toBeTruthy()
      expect(pastGames()).toHaveLength(2)
    })

    it('drops only that game from the list and from storage on yes', async () => {
      render(Home, { navigate })
      await askToRemove('ABYSSAL')
      await fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
      )
      expect(within(section()).queryByText('ABYSSAL')).toBeNull()
      expect(within(section()).getByText('RUNE')).toBeTruthy()
      expect(pastGames().map((game) => game.code)).toEqual(['RUNE'])
    })

    it('takes the section away with the last game', async () => {
      render(Home, { navigate })
      for (const code of ['ABYSSAL', 'RUNE']) {
        await askToRemove(code)
        await fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
        )
      }
      expect(screen.queryByRole('heading', { name: 'Past party games' })).toBeNull()
    })
  })

  it('is not there before a game has finished here', () => {
    render(Home, { navigate })
    expect(screen.queryByRole('heading', { name: 'Past party games' })).toBeNull()
  })

  describe('paging', () => {
    function file(count: number): void {
      for (let minute = 1; minute <= count; minute++) {
        savePastGame({
          code: `ROOM${String(minute).padStart(2, '0')}`,
          finishedAt: new Date(Date.UTC(2026, 9, 1, 20, minute)).toISOString(),
          standings: [],
          youId: null,
        })
      }
    }

    const section = (): HTMLElement =>
      screen.getByRole('heading', { name: 'Past party games' }).closest('section')!
    const shown = (): string[] =>
      within(section())
        .getAllByText(/^ROOM\d+$/)
        .map((node) => node.textContent!)

    it('shows the newest five, with no controls when they all fit', () => {
      file(5)
      render(Home, { navigate })
      expect(shown()).toEqual(['ROOM05', 'ROOM04', 'ROOM03', 'ROOM02', 'ROOM01'])
      expect(within(section()).queryByRole('navigation')).toBeNull()
    })

    it('steps back a page when the last game on it is removed', async () => {
      file(6)
      render(Home, { navigate })
      await fireEvent.click(within(section()).getByRole('button', { name: 'Older' }))
      expect(shown()).toEqual(['ROOM01'])
      await fireEvent.click(
        within(section()).getByRole('button', { name: 'Remove ROOM01 from past party games' }),
      )
      await fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
      )
      expect(shown()).toEqual(['ROOM06', 'ROOM05', 'ROOM04', 'ROOM03', 'ROOM02'])
      expect(within(section()).queryByRole('navigation')).toBeNull()
    })

    it('steps through older games and back, and stops at either end', async () => {
      file(12)
      render(Home, { navigate })
      const newer = (): HTMLButtonElement =>
        within(section()).getByRole('button', { name: 'Newer' })
      const older = (): HTMLButtonElement =>
        within(section()).getByRole('button', { name: 'Older' })
      expect(within(section()).getByText('Page 1 of 3')).toBeTruthy()
      expect(shown()).toEqual(['ROOM12', 'ROOM11', 'ROOM10', 'ROOM09', 'ROOM08'])
      expect(newer().disabled).toBe(true)
      await fireEvent.click(older())
      expect(shown()).toEqual(['ROOM07', 'ROOM06', 'ROOM05', 'ROOM04', 'ROOM03'])
      await fireEvent.click(older())
      expect(shown()).toEqual(['ROOM02', 'ROOM01'])
      expect(within(section()).getByText('Page 3 of 3')).toBeTruthy()
      expect(older().disabled).toBe(true)
      await fireEvent.click(newer())
      expect(within(section()).getByText('Page 2 of 3')).toBeTruthy()
    })
  })
})

describe('Suggest or report a question', () => {
  const heading = 'Talk to Reldo'

  function played(): void {
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [
        {
          player_id: 'a',
          display_name: 'Zezima',
          points: 900,
          rank: 1,
          points_gained: 900,
          previous_rank: null,
          avatar: null,
        },
      ],
      youId: 'a',
    })
  }

  it('is offered once a game has finished here, and goes to the form', async () => {
    played()
    render(Home, { navigate })
    const section = screen.getByRole('heading', { name: heading }).closest('section')!
    await fireEvent.click(within(section).getByRole('button', { name: 'Suggest a question' }))
    expect(navigate).toHaveBeenCalledWith('/suggest')
  })

  it("is Reldo's dialogue box, his chathead on the right", () => {
    played()
    render(Home, { navigate })
    const section = screen.getByRole('heading', { name: heading }).closest('section')!
    const box = section.querySelector('.box')!
    expect(box.classList.contains('right')).toBe(true)
    expect(within(section).getByText('Reldo')).toBeTruthy()
    expect(box.querySelector('img')?.getAttribute('src')).toBe(npcArt('reldo').url)
    expect(section.textContent).toContain(
      'Have a question idea of your own, or spotted a mistake or outdated fact?',
    )
  })

  it('offers a report beside the suggestions, once a game has finished here', async () => {
    played()
    render(Home, { navigate })
    const section = screen.getByRole('heading', { name: heading }).closest('section')!
    await fireEvent.click(within(section).getByRole('button', { name: 'Report a question' }))
    expect(navigate).toHaveBeenCalledWith('/report')
  })

  it('offers only How to play and the feedback link before a game has finished here', () => {
    render(Home, { navigate })
    const section = screen.getByRole('heading', { name: heading }).closest('section')!
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['How to play'])
    expect(section.textContent).not.toContain("Know a question we don't ask yet")
    expect(within(section).getByRole('link', { name: 'Give feedback' })).toBeTruthy()
  })

  it('links the feedback button to the Discord in a new tab', () => {
    render(Home, { navigate })
    const link = screen.getByRole('link', { name: 'Give feedback' })
    expect(link.getAttribute('href')).toBe(DISCORD_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  const TOKEN = '0123456789abcdef0123456789abcdef'

  function queued(pending: number): void {
    vi.mocked(admin.getQueue).mockResolvedValue({
      suggestions: [],
      counts: { pending, approved: 0, rejected: 0, imported: 0 },
    })
  }

  it('offers Admin with the pending suggestions to a browser holding the admin token', async () => {
    localStorage.setItem('jbi:admin', TOKEN)
    queued(3)
    render(Home, { navigate })
    const section = screen.getByRole('heading', { name: heading }).closest('section')!
    const button = await within(section).findByRole('button', { name: 'Admin (3)' })
    expect(admin.getQueue).toHaveBeenCalledWith(TOKEN, 'pending')
    await fireEvent.click(button)
    expect(navigate).toHaveBeenCalledWith('/admin')
  })

  it('leaves the count off Admin when nothing is pending or the token is refused', async () => {
    localStorage.setItem('jbi:admin', TOKEN)
    queued(0)
    render(Home, { navigate })
    await waitFor(() => expect(admin.getQueue).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Admin' })).toBeTruthy()
    cleanup()

    vi.mocked(admin.getQueue).mockRejectedValue(new api.ApiFailure(401, 'unauthorized', 'no'))
    render(Home, { navigate })
    await waitFor(() => expect(admin.getQueue).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Admin' })).toBeTruthy()
  })

  it('offers Admin to no other browser, and asks the server nothing', () => {
    played()
    render(Home, { navigate })
    expect(screen.queryByRole('button', { name: /^Admin/ })).toBeNull()
    expect(admin.getQueue).not.toHaveBeenCalled()
  })
})
