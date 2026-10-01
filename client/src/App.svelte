<script lang="ts">
  /**
   * The router. Hash-free:
   *
   *   /                Home
   *   /create          Create
   *   /r/:code         Room if this browser has a session for it, otherwise Join
   *   /r/:code/create  Create
   *   /history/:code/:stamp  A finished game from this browser's history
   *   /admin           The operator's view, linked from Home once this browser has its token
   *
   * `/r/:code/admin` was the claim screen. It still matches, and now resolves like
   * `/r/:code`: somebody holding a stale host link knows the code, and sending them to
   * Home would only make them type it again.
   *
   * `route` is recomputed on every navigation rather than derived from a path string,
   * because `/r/:code` resolves differently before and after a join and the path does
   * not change between the two.
   */
  import { onMount } from 'svelte'

  import Footer from './components/Footer.svelte'
  import SettingsMenu from './components/SettingsMenu.svelte'
  import TimerBar from './components/TimerBar.svelte'
  import TopBar from './components/TopBar.svelte'
  import Admin from './routes/Admin.svelte'
  import Create from './routes/Create.svelte'
  import History from './routes/History.svelte'
  import Home from './routes/Home.svelte'
  import Join from './routes/Join.svelte'
  import Room from './routes/Room.svelte'
  import { keyFromHash } from './lib/invite'
  import { getSession, normalizeCode } from './lib/session'
  import { you } from './lib/stores'
  import { timerBar } from './lib/timerbar'

  type Route =
    | { name: 'home' }
    | { name: 'create' }
    | { name: 'join'; code: string }
    | { name: 'room'; code: string }
    | { name: 'history'; code: string; stamp: string }
    | { name: 'admin' }

  // Section 1 lists `/r/:code/create` as well; it resolves to the same Create screen.
  const ROOM_PATH = /^\/r\/([A-Za-z0-9]{1,32})(?:\/(admin|create))?$/
  const HISTORY_PATH = /^\/history\/([A-Za-z0-9]{1,32})\/(\d{10})$/

  function currentPath(): string {
    const path = location.pathname
    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  }

  function resolve(path: string): Route {
    if (path === '/create') return { name: 'create' }
    if (path === '/admin') return { name: 'admin' }
    const past = HISTORY_PATH.exec(path)
    if (past !== null) return { name: 'history', code: normalizeCode(past[1] ?? ''), stamp: past[2] ?? '' }
    const match = ROOM_PATH.exec(path)
    if (match === null) return { name: 'home' }
    const code = normalizeCode(match[1] ?? '')
    if (match[2] === 'create') return { name: 'create' }
    return getSession(code) === null ? { name: 'join', code } : { name: 'room', code }
  }

  let route = $state<Route>(resolve(currentPath()))

  function navigate(to: string): void {
    if (to !== location.pathname) history.pushState(null, '', to)
    route = resolve(currentPath())
  }

  onMount(() => {
    // `/r/:code/admin` and its `#t=` fragment are both dead, so tidy the address bar
    // once rather than leave a spent link looking like it still means something.
    // `/admin` reads its own fragment, and Join an invite link's `#k=`.
    const invite = route.name === 'join' && keyFromHash(location.hash) !== null
    if (
      route.name !== 'create' &&
      route.name !== 'history' &&
      route.name !== 'admin' &&
      !invite &&
      (location.hash !== '' || currentPath().endsWith('/admin'))
    ) {
      history.replaceState(null, '', route.name === 'home' ? '/' : `/r/${route.code}`)
    }
    const onPop = (): void => {
      route = resolve(currentPath())
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  })
</script>

<!-- Inside a room the menu's You is the player the server knows; anywhere else it is the
     profile. `you` outlives the Room screen until the next one resets it, so the route
     decides which, not the store. -->
<TopBar {navigate}>
  {#snippet menu()}
    <SettingsMenu live={route.name === 'room' ? $you : null} />
  {/snippet}
</TopBar>

<!-- D8: the clock of whatever a room is timing, under the bar and outside the column.
     Keyed on the deadline, so a new question starts a full bar rather than easing up to
     one from the last question's empty. -->
{#if $timerBar !== null}
  {#key $timerBar.endsAt}
    <TimerBar {...$timerBar} />
  {/key}
{/if}

<main id="content" tabindex="-1" class:wide={route.name === 'create' || route.name === 'admin'}>
  {#if route.name === 'home'}
    <Home {navigate} />
  {:else if route.name === 'create'}
    <Create {navigate} />
  {:else if route.name === 'admin'}
    <Admin />
  {:else if route.name === 'history'}
    {#key `${route.code}/${route.stamp}`}
      <History code={route.code} stamp={route.stamp} {navigate} />
    {/key}
  {:else if route.name === 'join'}
    {#key route.code}
      <Join code={route.code} {navigate} />
    {/key}
  {:else}
    {#key route.code}
      <Room code={route.code} {navigate} />
    {/key}
  {/if}
</main>

<Footer />
