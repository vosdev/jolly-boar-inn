<script lang="ts">
  /**
   * The router. Hash-free, four paths:
   *
   *   /               Home
   *   /create         Create
   *   /r/:code        Room if this browser has a session for it, otherwise Join
   *   /r/:code/admin  AdminClaim
   *
   * `route` is recomputed on every navigation rather than derived from a path string,
   * because `/r/:code` resolves differently before and after a join and the path does
   * not change between the two.
   */
  import { onMount } from 'svelte'

  import AdminClaim from './routes/AdminClaim.svelte'
  import Create from './routes/Create.svelte'
  import Home from './routes/Home.svelte'
  import Join from './routes/Join.svelte'
  import Room from './routes/Room.svelte'
  import { getSession, normalizeCode } from './lib/session'

  type Route =
    | { name: 'home' }
    | { name: 'create' }
    | { name: 'claim'; code: string }
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
    if (match[2] === 'admin') return { name: 'claim', code }
    if (match[2] === 'create') return { name: 'create' }
    return getSession(code) === null ? { name: 'join', code } : { name: 'room', code }
  }

  let route = $state<Route>(resolve(currentPath()))

  function navigate(to: string): void {
    if (to !== location.pathname) history.pushState(null, '', to)
    route = resolve(currentPath())
  }

  onMount(() => {
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
  {:else if route.name === 'claim'}
    {#key route.code}
      <AdminClaim code={route.code} {navigate} />
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
