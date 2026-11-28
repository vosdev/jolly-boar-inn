<script lang="ts">
  /**
   * The router. Hash-free:
   *
   *   /                Home
   *   /how-to-play     How to play, drawn by Home under its dialogue box,
   *   /how-to-play/:v  on a game mode (`/how-to-play/more-or-less`) or `random-events`
   *   /create          Create
   *   /r/:code         Room if this browser has a session for it, otherwise Join
   *   /r/:code/create  Create
   *   /history/:code/:stamp  A finished game from this browser's history
   *   /admin           The operator's view, linked from Home once this browser has its token,
   *   /admin/:tab      on its overview, or on its suggestions, reports or questions tab
   *   /suggest         A question for the packs, linked from Home once this browser has played,
   *   /suggest/:card   on one card's editor (`/suggest/kgp-recon`, `/suggest/item`, `/suggest/any`)
   *   /report          A problem with a pack question, linked from the same place
   *   /daily           The day's set, played alone and once
   *   /dev/map         The world map on its own, under `pnpm dev` only
   *   anything else    Not found, which the server sends with a 404
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
  import { siteName } from 'virtual:branding'

  import Footer from './components/Footer.svelte'
  import LazyRoute from './components/LazyRoute.svelte'
  import WallLights from './components/WallLights.svelte'
  import Floor from './components/Floor.svelte'
  import SettingsMenu from './components/SettingsMenu.svelte'
  import TimerBar from './components/TimerBar.svelte'
  import TopBar from './components/TopBar.svelte'
  import Create from './routes/Create.svelte'
  import Daily from './routes/Daily.svelte'
  import NotFound from './routes/NotFound.svelte'
  import Home from './routes/Home.svelte'
  import Join from './routes/Join.svelte'
  import Room from './routes/Room.svelte'
  import type { HowToView } from './components/HowToPage.svelte'
  import { SHOWN } from './components/ModeShowcase.svelte'
  import { howToViewOf } from './lib/howToPlay'
  import { routeIn, routeOut } from './lib/routeFade'
  import { adminTabOf, type AdminTab } from './lib/admin'
  import { keyFromHash } from './lib/invite'
  import { cardInPath } from './lib/suggestPath'
  import { getSession, normalizeCode } from './lib/session'
  import {
    EVENTS_SLUG,
    HOW_TO_PATH,
    joinDescription,
    pageTitle,
    seoRoutes,
    slugOf,
  } from './lib/seo'
  import { barPast, barWhere } from './lib/barWhere'
  import { hostMenu } from './lib/hostMenu'
  import { roomShown } from './lib/roomFit'
  import { room, you } from './lib/stores'
  import { wearTeam } from './lib/teams'
  import { timerBar } from './lib/timerbar'
  import { reloadIfNewer } from './lib/version'

  type Route =
    | { name: 'home' }
    | { name: 'how-to'; view: HowToView }
    | { name: 'create' }
    | { name: 'join'; code: string }
    | { name: 'room'; code: string }
    | { name: 'history'; code: string; stamp: string }
    | { name: 'admin'; tab: AdminTab }
    | { name: 'suggest'; card: string | null }
    | { name: 'report' }
    | { name: 'daily' }
    | { name: 'dev-map' }
    | { name: 'not-found' }

  // Section 1 lists `/r/:code/create` as well; it resolves to the same Create screen.
  const ROOM_PATH = /^\/r\/([A-Za-z0-9]{1,32})(?:\/(admin|create))?$/
  const HISTORY_PATH = /^\/history\/([A-Za-z0-9]{1,32})\/(\d{10})$/

  function currentPath(): string {
    const path = location.pathname
    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  }

  function resolve(path: string): Route {
    if (path === '/create') return { name: 'create' }
    const tab = adminTabOf(path)
    if (tab !== null) return { name: 'admin', tab }
    const card = cardInPath(path)
    if (card !== undefined) return { name: 'suggest', card }
    if (path === '/report') return { name: 'report' }
    if (path === '/daily') return { name: 'daily' }
    if (import.meta.env.DEV && path === '/dev/map') return { name: 'dev-map' }
    const view = howToViewOf(path, SHOWN)
    if (view !== null) return { name: 'how-to', view }
    const past = HISTORY_PATH.exec(path)
    // As spelled in the link: a game this browser never kept has no other spelling to show.
    if (past !== null) return { name: 'history', code: past[1] ?? '', stamp: past[2] ?? '' }
    const match = ROOM_PATH.exec(path)
    if (match === null) return path === '/' ? { name: 'home' } : { name: 'not-found' }
    const code = normalizeCode(match[1] ?? '')
    if (match[2] === 'create') return { name: 'create' }
    return getSession(code) === null ? { name: 'join', code } : { name: 'room', code }
  }

  let route = $state<Route>(resolve(currentPath()))
  // Create and its lobby are different screens, so they fade; Admin's tabs are one, and so
  // are Suggest's cards, which keep its allowance check, and Home and How to play, which
  // keep the dialogue box and fade what is under it.
  const routeKey = $derived.by(() => {
    if (route.name === 'admin' || route.name === 'suggest') return route.name
    if (route.name === 'home' || route.name === 'how-to') return 'home'
    return JSON.stringify(route)
  })
  const wide = $derived(
    route.name === 'home' ||
      route.name === 'how-to' ||
      route.name === 'admin' ||
      route.name === 'suggest' ||
      route.name === 'daily',
  )

  // The frame is the room's: a stale `you` outlives Room until the next one resets it, so
  // the route decides, and leaving the room takes the frame off.
  const team = $derived(route.name === 'room' ? ($you?.team ?? null) : null)
  /** The room's TV, which is watched from across the room: no footer, and a bar that hides. */
  const tv = $derived(route.name === 'room' && $you?.role === 'tv')
  /** A room runs the bar across the window; its lobby alone has the footer under it. */
  const inRoom = $derived(
    (route.name === 'room' && !tv) ||
      route.name === 'create' ||
      (route.name === 'daily' && $roomShown !== null),
  )
  // A past game is drawn as the room's final, which has none either. A stacked room shows
  // no frame, so a phone's daily needs the room itself to say it is being played.
  const footer = $derived(
    route.name === 'history'
      ? false
      : route.name === 'daily'
        ? $roomShown === null && !($room?.daily != null && $room.status === 'playing')
        : route.name !== 'room' || (!tv && $room?.status === 'lobby'),
  )
  $effect(() => wearTeam(team))

  const SEO_BY_PATH = new Map(seoRoutes(siteName, SHOWN).map((entry) => [entry.path, entry]))

  function routeHead(
    current: Route,
  ): { title: string; description: string; canonicalPath: string | null } | null {
    switch (current.name) {
      case 'room':
        return null
      case 'home': {
        const entry = SEO_BY_PATH.get('/')!
        return { title: entry.title, description: entry.description, canonicalPath: '/' }
      }
      case 'daily':
      case 'create':
      case 'suggest':
      case 'report': {
        const path = `/${current.name}`
        const entry = SEO_BY_PATH.get(path)!
        return {
          title: entry.title,
          description: entry.description,
          canonicalPath: entry.noindex ? null : path,
        }
      }
      case 'how-to': {
        let path = HOW_TO_PATH
        if (current.view === 'events') path = `${HOW_TO_PATH}/${EVENTS_SLUG}`
        else if (current.view !== 'overview') {
          const mode = SHOWN.find((entry) => entry.id === current.view)
          if (mode !== undefined) path = `${HOW_TO_PATH}/${slugOf(mode.label)}`
        }
        const entry = SEO_BY_PATH.get(path) ?? SEO_BY_PATH.get(HOW_TO_PATH)!
        return { title: entry.title, description: entry.description, canonicalPath: entry.path }
      }
      case 'join':
        return {
          title: pageTitle('Join Room', siteName),
          description: joinDescription(siteName),
          canonicalPath: null,
        }
      case 'history':
        return {
          title: pageTitle('Past Game', siteName),
          description: `Finished OSRS trivia game standings at ${siteName}.`,
          canonicalPath: null,
        }
      case 'admin':
        return {
          title: pageTitle('Admin', siteName),
          description: `Operator tools for ${siteName}.`,
          canonicalPath: null,
        }
      case 'dev-map':
        return { title: pageTitle('Map', siteName), description: '', canonicalPath: null }
      case 'not-found':
        return {
          title: pageTitle('Page Not Found', siteName),
          description: SEO_BY_PATH.get('/')!.description,
          canonicalPath: null,
        }
    }
  }

  $effect.pre(() => {
    const head = routeHead(route)
    if (head === null) {
      // Room mounts next and reads document.title for its short tab suffix.
      document.title = siteName
      return
    }
    document.title = head.title
    const description = document.head.querySelector('meta[name="description"]')
    if (description !== null) description.setAttribute('content', head.description)
    const canonical = document.head.querySelector('link[rel="canonical"]')
    if (head.canonicalPath !== null && location.origin !== 'null') {
      const href = `${location.origin}${head.canonicalPath}`
      if (canonical !== null) canonical.setAttribute('href', href)
      else {
        const link = document.createElement('link')
        link.rel = 'canonical'
        link.href = href
        document.head.append(link)
      }
    } else {
      canonical?.remove()
    }
  })

  /** `state` rides along in `history.state`, for the screen at `to` to read. */
  function navigate(to: string, state: unknown = null): void {
    if (to !== location.pathname + location.hash) history.pushState(state, '', to)
    if (reloadIfNewer()) return
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
      route.name !== 'suggest' &&
      route.name !== 'report' &&
      route.name !== 'how-to' &&
      route.name !== 'daily' &&
      route.name !== 'dev-map' &&
      route.name !== 'not-found' &&
      !invite &&
      (location.hash !== '' || currentPath().endsWith('/admin'))
    ) {
      history.replaceState(null, '', route.name === 'home' ? '/' : `/r/${route.code}`)
    }
    const onPop = (): void => {
      if (reloadIfNewer()) return
      route = resolve(currentPath())
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  })
</script>

