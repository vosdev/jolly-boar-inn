<script lang="ts">
  /**
   * A lobby with its doors shut, the room a host starts in. Nothing here has reached the
   * server: a room's code is its address, so there is no room until the host has settled
   * one. What they set is kept in this browser, and Open the doors sends it all in one POST,
   * which makes the room, with them as its admin, and lands them in the same lobby with its
   * doors open. They can do that with nothing picked and set the game up while their friends
   * arrive, or set it all up first.
   *
   * It is drawn as the lobby is, on the same frame and panels, so opening the doors changes
   * no more than it has to: the reroll becomes the invite link, and the room panel goes.
   *
   * The host is the profile, name and pet, and this screen never asks: the name lives in the
   * top bar. A browser with none is handled the way Join handles one: Open the doors opens
   * `NamePrompt` first, and what is confirmed becomes the profile and the host's name.
   */
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'

  import { ApiFailure, createRoom, getFreeCode, type RoomAccess } from '../lib/api'
  import AtTable from '../components/AtTable.svelte'
  import Icon from '../components/Icon.svelte'
  import JoinCode from '../components/JoinCode.svelte'
  import NamePrompt from '../components/NamePrompt.svelte'
  import RoomDoors from '../components/RoomDoors.svelte'
  import RoomFrame from '../components/RoomFrame.svelte'
  import Said from '../components/stage/Said.svelte'
  import Stage from '../components/stage/Stage.svelte'
  import Switch from '../components/Switch.svelte'
  import TablePanel from '../components/TablePanel.svelte'
  import TeamPicker from '../components/TeamPicker.svelte'
  import TonightPanel from '../components/TonightPanel.svelte'
  import { barWhere } from '../lib/barWhere'
  import type { HostQuestion } from '../lib/customQuestions'
  import { heroFor, speakerFor } from '../lib/hero'
  import { profile, returningVisitor, saveProfile } from '../lib/profile'
  import type { PlayerView } from '../lib/protocol'
  import { atRoomLimit } from '../lib/roomLimit'
  import { measureRoom, watchRoomSize } from '../lib/roomFit'
  import { RoomTable, shareTable } from '../lib/roomTable.svelte'
  import { dropStored, readStored, rememberCreated, setSession, writeStored } from '../lib/session'
  import { arrival, counted } from '../lib/stats'
  import { tableGroups } from '../lib/tableGroups'
  import { MIN_TEAMS, type TeamId } from '../lib/teams'
  import { watchTheme } from '../lib/theme'
  import type { TonightSettings } from '../lib/gameSetup'

  const DRAFT_KEY = 'jbi:draft'

  const NOTHING_PICKED: TonightSettings = {
    modes: [],
    mode_order: 'random',
    random_event_frequency: 'default',
    pace: 'run',
    difficulty: 'mixed',
    standings_seconds: 10,
    close_when_all_answered: true,
    name_wrong_answers: true,
  }

  /** What a reload must not lose. */
  interface Draft {
    tonight: TonightSettings
    access: RoomAccess
    hideRounds: boolean
    teamGame: boolean
    gods: TeamId[]
  }

  function storedDraft(): Draft {
    const blank: Draft = {
      tonight: NOTHING_PICKED,
      access: 'code',
      hideRounds: false,
      teamGame: false,
      gods: ['saradomin', 'zamorak'],
    }
    try {
      return { ...blank, ...(JSON.parse(readStored(DRAFT_KEY) ?? '{}') as Partial<Draft>) }
    } catch {
      return blank
    }
  }

  let { navigate }: { navigate: (to: string) => void } = $props()

  const draft = storedDraft()
  let tonight = $state(draft.tonight)
  let customQuestions = $state<HostQuestion[]>([])
  let access = $state<RoomAccess>(draft.access)
  let hideRounds = $state(draft.hideRounds)
  let teamGame = $state(draft.teamGame)
  let gods = $state<TeamId[]>(draft.gods)
  /** What in the setup stops the doors opening, and the game starting. */
  let openBlock = $state<string | null>(null)
  let startBlock = $state<string | null>(null)

  let busy = $state(false)
  /** A browser with no profile is being asked for one before the room is made. */
  let naming = $state(false)
  let failure = $state<string | null>(null)
  /** The code the room will get, or null if the server could not hand one out: it draws then. */
  let code = $state<string | null>(null)
  let rerollHeld = $state(false)
  let rerollTimer: ReturnType<typeof setTimeout> | undefined
  /** Whether this browser already hosts as many rooms as it may, or null until known. */
  let full = $state<boolean | null>(null)

  let theme = $state('')
  const heroArt = $derived(heroFor(theme))

  const table = new RoomTable()
  shareTable(table)
  let fit = $state(measureRoom())

  const picked = $derived((tonight.modes?.length ?? 0) > 0 || (tonight.surprise_modes ?? 0) > 0)
  const blocked = $derived(
    teamGame && gods.length < MIN_TEAMS ? 'Tick at least two gods for a team game.' : openBlock,
  )
  /** The host at their own table, as the room will seat them once it exists. */
  const host = $derived<PlayerView>({
    id: 'host',
    display_name: $profile?.name ?? 'You',
    avatar: $profile?.pet ?? null,
    role: 'admin',
    team: null,
    connected: true,
    ready: false,
    editing: false,
  })
  const seated = $derived(tableGroups([host], host.id, () => false, [], []))

  $effect(() => {
    const kept: Draft = { tonight, access, hideRounds, teamGame, gods }
    writeStored(DRAFT_KEY, JSON.stringify(kept))
  })

  $effect(() => {
    const here = { lead: 'Your room, not open yet', mode: null }
    barWhere.set(here)
    // This screen fades out after the lobby has said where the night is.
    return () => barWhere.update((now) => (now === here ? null : now))
  })

  onMount(() => {
    const stopFit = watchRoomSize(() => (fit = measureRoom()))
    const stopTheme = watchTheme((current) => (theme = current))
    void atRoomLimit().then((limited) => (full = limited))
    void reroll()
    return () => {
      stopFit()
      stopTheme()
      clearTimeout(rerollTimer)
    }
  })

  async function reroll(): Promise<void> {
    try {
      code = await getFreeCode()
    } catch (error) {
      // A rate-limited or failed reroll keeps the code already shown.
      if (error instanceof ApiFailure && error.retryAfterMs !== undefined) {
        rerollHeld = true
        clearTimeout(rerollTimer)
        rerollTimer = setTimeout(() => (rerollHeld = false), error.retryAfterMs)
      }
    }
  }

  function goHome(event: MouseEvent): void {
    // A modified click is somebody asking for a new tab; let the browser have it.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate('/')
  }

  function pressed(): void {
    if (busy || blocked !== null || full === true) return
    if (get(profile) === null) naming = true
    else void open()
  }

  /** The prompt's answer is the profile before it is the host. */
  function named(name: string, pet: string): void {
    saveProfile(name, pet)
    naming = false
    void open()
  }

  async function open(): Promise<void> {
    const you = get(profile)
    if (you === null) return
    busy = true
    failure = null
    // Another tab may have created a room since this one loaded.
    if (await atRoomLimit()) {
      full = true
      busy = false
      return
    }
    try {
      const reporting = arrival()
      const created = await createRoom(
        you.name,
        { ...tonight, hide_rounds: hideRounds, teams: teamGame ? gods : [] },
        you.pet,
        returningVisitor,
        access,
        customQuestions,
        reporting,
        code ?? undefined,
      )
      counted(reporting)
      setSession(created.code, created.session)
      rememberCreated(created.code, created.expires_at)
      dropStored(DRAFT_KEY)
      navigate(`/r/${created.code}`)
    } catch (error) {
      failure =
        error instanceof ApiFailure && error.code === 'code_taken'
          ? 'That code was just taken — roll a new one.'
          : error instanceof ApiFailure
            ? error.message
            : 'could not create the room, try again'
    } finally {
      busy = false
    }
  }
