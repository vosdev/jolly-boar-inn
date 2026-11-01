/**
 * The shell around every screen: one bar above whatever the route draws, with no room
 * code in it, a way past it, a sign that goes home, one footer below it with the
 * version, and a first visit that can join and play with storage that throws.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.svelte'
import * as api from './lib/api'
import { savePastGame } from './lib/history'
import { LICENSE_URL, REPO_URL, VERSION_LABEL } from './lib/links'
import { profile } from './lib/profile'
import type { OpenQuestion, RoomView } from './lib/protocol'
import { applyServerMessage } from './lib/stores'
import { stubAnimations } from './test-animate'

vi.mock('./lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('./lib/api')>()
  return { ...real, getCredits: vi.fn(), getModes: vi.fn(), getRoom: vi.fn(), joinRoom: vi.fn() }
})

vi.mock('./lib/ws', () => ({
  RoomSocket: class {
    open(): void {}
    close(): void {}
    send(): boolean {
      return true
    }
  },
}))

const bar = () => document.querySelector('header')!

function at(path: string): void {
  history.replaceState(null, '', path)
  render(App)
}

/** One bar, before the screen, and no room code in it. */
function underOneBar(): void {
  expect(document.querySelectorAll('header')).toHaveLength(1)
  const main = document.querySelector('main')!
  expect(bar().compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(bar().textContent).not.toContain('ABYSSAL')
}

/** One footer, after the screen, with the version in it and none in the bar. */
function overOneFooter(): void {
  const footers = document.querySelectorAll('footer')
  expect(footers).toHaveLength(1)
  const main = document.querySelector('main')!
  expect(main.compareDocumentPosition(footers[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(
    within(footers[0]!).getByRole('button', { name: `What's new in v${VERSION_LABEL}` }),
  ).toBeTruthy()
  expect(bar().textContent).not.toContain(VERSION_LABEL)
}

const SEGMENT = { mode: 'more_less', index: 0, total: 1, start: 0, count: 1 }

const LIVE: RoomView = {
  code: 'ABYSSAL',
  status: 'playing',
  settings: {
    modes: [{ mode: 'more_less', questions: 1 }],
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
  current_index: 0,
  total: 1,
  events: 0,
  phase: 'open',
  next_at: null,
  reveal_seconds: null,
  estimated_seconds: 0,
  played: [],
  segment: SEGMENT,
  finished_at: null,
}

const QUESTION: OpenQuestion = {
  question_id: 'q1',
  index: 0,
  total: 1,
  type: 'more_less',
  mode: 'more_less',
  segment: SEGMENT,
  view: {
    metric: 'ge_price',
    direction: 'more',
    options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
    as_of: '2026-09-01',
  },
  opened_at: new Date().toISOString(),
  ends_at: new Date(Date.now() + 10_000).toISOString(),
  you_can_answer: true,
  picture: null,
  random_event: null,
  answerable_at: new Date().toISOString(),
  answered: 0,
  of: 0,
  waiting: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  profile.set({ name: 'Zezima', pet: 'aggy' })
  vi.mocked(api.getModes).mockResolvedValue([])
  vi.mocked(api.getRoom).mockResolvedValue({ status: 'lobby', players: 2 })
  vi.mocked(api.joinRoom).mockResolvedValue({
    session: 'token',
    player: {
      id: 'a',
      display_name: 'Zezima',
      role: 'player',
      connected: true,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (document.documentElement as { clientWidth?: number }).clientWidth
})

describe('App', () => {
  it.each([['/'], ['/create']])('draws %s under the one bar', async (path) => {
    at(path)
    await screen.findByRole('heading', { level: 1 })
    underOneBar()
  })

  it.each([
    ['/', true],
    ['/daily', true],
    ['/r/ABYSSAL', false],
  ])('gives %s the wide page: %s', async (path, wide) => {
    at(path)
    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('main')!.classList.contains('wide')).toBe(wide)
    const inners = document.querySelectorAll('header .inner, footer .inner')
    expect(inners).toHaveLength(2)
    for (const inner of inners) expect(inner.classList.contains('wide')).toBe(wide)
  })

  it('draws Join and then the room under the one bar, and the bar never names the room', async () => {
    at('/r/ABYSSAL')
    expect(screen.getByRole('heading', { level: 1, name: 'Room ABYSSAL' })).toBeTruthy()
    underOneBar()
    expect(await screen.findByText('Connecting…')).toBeTruthy()
    underOneBar()
  })

  it('fills the bar with GitHub and the one menu control, and nothing else', () => {
    at('/')
    const controls = within(bar()).getAllByRole('button')
    expect(controls.map((control) => control.getAttribute('aria-label'))).toEqual([
      'You are Zezima, theme Jolly Boar Inn. Open settings',
    ])
    expect(within(bar()).getByRole('link', { name: 'Source code on GitHub' })).toBeTruthy()
  })

  it('lets the keyboard skip the bar to the screen', () => {
    at('/')
    const skip = within(bar()).getByRole('link', { name: 'Skip to the game' })
    const target = document.getElementById(skip.getAttribute('href')!.slice(1))
    expect(target?.tagName).toBe('MAIN')
    expect(within(target!).getByRole('heading', { level: 1 })).toBeTruthy()
  })

  it('goes home from the sign', async () => {
    at('/create')
    await fireEvent.click(within(bar()).getByRole('link', { name: /, home$/ }))
    expect(location.pathname).toBe('/')
    expect(screen.getByRole('heading', { level: 1, name: 'The Jolly Boar Inn' })).toBeTruthy()
    expect(screen.getByLabelText('Join an existing room')).toBeTruthy()
  })

  it.each([['/'], ['/create'], ['/r/ABYSSAL']])('puts the footer under %s', async (path) => {
    at(path)
    await screen.findByRole('heading', { level: 1 })
    overOneFooter()
  })

  /** Into the room as Zezima, the room as `room` says, in a window `width` px wide. */
  async function inRoom(room: RoomView, width = 1440): Promise<void> {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: width,
    })
    at('/r/ABYSSAL')
    await screen.findByText('Connecting…')
    const you = {
      id: 'a',
      display_name: 'Zezima',
      role: 'player' as const,
      connected: true,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
    }
    applyServerMessage({
      t: 'welcome',
      room,
      you,
      players: [you],
      question: null,
      your_answer: null,
      standings: [],
      team_standings: null,
      server_time: new Date().toISOString(),
      server_version: __APP_VERSION__,
    })
  }

  it('has no footer under a live question, and names the round in the bar', async () => {
    await inRoom(LIVE)
    applyServerMessage({ t: 'question_open', question: QUESTION })
    await screen.findByText('Dragon bones')
    expect(document.querySelector('footer')).toBeNull()
    expect(bar().querySelector('.where')?.textContent?.trim()).toBe('Round 1 of 1: More or Less')
  })

  it('has no footer under a live daily on a phone, and has it under the result', async () => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 800,
    })
    at('/daily')
    await screen.findByRole('heading', { level: 1 })
    const you = {
      id: 'a',
      display_name: 'Zezima',
      role: 'player' as const,
      connected: true,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
    }
    const daily = { ...LIVE, daily: { day: '2026-11-01', number: 2 } }
    const message = {
      t: 'welcome' as const,
      room: daily,
      you,
      players: [you],
      question: null,
      your_answer: null,
      standings: [],
      team_standings: null,
      server_time: new Date().toISOString(),
      server_version: __APP_VERSION__,
    }
    applyServerMessage(message)
    await waitFor(() => expect(document.querySelector('footer')).toBeNull())
    applyServerMessage({ ...message, room: { ...daily, status: 'finished' } })
    await waitFor(() => expect(document.querySelector('footer')).not.toBeNull())
  })

  it('says nothing in the bar of a room stacked for a phone', async () => {
    await inRoom(LIVE, 800)
    applyServerMessage({ t: 'question_open', question: QUESTION })
    await screen.findByText('Dragon bones')
    expect(bar().querySelector('.where')).toBeNull()
  })

  it('puts the footer under the lobby, and says Lobby in the bar', async () => {
    await inRoom({ ...LIVE, status: 'lobby', phase: 'idle', current_index: null, segment: null })
    await screen.findByRole('heading', { level: 1, name: 'Lobby' })
    overOneFooter()
    expect(bar().querySelector('.where')?.textContent?.trim()).toBe('Lobby')
  })

  it('links to the source from the bar and the footer, and to the licence and the release', () => {
    at('/')
    const footer = within(document.querySelector('footer')!)
    expect(
      within(bar()).getByRole('link', { name: 'Source code on GitHub' }).getAttribute('href'),
    ).toBe(REPO_URL)
    expect(footer.getByRole('link', { name: 'Source on GitHub' }).getAttribute('href')).toBe(
      REPO_URL,
    )
    expect(footer.getByRole('link', { name: 'AGPL-3.0' }).getAttribute('href')).toBe(LICENSE_URL)
    expect(footer.getByText(/trademarks of Jagex Limited/)).toBeTruthy()
    expect(LICENSE_URL).toBe('https://github.com/vosdev/jolly-boar-inn/blob/main/LICENSE')
  })

  it('points to the source from the footer of Home', () => {
    at('/')
    expect(
      within(document.querySelector('footer')!)
        .getByRole('link', { name: 'Source on GitHub' })
        .getAttribute('href'),
    ).toBe(REPO_URL)
  })

  it('leaves an invite link in the address bar for Join to read', async () => {
    at('/r/ABYSSAL#k=abc')
    await waitFor(() => expect(api.joinRoom).toHaveBeenCalledOnce())
    expect(vi.mocked(api.joinRoom).mock.calls[0]![4]).toBe('abc')
  })

  it('tidies any other fragment away', () => {
    at('/r/ABYSSAL#t=old')
    expect(location.hash).toBe('')
  })

  it('with storage throwing, lets a first visit join a room and play in it', async () => {
    const denied = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(denied)
    }
    profile.set(null)
    at('/r/CABBAGE')
    await fireEvent.click(await screen.findByRole('button', { name: 'Join' }))
    await waitFor(() => expect(api.joinRoom).toHaveBeenCalledOnce())
    expect(await screen.findByText('Connecting…')).toBeTruthy()
    expect(within(bar()).getByRole('button', { name: /^You are / })).toBeTruthy()
  })

  it('draws a past game from this browser alone, and says so for one it never kept', async () => {
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
    at('/history/ABYSSAL/2610012005')
    await screen.findByRole('heading', { level: 1, name: 'Final standings' })
    expect(screen.getByText('Gz, Zezima! Here are the full hiscores.')).toBeTruthy()
    expect(document.querySelector('.hiscores .gain')).toBeNull()
    expect(screen.queryByText(/The room has closed/)).toBeNull()
    cleanup()

    at('/history/ABYSSAL/2610012006')
    await screen.findByText("I've no record of that game. This browser kept no hiscores for it.")
  })

  it("offers the credits in every screen's footer", async () => {
    vi.mocked(api.getCredits).mockResolvedValue({ authors: [{ name: 'Tayka', questions: 17 }] })
    at('/')
    const footer = within(document.querySelector('footer')!)
    await fireEvent.click(footer.getByRole('button', { name: 'Credits' }))
    expect(await screen.findByRole('cell', { name: 'Tayka' })).toBeTruthy()
    cleanup()
    at('/create')
    expect(
      within(document.querySelector('footer')!).getByRole('button', { name: 'Credits' }),
    ).toBeTruthy()
  })

  it('no longer draws the credits at /credits', async () => {
    at('/credits')
    expect(screen.queryByRole('heading', { name: 'Credits' })).toBeNull()
    expect(api.getCredits).not.toHaveBeenCalled()
  })

  it('opens the admin view at /admin, taking the token out of the address bar', async () => {
    const token = '0123456789abcdef0123456789abcdef'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
    try {
      at(`/admin#token=${token}`)
      await screen.findByText('That admin token was refused.')
      expect(location.pathname).toBe('/admin')
      expect(location.href).not.toContain(token)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('opens an admin tab at its own path, which a refused token leaves in place', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
    try {
      at('/admin/questions#token=0123456789abcdef0123456789abcdef')
      await screen.findByText('That admin token was refused.')
      expect(location.pathname).toBe('/admin/questions')
      expect(location.hash).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  describe('How to play', () => {
    beforeEach(() => {
      vi.mocked(api.getModes).mockResolvedValue([
        { id: 'more_less', types: ['more_less'], questions: null, seconds: null, as_of: null },
      ])
    })

    const heading = (): Promise<HTMLElement> => screen.findByRole('heading', { level: 1 })

    it.each([
      ['/how-to-play', 'How to play'],
      ['/how-to-play/more-or-less', 'More or Less'],
      ['/how-to-play/random-events', 'Random events'],
      ['/how-to-play/no-such-mode', 'How to play'],
    ])('draws %s on the wide page as %s', async (path, title) => {
      at(path)
      expect((await heading()).textContent).toBe(title)
      expect(document.querySelector('main')!.classList.contains('wide')).toBe(true)
      expect(location.pathname).toBe(path)
    })

    it("opens from Home's How to play at its own address, and Back steps out a view at a time", async () => {
      at('/')
      await fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
      expect(location.pathname).toBe('/how-to-play')
      await screen.findByRole('heading', { level: 1, name: 'How to play' })
      await fireEvent.click(screen.getByRole('button', { name: /^More or Less/ }))
      expect(location.pathname).toBe('/how-to-play/more-or-less')
      await screen.findByRole('heading', { level: 1, name: 'More or Less' })
      history.back()
      await screen.findByRole('heading', { level: 1, name: 'How to play' })
      history.back()
      await waitFor(() => expect(screen.getByLabelText('Join an existing room')).toBeTruthy())
      expect(location.pathname).toBe('/')
    })

    it('goes back to the overview from All game modes, and to Home from Back', async () => {
      at('/')
      await fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
      await fireEvent.click(await screen.findByRole('button', { name: /^Bestiary/ }))
      await fireEvent.click(await screen.findByRole('button', { name: '← All game modes' }))
      await waitFor(() => expect(location.pathname).toBe('/how-to-play'))
      await fireEvent.click(await screen.findByRole('button', { name: /^Drop Table/ }))
      await fireEvent.click(await screen.findByRole('button', { name: '← All game modes' }))
      await waitFor(() => expect(location.pathname).toBe('/how-to-play'))
      await fireEvent.click(await screen.findByRole('button', { name: '← Back' }))
      await waitFor(() => expect(screen.getByLabelText('Join an existing room')).toBeTruthy())
      expect(location.pathname).toBe('/')
      expect(history.state).toBeNull()
    })

    it('leaves a shared link for Home and the overview all the same', async () => {
      at('/how-to-play/more-or-less')
      await fireEvent.click(await screen.findByRole('button', { name: '← All game modes' }))
      await screen.findByRole('heading', { level: 1, name: 'How to play' })
      expect(location.pathname).toBe('/how-to-play')
      await fireEvent.click(screen.getByRole('button', { name: '← Back' }))
      await waitFor(() => expect(screen.getByLabelText('Join an existing room')).toBeTruthy())
      expect(location.pathname).toBe('/')
    })
  })

  it('links to /admin from Home alone, which shows it only to a browser holding the token', () => {
    const sources = import.meta.glob(['./**/*.svelte', './**/*.ts', '!./**/*.test.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    const linking = Object.entries(sources)
      .filter(([, text]) =>
        /(href=|navigate\(|pushState\([^)]*)['"`{]?\/admin\b/.test(String(text)),
      )
      .map(([path]) => path)
    expect(linking).toEqual(['./routes/Home.svelte'])
  })
})

describe('App, in a team game', () => {
  const TEAMS: RoomView['settings']['teams'] = ['saradomin', 'zamorak']
  const LOBBY: RoomView = {
    ...LIVE,
    status: 'lobby',
    phase: 'idle',
    current_index: null,
    settings: { ...LIVE.settings, teams: TEAMS },
  } as RoomView
  const player = (team: 'saradomin' | 'zamorak' | null) => ({
    id: 'a',
    display_name: 'Zezima',
    role: 'player' as const,
    connected: true,
    avatar: null,
    ready: false,
    editing: false,
    team,
  })
  const frame = () => document.documentElement.dataset.team
  const hanging = () => bar().querySelector('.hang')?.textContent?.trim() ?? null

  async function joined(room: RoomView, team: 'saradomin' | 'zamorak' | null): Promise<void> {
    at('/r/ABYSSAL')
    await screen.findByText('Connecting…')
    applyServerMessage({
      t: 'welcome',
      room,
      you: player(team),
      players: [player(team)],
      question: null,
      your_answer: null,
      standings: [],
      team_standings: null,
      server_time: new Date().toISOString(),
      server_version: __APP_VERSION__,
    })
  }

  afterEach(() => {
    cleanup()
    delete document.documentElement.dataset.team
  })

  it("frames a player in a team: the god's colours, its symbol for the sign, its badge", async () => {
    await joined(LOBBY, 'zamorak')
    await waitFor(() => expect(frame()).toBe('zamorak'))
    expect(bar().classList.contains('framed')).toBe(true)
    expect(bar().querySelector('.home img, .home svg[data-team="zamorak"]')).toBeTruthy()
    expect(within(bar()).getByRole('link', { name: /, home$/ })).toBeTruthy()
    expect(hanging()).toBe('Zamorak')
  })

  it('frames nobody teamless', async () => {
    await joined(LOBBY, null)
    await waitFor(() => expect(screen.queryByText('Connecting…')).toBeNull())
    expect(frame()).toBeUndefined()
    expect(bar().classList.contains('framed')).toBe(false)
    expect(hanging()).toBeNull()
  })

  it('repaints on a change of team, and takes the frame off when the team is dropped', async () => {
    await joined(LOBBY, 'zamorak')
    await waitFor(() => expect(frame()).toBe('zamorak'))
    applyServerMessage({ t: 'players_updated', players: [player('saradomin')] })
    await waitFor(() => expect(frame()).toBe('saradomin'))
    expect(hanging()).toBe('Saradomin')
    applyServerMessage({
      t: 'room_updated',
      room: { ...LOBBY, settings: { ...LOBBY.settings, teams: ['zamorak', 'guthix'] } },
      players: [player(null)],
    })
    await waitFor(() => expect(frame()).toBeUndefined())
    expect(hanging()).toBeNull()
  })

  it('takes the frame off on leaving the room', async () => {
    await joined(LOBBY, 'zamorak')
    await waitFor(() => expect(frame()).toBe('zamorak'))
    await fireEvent.click(within(bar()).getByRole('link', { name: /, home$/ }))
    expect(location.pathname).toBe('/')
    expect(frame()).toBeUndefined()
    expect(bar().classList.contains('framed')).toBe(false)
  })

  it("paints the timer in the god's colours and hangs the badge from it", async () => {
    await joined({ ...LIVE, settings: { ...LIVE.settings, teams: TEAMS } }, 'zamorak')
    applyServerMessage({ t: 'question_open', question: QUESTION })
    await screen.findByText('Dragon bones')
    const timer = document.querySelector('.timerbar')!
    expect(timer.classList.contains('framed')).toBe(true)
    expect(timer.querySelector('.team')!.textContent!.trim()).toBe('Zamorak')
    expect(hanging()).toBeNull()
  })

  it("leaves the timer in the theme's colours outside a team game", async () => {
    await joined(LIVE, null)
    applyServerMessage({ t: 'question_open', question: QUESTION })
    await screen.findByText('Dragon bones')
    const timer = document.querySelector('.timerbar')!
    expect(timer.classList.contains('framed')).toBe(false)
    expect(timer.querySelector('.team')).toBeNull()
  })
})

describe('App, between screens', () => {
  let unstub: () => void
  beforeEach(() => {
    unstub = stubAnimations()
  })
  afterEach(() => {
    unstub()
  })

  it('fades the old screen out before the new one is shown in', async () => {
    at('/suggest')
    const old = document.querySelector('main .route')!
    history.pushState(null, '', '/report')
    dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(document.querySelectorAll('main .route')).toHaveLength(2))
    expect(old.isConnected).toBe(true)
    await waitFor(() => expect(document.querySelectorAll('main .route')).toHaveLength(1))
    expect(old.isConnected).toBe(false)
  })

  it('cuts under reduced motion', async () => {
    const real = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    })) as typeof window.matchMedia
    try {
      at('/suggest')
      history.pushState(null, '', '/report')
      dispatchEvent(new PopStateEvent('popstate'))
      await waitFor(() => expect(document.querySelectorAll('main .route')).toHaveLength(1))
    } finally {
      window.matchMedia = real
    }
  })
})
