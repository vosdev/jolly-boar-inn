<script lang="ts">
  /**
   * `/admin`: the operator's view of the instance, in five tabs, each at its own path.
   * Overview has the live rooms from the server's memory and the daily counters over a
   * range; Suggestions and Reports are the players' queues, each tab badged with what
   * waits in it; Questions edits the hand-written packs and Roster the popular items.
   *
   * It never shows what a room holds: no names, answers or questions. The server never
   * sends them, so there is nothing here to hide. The suggestions, the reported questions
   * and the packs are the one thing here with answers in them, and they are the players'
   * and the packs', not a room's. A refused token is forgotten, so the next visit starts
   * from a fresh link rather than replaying a dead one.
   */
  import { onMount, untrack } from 'svelte'

  import BreakdownList from '../components/admin/BreakdownList.svelte'
  import HistoryChart from '../components/admin/HistoryChart.svelte'
  import PackQuestions from '../components/admin/PackQuestions.svelte'
  import RosterItems from '../components/admin/RosterItems.svelte'
  import ReportQueue from '../components/admin/ReportQueue.svelte'
  import SuggestionQueue from '../components/admin/SuggestionQueue.svelte'
  import Segmented from '../components/Segmented.svelte'
  import {
    adminPath,
    getCounts,
    getLive,
    getQueue,
    getReports,
    refreshLabel,
    refuseAdminToken,
    takeAdminToken,
    timeUntil,
    type AdminTab,
  } from '../lib/admin'
  import type { Count, Live, LiveRoom } from '../lib/admin'
  import {
    breakdown,
    FAILURE_GROUPS,
    headline,
    joinFunnel,
    modeRanking,
    ROUND_LENGTHS,
    roundLengths,
    series,
    total,
    utcToday,
    type Figure,
    type Range,
  } from '../lib/adminCharts'
  import { ApiFailure } from '../lib/api'
  import { TYPE_LABELS } from '../lib/customQuestions'
  import { MODES } from '../lib/modes'
  import { loadScreenshots } from '../lib/screenshots.svelte'

  let {
    tab = 'overview',
    navigate = () => {},
  }: { tab?: AdminTab; navigate?: (to: string) => void } = $props()

  /** How often the overview reloads itself while it is on screen. */
  const REFRESH_MS = 10_000

  const TABS: { tab: AdminTab; label: string }[] = [
    { tab: 'overview', label: 'Overview' },
    { tab: 'suggestions', label: 'Suggestions' },
    { tab: 'reports', label: 'Reports' },
    { tab: 'questions', label: 'Questions' },
    { tab: 'roster', label: 'Roster' },
  ]

  const ROUTES: Record<string, string> = {
    public: 'Public list',
    invite: 'Invite link',
    code: 'Code typed on Home',
    link: 'Link to the room',
  }

  const FAILURES: Record<string, string> = {
    not_found: 'Unknown code',
    name_taken: 'Name taken',
    room_full: 'Room full',
    not_joinable: 'Game started or over',
    bad_key: 'Old invite link',
    requests_full: 'Too many asking',
    request_denied: 'Host said no',
  }

  const FREQUENCIES: Record<string, string> = { less: 'Less', default: 'Default', more: 'More' }

  const LENGTHS = ['0-10', '10-20', '20-30', '30-45', '45-60', '60+']

  const PLAYER_COUNTS = ['1', '2-4', '5-9', '10-19', '20+']

  const ROUNDS = ['1', '2', '3', '4', '5', '6', '7', '8+']

  /** The failures in the order of who they are down to, so each group reads together. */
  const FAILURE_ORDER = (['player', 'ours', 'host'] as const).flatMap((group) =>
    Object.keys(FAILURE_GROUPS).filter((key) => FAILURE_GROUPS[key] === group),
  )

  const GROUPS = ['audience', 'gameplay', 'funnel'] as const
  type Group = (typeof GROUPS)[number]

  /** Which breakdown groups are open, kept per browser: a convenience, so storage may fail. */
  const OPEN_GROUPS = 'jbi:admin-open-groups'

  function readOpen(): Record<Group, boolean> {
    const open = { audience: false, gameplay: false, funnel: false }
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(OPEN_GROUPS) ?? '[]')
      if (Array.isArray(saved)) for (const g of GROUPS) open[g] = saved.includes(g)
    } catch {
      // Unreadable or denied: every group starts closed.
    }
    return open
  }

  function saveOpen(open: Record<Group, boolean>): void {
    try {
      localStorage.setItem(OPEN_GROUPS, JSON.stringify(GROUPS.filter((g) => open[g])))
    } catch {
      // Denied: the groups start closed next time.
    }
  }

  const RANGES: { value: Range; label: string }[] = [
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
    { value: '365', label: '1 year' },
    { value: 'all', label: 'All' },
  ]

  let token = $state<string | null>(null)
  let view = $state<'loading' | 'ready' | 'refused' | 'absent'>('loading')
  let failure = $state<string | null>(null)
  let live = $state<Live | null>(null)
  let counts = $state<Count[]>([])
  /** What waits in each queue, for its tab's badge; absent until known. */
  let waiting = $state<Partial<Record<AdminTab, number>>>({})
  let updatedAt = $state<number | null>(null)
  /** Ticks each second, so the button's age counts up between refreshes. */
  let now = $state(Date.now())
  let range = $state<Range>('90')
  let opened = $state(readOpen())
  let busy = false

  const today = $derived(utcToday(updatedAt ?? Date.now()))
  const figures = $derived(headline(counts, range, today))
  const games = $derived(
    series(counts, range, today, ['games_finished', 'games_ended_early', 'games_abandoned']),
  )
  const joins = $derived(series(counts, range, today, ['players_joined', 'players_returning']))
  const peaks = $derived(series(counts, range, today, ['peak_players', 'peak_rooms']))
  const tiles = $derived([
    { label: 'Games', figure: figures.games, rate: false, none: 'No games' },
    { label: 'Players', figure: figures.players, rate: false, none: 'No players' },
    { label: 'Finish rate', figure: figures.finishRate, rate: true, none: 'No games' },
    { label: 'Return rate', figure: figures.returnRate, rate: true, none: 'No players' },
  ])
  const funnel = $derived(joinFunnel(counts, range, today))
  const failedJoins = $derived(funnel.failed.player + funnel.failed.ours + funnel.failed.host)
  const ranking = $derived(modeRanking(counts, range, today))
  const topStarted = $derived(Math.max(1, ...ranking.map((r) => r.started)))
  const of = (metrics: string[], order?: string[]) =>
    breakdown(counts, range, today, metrics, order)
  const closes = $derived(
    of(['questions_all_answered', 'questions_timed_out', 'questions_skipped']),
  )
  const routes = $derived(of(['join_routes']))
  const failures = $derived(of(['join_failures'], FAILURE_ORDER))
  const sizes = $derived(of(['game_players'], PLAYER_COUNTS))
  const rounds = $derived(of(['ended_early_at_round', 'abandoned_at_round'], ROUNDS))
  const roundTimes = $derived(roundLengths(counts, range, today))
  const frequencies = $derived(of(['event_frequency']))
  const customTypes = $derived(of(['custom_questions']))
  const customGames = $derived(total(counts, range, today, 'games_with_custom'))
  const rematches = $derived(total(counts, range, today, 'rematches'))
  const lengths = $derived(of(['game_durations'], LENGTHS))
  const connected = $derived(live?.rooms.reduce((n, r) => n + r.connected, 0) ?? 0)
  const players = $derived(live?.rooms.reduce((n, r) => n + r.players, 0) ?? 0)

  function modeName(mode: string): string {
    return MODES[mode]?.label ?? mode
  }

  function named(names: Record<string, string>): (key: string) => string {
    return (key) => names[key] ?? key
  }

  function toggle(group: Group, event: Event): void {
    opened[group] = (event.currentTarget as HTMLDetailsElement).open
    saveOpen(opened)
  }

  function percent(share: number): string {
    return `${Math.round(share * 100)}%`
  }

  /** A share of `whole`, or nothing to say when there is no whole. */
  function shareOf(part: number, whole: number): string {
    return whole === 0 ? '—' : percent(part / whole)
  }

  /** How a figure moved since the previous period: relative for a count, points for a rate. */
  function changeText(figure: Figure, rate: boolean): string {
    if (figure.change === null) return 'nothing to compare'
    const amount = Math.round(figure.change * 100)
    if (amount === 0) return 'no change'
    const sign = amount > 0 ? '+' : '−'
    return `${sign}${Math.abs(amount)}${rate ? ' pts' : '%'}`
  }

  function lengthName(key: string): string {
    return key.endsWith('+') ? `${key} min` : `${key.replace('-', '–')} min`
  }

  function roundText(room: LiveRoom): string {
    if (room.round === null) return '—'
    return `${room.round.index + 1} / ${room.round.total} · ${modeName(room.round.mode)}`
  }

  function clock(iso: string | number): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  /** Falls back from a link's refused token to the stored one, else shows the refusal. */
  function refuse(used: string | null = token): void {
    // A second request on the same refused token answers after the fallback is in place.
    if (used === null || used !== token) return
    token = refuseAdminToken(used)
    if (token === null) view = 'refused'
  }

  /** A 401 or 404 decides the whole page; anything else is the tab's own to report. */
  function decides(error: unknown, used: string): boolean {
    if (error instanceof ApiFailure && error.status === 401) refuse(used)
    else if (error instanceof ApiFailure && error.status === 404) view = 'absent'
    else return false
    return true
  }

  async function refresh(): Promise<void> {
    if (token === null || busy || tab !== 'overview') return
    const used = token
    busy = true
    try {
      const [nextLive, nextCounts] = await Promise.all([getLive(used), getCounts(used)])
      live = nextLive
      counts = nextCounts
      updatedAt = Date.now()
      now = updatedAt
      view = 'ready'
      failure = null
    } catch (error) {
      if (!decides(error, used))
        failure = error instanceof ApiFailure ? error.message : 'the refresh failed'
    } finally {
      busy = false
    }
    // A refusal elsewhere may fall back to the stored token while this ran, and a refresh
    // asked for meanwhile was turned away by `busy`.
    if (token !== used) void refresh()
  }

  async function countWaiting(): Promise<void> {
    if (token === null) return
    const used = token
    try {
      const [suggested, reported] = await Promise.all([
        getQueue(used, 'pending'),
        getReports(used, 'open'),
      ])
      waiting = { suggestions: suggested.counts.pending, reports: reported.counts.open }
      if (view === 'loading' && tab !== 'overview') view = 'ready'
    } catch (error) {
      if (!decides(error, used) && view === 'loading' && tab !== 'overview') view = 'ready'
    }
  }

  function go(event: MouseEvent, to: AdminTab): void {
    // A modified click is somebody asking for a new tab; let the browser have it.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate(adminPath(to))
  }

  onMount(() => {
    token = takeAdminToken()
    if (token === null) {
      view = 'refused'
      return
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_MS)
    const ticker = setInterval(() => (now = Date.now()), 1000)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      clearInterval(ticker)
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  // Once the token is read, and on every change of tab: the queues may have moved since.
  $effect(() => {
    void [tab, token]
    untrack(() => {
      void refresh()
      void countWaiting()
      if (token !== null) void loadScreenshots(token)
    })
  })
</script>

{#if view === 'absent'}
  <section class="panel">
    <h1>Not found</h1>
    <p>There is no admin view on this server.</p>
  </section>
{:else if view === 'refused'}
  <section class="panel">
    <h1>Admin</h1>
    <p>That admin token was refused.</p>
  </section>
{:else}
  <div class="panel heading">
    <div class="title">
      <h1>Admin</h1>
      {#if tab === 'overview'}
        <button type="button" onclick={() => void refresh()}>{refreshLabel(updatedAt, now)}</button>
      {/if}
    </div>
    <nav aria-label="Admin">
      {#each TABS as each (each.tab)}
        <a
          href={adminPath(each.tab)}
          aria-current={tab === each.tab ? 'page' : undefined}
          onclick={(event) => go(event, each.tab)}
        >
          {each.label}
          {#if waiting[each.tab]}
            <span class="badge">{waiting[each.tab]}</span>
          {/if}
        </a>
      {/each}
    </nav>
  </div>
  {#if failure !== null}
    <div class="banner bad">{failure}</div>
  {/if}

  {#if view === 'ready' && token !== null}
    {#if tab === 'suggestions'}
      <SuggestionQueue {token} onrefused={refuse} />
    {:else if tab === 'reports'}
      <ReportQueue {token} onrefused={refuse} />
    {:else if tab === 'questions'}
      <PackQuestions {token} onrefused={refuse} />
    {:else if tab === 'roster'}
      <RosterItems {token} onrefused={refuse} />
    {/if}
  {/if}

  {#if tab === 'overview' && live !== null}
    <section class="panel" aria-labelledby="live-heading">
      <h2 id="live-heading">Live rooms</h2>
      <dl class="tiles">
        <div>
          <dt>Rooms in memory</dt>
          <dd>{live.rooms.length}</dd>
        </div>
        <div>
          <dt>Open sockets</dt>
          <dd>{live.sockets}</dd>
        </div>
        <div>
          <dt>Players connected</dt>
          <dd>{connected} <small>/ {players}</small></dd>
        </div>
      </dl>
      {#if live.rooms.length === 0}
        <p class="note">No rooms in memory.</p>
      {:else}
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Status</th>
                <th scope="col">Round</th>
                <th scope="col">Players</th>
                <th scope="col">Created</th>
                <th scope="col">Deleted in</th>
              </tr>
            </thead>
            <tbody>
              {#each live.rooms as room (room.code)}
                <tr>
                  <td class="room-code">{room.code}</td>
                  <td><span class="status {room.status}">{room.status}</span></td>
                  <td>
                    {roundText(room)}
                    {#if room.waiting}<span class="note">waiting</span>{/if}
                  </td>
                  <td>
                    <span class="players">
                      <span class="meter" aria-hidden="true">
                        <span
                          style:width="{room.players > 0
                            ? (room.connected / room.players) * 100
                            : 0}%"
                        ></span>
                      </span>
                      {room.connected} / {room.players}
                    </span>
                  </td>
                  <td>{clock(room.created_at)}</td>
                  <td>{timeUntil(room.deletes_at, updatedAt ?? Date.now())}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="panel" aria-labelledby="history-heading">
      <div class="history-head">
        <h2 id="history-heading">History</h2>
        <Segmented legend="Range" options={RANGES} bind:value={range} />
      </div>
      <dl class="headline" aria-label="The range in figures">
        {#each tiles as tile (tile.label)}
          <div class="tile">
            <dt>{tile.label}</dt>
            <dd class="value">
              {#if tile.figure.value === null || (!tile.rate && tile.figure.value === 0)}
                {tile.none}
              {:else}
                {tile.rate ? percent(tile.figure.value) : tile.figure.value}
              {/if}
            </dd>
            {#if figures.compared}
              <dd
                class="change"
                class:up={(tile.figure.change ?? 0) > 0}
                class:down={(tile.figure.change ?? 0) < 0}
              >
                {changeText(tile.figure, tile.rate)}
              </dd>
            {/if}
          </div>
        {/each}
      </dl>
      <p class="note">
        Over the last {figures.days} full {figures.days === 1 ? 'day' : 'days'}, today left out{figures.compared
          ? `, against the ${figures.days} before`
          : ''}. Finish rate is finished games over games that ended; return rate is returning
        players over players who joined.
      </p>
      <HistoryChart
        title={games.smoothed ? 'Games a day, 7-day average' : 'Games per day, by how they ended'}
        kind={games.smoothed ? 'lines' : 'stacked'}
        days={games.days}
        partial
        series={[
          { label: 'finished', tone: 'ok', values: games.values[0] ?? [] },
          { label: 'ended early', tone: 'muted', values: games.values[1] ?? [] },
          { label: 'abandoned', tone: 'bad', values: games.values[2] ?? [] },
        ]}
      />
      {#if rematches > 0}
        <p class="note">
          {rematches}
          {rematches === 1 ? 'game was a rematch' : 'games were rematches'} at the same table.
        </p>
      {/if}
      <HistoryChart
        title={joins.smoothed ? 'Players a day, 7-day average' : 'Players per day'}
        kind="lines"
        height={120}
        days={joins.days}
        partial
        series={[
          { label: 'joined', tone: 'accent', values: joins.values[0] ?? [] },
          { label: 'returning', tone: 'warn', values: joins.values[1] ?? [] },
        ]}
      />
      <h3>Modes by rounds started</h3>
      {#if ranking.length === 0}
        <p class="note">No rounds in this range.</p>
      {:else}
        <ol class="ranking">
          {#each ranking as rank (rank.mode)}
            <li>
              <span class="mode">{modeName(rank.mode)}</span>
              <span class="track" aria-hidden="true">
                <span class="finished" style:width="{(rank.finished / topStarted) * 100}%"></span>
                <span
                  class="unfinished"
                  style:width="{((rank.started - rank.finished) / topStarted) * 100}%"
                ></span>
              </span>
              <span class="count">{rank.started} <small>({rank.finished} finished)</small></span>
            </li>
          {/each}
        </ol>
      {/if}
      <details class="group" open={opened.audience} ontoggle={(e) => toggle('audience', e)}>
        <summary><h3>Audience</h3></summary>
        <HistoryChart
          title={peaks.smoothed
            ? 'Most at once, 7-day average of each day’s peak'
            : 'Most at once, each day'}
          kind="lines"
          height={120}
          days={peaks.days}
          partial
          series={[
            { label: 'players connected', tone: 'accent', values: peaks.values[0] ?? [] },
            { label: 'rooms in use', tone: 'ok', values: peaks.values[1] ?? [] },
          ]}
        />
        <div class="breakdowns">
          <BreakdownList
            title="Games started by players in them"
            rows={sizes}
            parts={[{ label: 'games', tone: 'accent' }]}
          />
          <BreakdownList
            title="How players got in"
            rows={routes}
            label={named(ROUTES)}
            parts={[{ label: 'joins', tone: 'accent' }]}
          />
        </div>
      </details>
      <details class="group" open={opened.gameplay} ontoggle={(e) => toggle('gameplay', e)}>
        <summary><h3>Gameplay</h3></summary>
        <div class="breakdowns">
          <BreakdownList
            title="How questions closed, by mode"
            rows={closes}
            label={modeName}
            parts={[
              { label: 'everyone answered', tone: 'ok' },
              { label: 'time ran out', tone: 'warn' },
              { label: 'skipped', tone: 'muted' },
            ]}
          />
          <BreakdownList
            title="Finished rounds by length, by mode"
            rows={roundTimes}
            label={modeName}
            parts={ROUND_LENGTHS.map((key, i) => ({
              label: lengthName(key),
              tone: (['ok', 'accent', 'warn', 'bad'] as const)[i] ?? 'muted',
            }))}
          />
          <BreakdownList
            title="Finished games by length"
            rows={lengths}
            label={lengthName}
            parts={[{ label: 'games', tone: 'accent' }]}
          />
          <BreakdownList
            title="Games started by random event frequency"
            rows={frequencies}
            label={named(FREQUENCIES)}
            parts={[{ label: 'games', tone: 'accent' }]}
          />
          <BreakdownList
            title="Hosts' own questions by type"
            rows={customTypes}
            label={(key) => TYPE_LABELS[key as keyof typeof TYPE_LABELS] ?? key}
            parts={[{ label: 'questions', tone: 'accent' }]}
            note={customGames > 0
              ? `In ${customGames} ${customGames === 1 ? 'game' : 'games'} started.`
              : undefined}
          />
        </div>
      </details>
      <details class="group" open={opened.funnel} ontoggle={(e) => toggle('funnel', e)}>
        <summary><h3>Funnel</h3></summary>
        {#if funnel.attempts === 0}
          <p class="note">No joins in this range.</p>
        {:else}
          <p class="funnel">
            {shareOf(failedJoins, funnel.attempts)} of {funnel.attempts} join attempts failed:
            {shareOf(funnel.failed.player, funnel.attempts)} the player's mistake,
            {shareOf(funnel.failed.ours, funnel.attempts)} our limits,
            {shareOf(funnel.failed.host, funnel.attempts)} the room or its host.
          </p>
        {/if}
        <div class="breakdowns">
          <BreakdownList
            title="Join failures players saw"
            rows={failures}
            label={named(FAILURES)}
            parts={[{ label: 'failures', tone: 'bad' }]}
          />
          <BreakdownList
            title="Round a game stopped in"
            rows={rounds}
            label={(key) => `Round ${key}`}
            parts={[
              { label: 'ended early', tone: 'muted' },
              { label: 'abandoned', tone: 'bad' },
            ]}
          />
        </div>
      </details>
    </section>
  {/if}
{/if}

<style>
  .title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .title h1 {
    flex: 1;
    margin: 0;
  }

  .title button {
    font-variant-numeric: tabular-nums;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 1rem;
    border-bottom: var(--border-width) solid var(--line);
  }

  nav a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.8rem;
    color: var(--muted);
    text-decoration: none;
    border-bottom: 3px solid transparent;
    margin-bottom: calc(-1 * var(--border-width));
  }

  nav a:hover {
    color: var(--ink);
  }

  nav a[aria-current='page'] {
    color: var(--ink);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }

  .badge {
    min-width: 1.4rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.78rem;
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .note {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.75rem;
    margin: 0 0 1rem;
  }

  .tiles div {
    background: var(--panel-raised);
    border-radius: min(var(--radius), 8px);
    padding: 0.6rem 0.9rem;
  }

  dt {
    font-size: 0.85rem;
    color: var(--muted);
  }

  dd {
    margin: 0;
    font-size: 1.5rem;
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
  }

  small {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .scroll {
    overflow-x: auto;
    scrollbar-width: thin;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th {
    text-align: left;
    font-weight: normal;
    color: var(--muted);
    padding: 0.35rem 0.5rem;
  }

  td {
    padding: 0.4rem 0.5rem;
    border-top: 1px solid var(--line);
    white-space: nowrap;
  }

  .room-code {
    font-family: var(--font-display);
    letter-spacing: 0.02em;
  }

  .status {
    font-size: 0.8rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--line);
  }

  .status.playing {
    background: var(--ok);
    color: var(--ok-ink);
    border-color: var(--ok);
  }

  .status.lobby {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: var(--accent);
  }

  .players {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .meter {
    display: inline-flex;
    width: 3rem;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--panel-raised);
    border: 1px solid var(--line);
    overflow: hidden;
  }

  .meter span {
    background: var(--ok);
  }

  .history-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
  }

  .history-head h2 {
    margin: 0;
  }

  h3 {
    font-size: 0.9rem;
    font-weight: normal;
    color: var(--muted);
    margin: 0 0 0.4rem;
  }

  .headline {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
    gap: 0.75rem;
    margin: 0 0 0.5rem;
  }

  .tile {
    padding: 0.6rem 0.75rem;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
  }

  .tile dt {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .tile dd {
    margin: 0;
  }

  .tile .value {
    font-size: 1.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .tile .change {
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .tile .change.up {
    color: var(--ok);
  }

  .tile .change.down {
    color: var(--bad);
  }

  .group {
    margin-top: 1.25rem;
    border-top: var(--border-width) solid var(--line);
    padding-top: 0.5rem;
  }

  .group summary {
    cursor: pointer;
  }

  .group summary h3 {
    display: inline;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: inherit;
  }

  .funnel {
    margin: 0.75rem 0 0;
  }

  .breakdowns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 1.25rem 2rem;
    margin-top: 1.5rem;
  }

  .ranking {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .ranking li {
    display: grid;
    grid-template-columns: minmax(7rem, 11rem) minmax(0, 1fr) auto;
    grid-template-areas: 'mode track count';
    align-items: center;
    gap: 0.75rem;
    margin: 0.3rem 0;
    font-size: 0.9rem;
  }

  .mode {
    grid-area: mode;
  }

  /* A phone has no width for a bar between the name and the count, so it goes under them. */
  @media (max-width: 40rem) {
    .ranking li {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'mode count' 'track track';
      gap: 0.2rem 0.75rem;
      margin-bottom: 0.6rem;
    }
  }

  .track {
    grid-area: track;
    display: flex;
    height: 0.8rem;
    border-radius: 3px;
    overflow: hidden;
  }

  .finished {
    background: var(--muted);
  }

  .unfinished {
    background: var(--line);
  }

  .count {
    grid-area: count;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