</script>

{#snippet line()}
  <p>
    The doors stay shut until you open them. Choose the rounds now, or let your friends in first.
  </p>
{/snippet}

{#snippet doors()}
  {#if full === true}
    <p class="banner">
      You already have five rooms. Remove one on the <a href="/" onclick={goHome}>homepage</a>
      to make another.
    </p>
  {:else}
    <RoomDoors bind:access bind:hideRounds {busy} {blocked} {failure} onopen={pressed} />
  {/if}
{/snippet}

<RoomFrame {fit} bind:table={table.target}>
  <section class="lobby">
    <Stage host="wise_old_man" hero={heroArt} bubble="on">
      {#snippet said()}
        <Said name={speakerFor(heroArt)} {line} />
      {/snippet}
      {#snippet paper()}
        <JoinCode code={code ?? '…'} lead="Your room's code">
          <button type="button" onclick={reroll} disabled={busy || rerollHeld}>
            <Icon name="refresh" />
            Reroll
          </button>
        </JoinCode>
      {/snippet}
      <AtTable>
        {#if fit !== null}{@render doors()}{/if}
        <TablePanel groups={seated} youId={host.id} labels={['Ready', 'Not ready yet']}>
          {#snippet head()}
            <TeamPicker bind:on={teamGame} bind:picked={gods} />
          {/snippet}
          <Switch label="Ready" large tone="ok" checked={false} disabled onclick={() => {}} />
          <p class="hint">
            {picked ? (startBlock ?? 'Open the doors first.') : 'Pick at least one round to start.'}
          </p>
          <button class="start" type="button" disabled>Start the game</button>
        </TablePanel>
      </AtTable>
      {#if fit === null}{@render doors()}{/if}
      <TonightPanel
        settings={draft.tonight}
        hidden={hideRounds}
        onchange={(next) => (tonight = next)}
        onquestions={(questions) => (customQuestions = questions)}
        onproblems={(toOpen, toStart) => {
          openBlock = toOpen
          startBlock = toStart
        }}
      />
    </Stage>
  </section>
</RoomFrame>

{#if naming}
  <NamePrompt action="Open the doors" onConfirm={named} />
{/if}

<style>
  .hint {
    margin: 0.5rem 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .start {
    width: 100%;
    min-height: 44px;
  }
</style>