<!-- Inside a room the menu's You is the player the server knows; anywhere else it is the
     profile. `you` outlives the Room screen until the next one resets it, so the route
     decides which, not the store. -->
<Floor />
<WallLights corner={!footer} />

<TopBar
  {navigate}
  {wide}
  full={inRoom || route.name === 'history'}
  where={$roomShown === null ? null : $barWhere}
  past={route.name === 'history' ? $barPast : null}
  host={inRoom ? $hostMenu : null}
  {team}
  badge={$timerBar === null}
  autohide={tv}
>
  {#snippet menu()}
    <SettingsMenu live={route.name === 'room' ? $you : null} />
  {/snippet}
</TopBar>

<!-- The clock of whatever a room is timing, under the bar and outside the column.
     Keyed on the deadline, so a new question starts a full bar rather than easing up to
     one from the last question's empty. -->
{#if $timerBar !== null}
  {#key $timerBar.endsAt}
    <TimerBar {...$timerBar} {team} flush={tv} />
  {/key}
{/if}

<main id="content" tabindex="-1" class:wide class:room={$roomShown !== null}>
  <!-- Old and new screens share one grid cell so the outgoing one fades without pushing
       the incoming one down. A room keeps its screen across its own code's re-renders. -->
  {#key routeKey}
    <div class="route" in:routeIn out:routeOut>
      {#if route.name === 'home' || route.name === 'how-to'}
        <Home {navigate} howTo={route.name === 'how-to' ? route.view : null} />
      {:else if route.name === 'create'}
        <Create {navigate} />
      {:else if route.name === 'admin'}
        {@const tab = route.tab}
        <LazyRoute load={() => import('./routes/Admin.svelte')}>
          {#snippet children({ default: Admin })}
            <Admin {tab} {navigate} />
          {/snippet}
        </LazyRoute>
      {:else if route.name === 'suggest'}
        {@const card = route.card}
        <LazyRoute load={() => import('./routes/Suggest.svelte')}>
          {#snippet children({ default: Suggest })}
            <Suggest {card} {navigate} />
          {/snippet}
        </LazyRoute>
      {:else if route.name === 'report'}
        <LazyRoute load={() => import('./routes/Report.svelte')}>
          {#snippet children({ default: Report })}
            <Report {navigate} />
          {/snippet}
        </LazyRoute>
      {:else if route.name === 'daily'}
        <Daily {navigate} />
      {:else if route.name === 'not-found'}
        <NotFound {navigate} />
      {:else if route.name === 'dev-map'}
        {#if import.meta.env.DEV}
          <LazyRoute load={() => import('./routes/DevMap.svelte')}>
            {#snippet children({ default: DevMap })}
              <DevMap />
            {/snippet}
          </LazyRoute>
        {/if}
      {:else if route.name === 'history'}
        {@const { code, stamp } = route}
        {#key `${code}/${stamp}`}
          <LazyRoute load={() => import('./routes/History.svelte')}>
            {#snippet children({ default: History })}
              <History {code} {stamp} {navigate} />
            {/snippet}
          </LazyRoute>
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
    </div>
  {/key}
</main>

{#if footer}<Footer wide={wide || inRoom} {navigate} />{/if}

<style>
  main {
    display: grid;
  }

  /* The room's frame takes the whole width under the bar, and its own padding. */
  main.room {
    width: 100%;
    padding: 0;
  }

  .route {
    grid-area: 1 / 1;
    min-width: 0;
  }
</style>
