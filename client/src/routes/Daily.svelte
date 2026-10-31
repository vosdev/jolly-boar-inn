<script lang="ts">
  /**
   * `/daily`: the day's set, alone and once, from a link with no room code.
   *
   * Start asks the server for a room built from the stored set (`POST /api/daily`) and
   * plays it in `Room`, which knows a daily room by `room.daily`. Opening the page again
   * while an attempt runs, or after one today, goes straight to the server, which resumes
   * the attempt with a fresh session or refuses with `daily_played`.
   *
   * The name is the profile's, else a generated one. Nobody else sees it.
   */
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'

  import { ApiFailure, getDaily, startDaily, type DailyToday } from '../lib/api'
  import { dailyToken, lastDaily, noteDaily, resumes } from '../lib/daily'
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
    | { name: 'played'; today: DailyToday }
    | { name: 'error'; message: string }

  let view = $state<View>({ name: 'loading' })
  let starting = $state(false)

  onMount(() => {
    void (async () => {
      try {
        const today = await getDaily()
        if (resumes(lastDaily(), today.day)) await begin(today)
        else view = { name: 'intro', today }
      } catch {
        view = { name: 'error', message: 'The daily is not available right now.' }
      }
    })()
  })

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
        noteDaily({ day: today.day, finished: true })
        view = { name: 'played', today }
      } else {
        view = { name: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    } finally {
      starting = false
    }
  }

  // The day comes from the room, since a resumed attempt can be yesterday's.
  $effect(() => {
    const daily = $room?.daily
    if (view.name !== 'playing' || daily == null) return
    noteDaily({ day: daily.day, finished: $room?.status === 'finished' })
  })
</script>

{#if view.name === 'playing'}
  {#key view.code}
    <Room code={view.code} {navigate} />
  {/key}
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
    {:else if view.name === 'played'}
      <h1>Daily #{view.today.number}</h1>
      <p>You have played today's daily. Come back tomorrow.</p>
      <div class="row">
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
