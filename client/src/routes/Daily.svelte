<script lang="ts">
  /**
   * `/daily`: the day's set, alone and once, from a link with no room code.
   *
   * Start asks the server for a room built from the stored set (`POST /api/daily`) and
   * plays it in `Room`, which knows a daily room by `room.daily`. Opening the page again
   * while an attempt runs, or after one today, goes straight to the server, which resumes
   * the attempt with a fresh session or refuses with `daily_played`. Either end, finishing
   * or that refusal, shows the result (`DailyResult`) for the attempt's own day. An attempt
   * left unfinished here may have run out on the server since, so that is asked first: a
   * start would otherwise begin today's without a word.
   *
   * The name is the profile's, else a generated one. Nobody else sees it.
   */
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'

  import DailyResultScreen from '../components/DailyResult.svelte'
  import { ApiFailure, getDaily, getDailyResult, startDaily, type DailyToday } from '../lib/api'
  import {
    dailyToken,
    lastDaily,
    noteDaily,
    resumes,
    saveScore,
    type DailyResult,
  } from '../lib/daily'
  import { generateName } from '../lib/names'
  import { profile } from '../lib/profile'
  import { setSession } from '../lib/session'
  import { room } from '../lib/stores'
  import Room from './Room.svelte'

  let { navigate }: { navigate: (to: string) => void } = $props()

  type View =
    | { name: 'loading' }
    | { name: 'intro'; today: DailyToday }
    | { name: 'playing'; code: string }
    | { name: 'result'; result: DailyResult }
    | { name: 'error'; message: string }

  let view = $state<View>({ name: 'loading' })
  let starting = $state(false)

  onMount(() => {
    void (async () => {
      try {
        const today = await getDaily()
        const last = lastDaily()
        if (last !== null && !last.finished && (await ranOut(last.day))) return
        if (resumes(last, today.day)) await begin(today)
        else view = { name: 'intro', today }
      } catch {
        view = { name: 'error', message: 'The daily is not available right now.' }
      }
    })()
  })

  /** Show `day`'s result if its attempt is over; whether it was. */
  async function ranOut(day: string): Promise<boolean> {
    try {
      show(await getDailyResult(dailyToken(), day))
      return true
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'no_result') return false
      throw error
    }
  }

  async function begin(today: DailyToday): Promise<void> {
    starting = true
    const you = get(profile)
    try {
      const { code, session } = await startDaily(
        dailyToken(),
        you?.name ?? generateName(),
        you?.pet,
      )
      setSession(code, session)
      const last = lastDaily()
      noteDaily({ day: last !== null && !last.finished ? last.day : today.day, finished: false })
      view = { name: 'playing', code }
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'daily_played') {
        show((error.body as { result: DailyResult }).result)
      } else {
        view = { name: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    } finally {
      starting = false
    }
  }

  function show(result: DailyResult): void {
    noteDaily({ day: result.day, finished: true })
    saveScore(result)
    view = { name: 'result', result }
  }

  async function showResult(day: string): Promise<void> {
    try {
      show(await getDailyResult(dailyToken(), day))
    } catch (error) {
      view = { name: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  // The day comes from the room, since a resumed attempt can be yesterday's.
  $effect(() => {
    const daily = $room?.daily
    if (view.name !== 'playing' || daily == null) return
    const finished = $room?.status === 'finished'
    noteDaily({ day: daily.day, finished })
    if (finished) void showResult(daily.day)
  })
</script>

{#if view.name === 'playing'}
  {#key view.code}
    <Room code={view.code} {navigate} />
  {/key}
{:else if view.name === 'result'}
  <DailyResultScreen result={view.result} onHome={() => navigate('/')} />
{:else}
  <section class="panel daily">
    {#if view.name === 'loading'}
      <p class="note">Loading the daily…</p>
    {:else if view.name === 'intro'}
      <h1>Daily #{view.today.number}</h1>
      <p>Ten questions, the same for everyone today. You get one try.</p>
      <div class="row">
        <button
          type="button"
          class="primary"
          disabled={starting}
          onclick={() => view.name === 'intro' && begin(view.today)}>Start</button
        >
        <button type="button" onclick={() => navigate('/')}>Home</button>
      </div>
    {:else}
      <h1>Daily</h1>
      <p>{view.message}</p>
      <div class="row">
        <button type="button" onclick={() => navigate('/')}>Home</button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .daily {
    max-width: 30rem;
    margin-inline: auto;
  }
</style>
