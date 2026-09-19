<script lang="ts">
  /**
   * The router. Hash-free:
   *
   *   /                Home
   *   /create          Create
   *   /r/:code         Room if this browser has a session for it, otherwise Join
   *   /r/:code/create  Create
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

  import Create from './routes/Create.svelte'
  import Home from './routes/Home.svelte'
  import Join from './routes/Join.svelte'
  import Room from './routes/Room.svelte'
  import { getSession, normalizeCode } from './lib/session'

  type Route =
    | { name: 'home' }
    | { name: 'create' }
    | { name: 'join'; code: string }
    | { name: 'room'; code: string }

  // Section 1 lists `/r/:code/create` as well; it resolves to the same Create screen.
  const ROOM_PATH = /^\/r\/([A-Za-z0-9]{1,32})(?:\/(admin|create))?$/

  function currentPath(): string {
    const path = location.pathname
    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  }

  function resolve(path: string): Route {
    if (path === '/create') return { name: 'create' }
    const match = ROOM_PATH.exec(path)
    if (match === null) return { name: 'home' }
    const code = normalizeCode(match[1])
    if (match[2] === 'create') return { name: 'create' }
    return getSession(code) === null ? { name: 'join', code } : { name: 'room', code }
  }

  let route = $state<Route>(resolve(currentPath()))

  function navigate(to: string): void {
    if (to !== location.pathname) history.pushState(null, '', to)
    route = resolve(currentPath())
  }

  onMount(() => {
    // `/r/:code/admin` and its `#t=` fragment are both dead. Nothing strips fragments
    // any more, so tidy the address bar once rather than leave a spent link looking
    // like it still means something.
    if (route.name !== 'create' && (location.hash !== '' || currentPath().endsWith('/admin'))) {
      history.replaceState(null, '', route.name === 'home' ? '/' : `/r/${route.code}`)
    }
    const onPop = (): void => {
      route = resolve(currentPath())
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  })
</script>

<main>
  {#if route.name === 'home'}
    <Home {navigate} />
  {:else if route.name === 'create'}
    <Create {navigate} />
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
