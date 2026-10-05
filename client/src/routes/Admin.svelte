<script lang="ts">
  /**
   * `/admin`: the operator's view of the instance. The queues of player suggestions and
   * question reports, live rooms from the server's memory, and the daily counters over a range.
   *
   * It never shows what a room holds: no names, answers or questions. The server never
   * sends them, so there is nothing here to hide. The suggestions and the reported
   * questions are the one thing here with answers in them, and they are the players' and
   * the packs', not a room's. A refused token is forgotten, so the
   * next visit starts from a fresh link rather than replaying a dead one.
   */
  import { onMount } from 'svelte'

  import HistoryChart from '../components/admin/HistoryChart.svelte'
  import ReportQueue from '../components/admin/ReportQueue.svelte'
  import SuggestionQueue from '../components/admin/SuggestionQueue.svelte'
  import Segmented from '../components/Segmented.svelte'
  import {
    forgetAdminToken,
    getCounts,
    getLive,
    refreshLabel,
    takeAdminToken,
    timeUntil,
  } from '../lib/admin'
  import type { Count, Live, LiveRoom } from '../lib/admin'
  import { buckets, modeRanking, utcToday, type Range } from '../lib/adminCharts'
  import { ApiFailure } from '../lib/api'
  import { MODES } from '../lib/modes'

  /** How often the page reloads itself while it is on screen. */
  const REFRESH_MS = 10_000

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
  let updatedAt = $state<number | null>(null)
  /** Ticks each second, so the button's age counts up between refreshes. */
  let now = $state(Date.now())
  let range = $state<Range>('90')
  let busy = false

  const today = $derived(utcToday(updatedAt ?? Date.now()))
  const bars = $derived(buckets(counts, range, today))
  const per = $derived(bars.some((b) => b.days === 7) ? 'week' : 'day')
  const ranking = $derived(modeRanking(counts, range, today))
  const topStarted = $derived(Math.max(1, ...ranking.map((r) => r.started)))
  const connected = $derived(live?.rooms.reduce((n, r) => n + r.connected, 0) ?? 0)
  const players = $derived(live?.rooms.reduce((n, r) => n + r.players, 0) ?? 0)

  function modeName(mode: string): string {
    return MODES[mode]?.label ?? mode
  }

  function roundText(room: LiveRoom): string {
    if (room.round === null) return '—'
    return `${room.round.index + 1} / ${room.round.total} · ${modeName(room.round.mode)}`
  }

  function clock(iso: string | number): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  function refuse(): void {
    forgetAdminToken()
    token = null
    view = 'refused'
  }

  async function refresh(): Promise<void> {
    if (token === null || busy) return
    busy = true
    try {
      const [nextLive, nextCounts] = await Promise.all([getLive(token), getCounts(token)])
      live = nextLive
      counts = nextCounts
      updatedAt = Date.now()
      now = updatedAt
      view = 'ready'
      failure = null
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        refuse()
      } else if (error instanceof ApiFailure && error.status === 404) {
        view = 'absent'
      } else {
        failure = error instanceof ApiFailure ? error.message : 'the refresh failed'
      }
    } finally {
      busy = false
    }
  }

  onMount(() => {
    token = takeAdminToken()
    if (token === null) {
      view = 'refused'
      return
    }
    void refresh()
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
    <h1>Admin</h1>
    <button type="button" onclick={() => void refresh()}>{refreshLabel(updatedAt, now)}</button>
  </div>
  {#if failure !== null}
    <div class="banner bad" role="alert">{failure}</div>
  {/if}

  {#if view === 'ready' && token !== null}
    <SuggestionQueue {token} onrefused={refuse} />
    <ReportQueue {token} onrefused={refuse} />
  {/if}

  {#if live !== null}
    <section class="panel" aria-labelledby="live-heading">
      <h2 id="live-heading">Live rooms</h2>
      <dl class="tiles">
        <div><dt>Rooms in memory</dt><dd>{live.rooms.length}</dd></div>
        <div><dt>Open sockets</dt><dd>{live.sockets}</dd></div>
        <div><dt>Players connected</dt><dd>{connected} <small>/ {players}</small></dd></div>
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
                        <span style:width="{room.players > 0 ? (room.connected / room.players) * 100 : 0}%"
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
      <HistoryChart
        title="Games per {per}, by how they ended"
        kind="stacked"
        days={bars.map((b) => b.start)}
        series={[
          { label: 'finished', tone: 'ok', values: bars.map((b) => b.finished) },
          { label: 'ended early', tone: 'muted', values: bars.map((b) => b.endedEarly) },
          { label: 'abandoned', tone: 'bad', values: bars.map((b) => b.abandoned) },
        ]}
      />
      <HistoryChart
        title="Players per {per}"
        kind="lines"
        height={120}
        days={bars.map((b) => b.start)}
        series={[
          { label: 'joined', tone: 'accent', values: bars.map((b) => b.joined) },
          { label: 'returning', tone: 'warn', values: bars.map((b) => b.returning) },
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
                <span class="unfinished" style:width="{((rank.started - rank.finished) / topStarted) * 100}%"
                ></span>
              </span>
              <span class="count">{rank.started} <small>({rank.finished} finished)</small></span>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .heading h1 {
    flex: 1;
    margin: 0;
  }

  .heading button {
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
