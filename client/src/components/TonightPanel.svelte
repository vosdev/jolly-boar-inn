<script lang="ts">
  /**
   * The host's Tonight's game panel, the same with the doors shut and open: the hosts and
   * their running order, the house rules and the random events, a tab each. Every tab stays
   * mounted and only hides, so nothing set on one is lost by moving to another, a question
   * half written included.
   *
   * A game mode is a round, presented by its host. Ticking three hosts makes a three-round
   * game, and each round carries its own question count. The default and the range it is
   * held to come from `GET /api/modes`, which is the server's own mode registry, so the
   * panel never invents a number the server would refuse. How long a question lasts is not
   * the host's to set per round: each question's type says, and the room's one pace scales
   * every one of them.
   *
   * "Pick for me" asks how many modes. It ticks that many cards at random for the host to
   * adjust. In a room with surprise rounds it can keep them a surprise instead: the cards
   * fold away and only the number is sent, so the server draws the modes at the start and
   * not even the host's browser knows them. Their lengths are unknown here, so the events
   * are counted as the shortest draw would have them.
   *
   * `/api/modes` lists `custom` and `random_event` too, with no round length: their questions
   * are never a round but random events, so the panel offers every mode but those two. How
   * often they come is the host's one choice about events. The host's own questions
   * (`CustomQuestions`) each take one of those events.
   *
   * `onchange` hears each edit, and `settings` is what the room holds: a change there that
   * this panel did not send is another admin's, and takes over.
   */
  import { onMount, untrack } from 'svelte'

  import { ApiFailure, type ModeBounds, type ModePacing } from '../lib/api'
  import { eventSlots, overCap, type HostQuestion } from '../lib/customQuestions'
  import { minutes, plannedSeconds } from '../lib/duration'
  import { loadModes } from '../lib/howToPlay'
  import { MODES, UPCOMING_MODES, modeLabel } from '../lib/modes'
  import { modeSeed, orderModes } from '../lib/modeOrder'
  import { npcArt } from '../lib/npcs'
  import {
    EVENT_EVERY,
    type Difficulty,
    type EventFrequency,
    type ModeSettings,
    type Pace,
  } from '../lib/protocol'
  import { tonightKey, type TonightSettings } from '../lib/gameSetup'
  import CustomQuestions from './CustomQuestions.svelte'
  import HouseRules from './HouseRules.svelte'
  import ModeCard from './ModeCard.svelte'
  import PickForMe from './PickForMe.svelte'
  import RandomEvents from './RandomEvents.svelte'
  import RoundList from './RoundList.svelte'

  /** The server's cap on a room, over every round. `NewRoomSettings` checks the same. */
  const MAX_QUESTIONS = 100

  const TABS = [
    { id: 'rounds', label: 'Rounds' },
    { id: 'rules', label: 'House rules' },
    { id: 'events', label: 'Random events and custom questions' },
  ] as const

  type Tab = (typeof TABS)[number]['id']

  let {
    settings = null,
    hidden,
    own = true,
    teams = false,
    onchange,
    onquestions,
    onproblems,
  }: {
    /** What the game is set to now; null is a new one, with nothing picked. */
    settings?: TonightSettings | null
    /** The room hides its rounds, which is what lets Pick for me keep them a surprise. */
    hidden: boolean
    /** This browser holds the host's question bank. */
    own?: boolean
    /** A team game, which never deals items. */
    teams?: boolean
    onchange: (settings: TonightSettings) => void
    /** The questions ticked, after a change; a new panel has said nothing yet. */
    onquestions: (questions: HostQuestion[]) => void
    /** What stops the doors opening, and what stops the game starting, in words. */
    onproblems: (open: string | null, start: string | null) => void
  } = $props()

  const id = $props.id()

  let pace = $state<Pace>('run')
  let difficulty = $state<Difficulty>('mixed')
  let standingsSeconds = $state(10)
  let frequency = $state<EventFrequency>('default')
  let modeOrder = $state<'listed' | 'random'>('random')
  let closeWhenAllAnswered = $state(true)
  let nameWrongAnswers = $state(true)
  let items = $state(true)
  /** The server draws the rounds unseen, rather than the host picking them. */
  // A room that stops hiding its rounds cannot keep them a surprise, so any change of
  // `hidden` clears it; it is only ever set while hidden.
  let surprise = $derived.by(() => {
    void hidden
    return false
  })
  let randomCount = $state(4)
  let pickingForMe = $state(false)
  /** The rounds, in the order they will play: one per mode, and the list is the order. */
  let rounds = $state<ModeSettings[]>([])
  let customQuestions = $state<HostQuestion[]>([])
  /** A question open in the editor, unsaved: leaving now would lose it. */
  let editingQuestion = $state(false)

  let tab = $state<Tab>('rounds')

  /** What the server will play and what it will accept for each, or null until it says. */
  let pacing = $state<ModePacing[] | null>(null)
  let pacingFailure = $state<string | null>(null)

  const roundModes = $derived(
    orderModes(pacing?.filter((mode) => mode.questions !== null) ?? [], modeSeed()),
  )
  const bounds = $derived(
    Object.fromEntries(roundModes.map((mode) => [mode.id, mode.questions])) as Record<
      string,
      ModeBounds
    >,
  )
  /** Coming soon, minus any this server already plays: those are in `roundModes` instead. */
  const upcomingModes = $derived(
    UPCOMING_MODES.filter((mode) => !pacing?.some((entry) => entry.id === mode.id)),
  )
  /** At most every mode there is to draw, and at least one. */
  const randomMax = $derived(Math.max(1, roundModes.length))
  const randomRounds = $derived(Math.min(randomCount, randomMax))
  /** The shortest rounds a surprise could draw: the events counted are the fewest it gets. */
  const shortestDraw = $derived(
    roundModes
      .map((mode) => mode.questions?.default ?? 1)
      .sort((a, b) => a - b)
      .slice(0, randomRounds),
  )
  const lengths = $derived(surprise ? shortestDraw : rounds.map((round) => round.questions))
  const questionCount = $derived(lengths.reduce((total, length) => total + length, 0))
  /**
   * The events the room adds to that, counted as the server counts them (`eventSlots`).
   * They are questions the room will play, so they are in the total and under the cap.
   */
  const eventCount = $derived(eventSlots(lengths, EVENT_EVERY[frequency]))
  const totalCount = $derived(questionCount + eventCount)
  const eventsAtMore = $derived(eventSlots(lengths, EVENT_EVERY.more))
  const typical = $derived<Record<string, number | null>>(
    Object.fromEntries((pacing ?? []).map((mode) => [mode.id, mode.seconds?.[pace] ?? null])),
  )
  /** A surprise's rounds are unknown here, so each counts as an average offered round. */
  const averageRound = $derived.by(() => {
    const known = roundModes.flatMap((mode) => typical[mode.id] ?? [])
    return known.length === 0 ? 0 : known.reduce((total, s) => total + s, 0) / known.length
  })
  const duration = $derived(
    minutes(
      plannedSeconds(
        surprise
          ? lengths.map((questions) => ({ questions, seconds: averageRound }))
          : rounds.map((round) => ({
              questions: round.questions,
              seconds: typical[round.mode] ?? 0,
            })),
        eventCount,
        typical.random_event ?? averageRound,
        standingsSeconds,
        nameWrongAnswers,
      ),
    ),
  )
  const picked = $derived(surprise || rounds.length > 0)
  const tooManyOwn = $derived(overCap(customQuestions.length, eventCount, frequency, eventsAtMore))
  /** What must be settled before this game leaves the browser, in words. */
  const problem = $derived(
    !surprise && totalCount > MAX_QUESTIONS
      ? `${totalCount} questions, over the ${MAX_QUESTIONS} cap.`
      : editingQuestion
        ? 'Add or cancel the question you are writing first.'
        : null,
  )
  const roundsWord = $derived(
    surprise
      ? `${randomRounds} surprise round${randomRounds === 1 ? '' : 's'}`
      : `${rounds.length} round${rounds.length === 1 ? '' : 's'}`,
  )
  const summary = $derived(
    !picked
      ? 'None yet'
      : `${roundsWord} · ${surprise ? 'at least ' : ''}${totalCount} questions · ${duration}`,
  )
  const tally = $derived(
    `${questionCount} question${questionCount === 1 ? '' : 's'} in the rounds` +
      (eventCount > 0 ? `, plus ${eventCount} random event${eventCount === 1 ? '' : 's'}.` : '.'),
  )
  const built = $derived<TonightSettings>({
    items,
    ...(surprise ? { surprise_modes: randomRounds } : { modes: rounds }),
    mode_order: surprise ? 'random' : modeOrder,
    random_event_frequency: frequency,
    pace,
    difficulty,
    standings_seconds: standingsSeconds,
    close_when_all_answered: closeWhenAllAnswered,
    name_wrong_answers: nameWrongAnswers,
  })

  /** The game as last heard from or told to the room, so neither echoes the other. */
  let known = ''
  /** Sent, and not heard back yet: hearing one is no news, whatever was edited since. */
  const sent = new Set<string>()

  function take(from: TonightSettings): void {
    const drawn = from.surprise_modes ?? 0
    surprise = hidden && drawn > 0
    if (drawn > 0) randomCount = drawn
    rounds = from.modes ?? []
    modeOrder = from.mode_order
    frequency = from.random_event_frequency
    pace = from.pace
    difficulty = from.difficulty
    standingsSeconds = from.standings_seconds
    closeWhenAllAnswered = from.close_when_all_answered
    nameWrongAnswers = from.name_wrong_answers
    items = from.items
    known = tonightKey(from)
  }

  // Seeded once, before the effects below can read it as an edit.
  // svelte-ignore state_referenced_locally
  if (settings !== null) take(settings)
  known = untrack(() => tonightKey(built))

  $effect(() => {
    const from = settings
    if (from === null) return
    const key = tonightKey(from)
    if (sent.delete(key) || key === known) return
    untrack(() => take(from))
  })

  $effect(() => {
    const next = $state.snapshot(built) as TonightSettings
    const key = tonightKey(next)
    if (key === known) return
    known = key
    sent.add(key)
    untrack(() => onchange(next))
  })

  let spoken: string | null = null
  $effect(() => {
    const questions = $state.snapshot(customQuestions) as HostQuestion[]
    const key = JSON.stringify(questions)
    const first = spoken === null
    const same = key === spoken
    spoken = key
    if (!first && !same) untrack(() => onquestions(questions))
  })

  $effect(() => {
    onproblems(problem, problem ?? (picked ? tooManyOwn : null))
  })

  onMount(() => {
    void loadModes().then(
      (modes) => (pacing = modes),
      (error: unknown) =>
        (pacingFailure =
          error instanceof ApiFailure ? error.message : 'could not reach the server'),
    )
  })

  /** A round of `mode` at that mode's own length, which is what ticking it gives you. */
  function roundFor(mode: ModePacing): ModeSettings {
    return { mode: mode.id, questions: mode.questions?.default ?? 1 }
  }

  function toggle(mode: ModePacing, on: boolean): void {
    // Click order, deliberately: the list is the running order, so a mode ticked last
    // plays last, until the host moves it or hands the order to `random`.
    rounds = on ? [...rounds, roundFor(mode)] : rounds.filter((round) => round.mode !== mode.id)
  }

  /** Draw `count` modes for the server to keep secret, or tick that many in place of the ticked. */
  function pickForMe(count: number, secret: boolean): void {
    pickingForMe = false
    randomCount = count
    surprise = hidden && secret
    tab = 'rounds'
    if (secret) return
    const shuffled = [...roundModes]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    rounds = shuffled.slice(0, count).map(roundFor)
  }
</script>

<section class="panel tonight" aria-labelledby="{id}-title">
  <div class="head">
    <div class="title">
      <h2 id="{id}-title">Tonight's game</h2>
      <p class="sum">{summary}</p>
    </div>
    <div class="tabs" role="tablist" aria-label="Tonight's settings">
      {#each TABS as one, index (one.id)}
        <button
          type="button"
          role="tab"
          id="{id}-{one.id}"
          aria-selected={tab === one.id}
          aria-controls="{id}-{one.id}-panel"
          onclick={() => (tab = one.id)}>{index + 1} · {one.label}</button
        >
      {/each}
    </div>
  </div>

  {#if problem !== null}
    <p class="problem">{problem}</p>
  {/if}

  <div
    class="pane rounds"
    role="tabpanel"
    id="{id}-rounds-panel"
    aria-labelledby="{id}-rounds"
    hidden={tab !== 'rounds'}
  >
    <div class="hosts">
      {#if pacingFailure !== null}
        <p class="error">{pacingFailure}</p>
      {:else if pacing === null}
        <p class="note">Loading the game modes…</p>
      {:else if surprise}
        <p class="count">{roundsWord}, drawn when the game starts</p>
        <p class="note">Nobody sees them, you included, until each round starts.</p>
        <button type="button" onclick={() => (surprise = false)}>Choose the rounds instead</button>
      {:else}
        <ul class="cards">
          {#each roundModes as mode (mode.id)}
            <ModeCard
              id={mode.id}
              label={modeLabel(mode.id)}
              hint={MODES[mode.id]?.hint ?? null}
              picked={rounds.some((round) => round.mode === mode.id)}
              onpick={(on) => toggle(mode, on)}
            />
          {/each}
        </ul>
      {/if}
      {#if upcomingModes.length > 0}
        <div class="soon">
          <h3>Coming soon</h3>
          <ul>
            {#each upcomingModes as mode (mode.id)}
              {@const art = npcArt(mode.host)}
              <li class="upcoming">
                <img class={art.cut} src={art.url} alt="" draggable="false" />
                <span>{mode.label}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
    <div class="side">
      <button
        type="button"
        class="pick"
        onclick={() => (pickingForMe = true)}
        disabled={roundModes.length === 0}>Pick for me</button
      >
      <RoundList
        bind:rounds
        bind:order={modeOrder}
        {bounds}
        surprise={surprise ? randomRounds : null}
        {tally}
      />
    </div>
  </div>

  <div
    class="pane"
    role="tabpanel"
    id="{id}-rules-panel"
    aria-labelledby="{id}-rules"
    hidden={tab !== 'rules'}
  >
    <HouseRules
      bind:pace
      bind:difficulty
      bind:standingsSeconds
      bind:closeWhenAllAnswered
      bind:nameWrongAnswers
      bind:items
      {teams}
    />
  </div>

  <div
    class="pane"
    role="tabpanel"
    id="{id}-events-panel"
    aria-labelledby="{id}-events"
    hidden={tab !== 'events'}
  >
    <RandomEvents
      bind:frequency
      slots={eventCount}
      atLeast={surprise}
      own={own ? customQuestions : []}
    />
    {#if own}
      <CustomQuestions
        bind:questions={customQuestions}
        bind:editing={editingQuestion}
        slots={eventCount}
        {frequency}
        atMore={eventsAtMore}
      />
    {/if}
  </div>
</section>

{#if pickingForMe}
  <PickForMe
    count={randomCount}
    max={randomMax}
    {surprise}
    canHide={hidden}
    onPick={pickForMe}
    onCancel={() => (pickingForMe = false)}
  />
{/if}

<style>
  /* A code is a sheet of two lines, which leaves the room to the panel. */
  :global(.frame:has(.tonight)) {
    --scroll-lines: 2;
  }

  /* The panel takes what the room has left, so the stage never scrolls around it: it runs
     from the room's stage down through everything that holds this panel. */
  :global(.fitted .stage-in:has(.tonight)),
  :global(.fitted .stage-in :has(.tonight)) {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
    margin-bottom: 0;
  }

  /* The host's dialogue box and sheet share a row, which leaves the height to the panel. */
  :global(.fitted .stage.stage:has(.tonight)) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto minmax(0, 1fr);
    column-gap: 1rem;
    align-items: stretch;
  }

  :global(.fitted .stage.stage:has(.tonight) > .under) {
    grid-column: 1 / -1;
  }

  /* As tall as the sheet beside it, so the row ends level. */
  :global(.fitted .stage.stage:has(.tonight) > .speaker .bubble) {
    height: 100%;
    align-content: center;
  }

  /* Half the column, so the sheet's words come down from the size a whole one can take. */
  :global(.fitted .stage.stage:has(.tonight) > .stage-row) {
    --scroll-text: 1.15;
  }

  .tonight {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0;
    container-type: inline-size;
  }

  /* Stacked, the table comes after this, so a phone scrolls the hosts in here to reach it. */
  :global(.frame:not(.fitted)) .tonight {
    max-height: 34rem;
  }

  :global(.fitted) .tonight {
    flex: 1;
    min-height: 0;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.5rem;
  }

  .head h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .sum {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .tabs {
    flex: 1 1 18rem;
    display: flex;
    gap: 0.4rem;
  }

  .tabs button {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0 0 0.2rem;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    text-align: left;
    color: var(--muted);
    cursor: pointer;
  }

  .tabs button::before {
    content: '';
    align-self: stretch;
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--line) 40%, var(--panel));
  }

  .tabs [aria-selected='true']::before {
    background: var(--accent);
  }

  .tabs [aria-selected='true'],
  .tabs button:hover {
    color: var(--ink);
  }

  .problem {
    margin: 0;
    color: var(--bad);
    font-size: 0.9rem;
  }

  .pane {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    padding-top: 0.25rem;
  }

  .pane[hidden] {
    display: none;
  }

  /* Hosts on the left, what they add up to on the right, staying while the hosts scroll. */
  .rounds {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    gap: 1rem;
    align-items: start;
  }

  .side {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .pick {
    min-height: 2.5rem;
  }

  /* One column on a phone, with Pick for me over the hosts it picks from. */
  @container (max-width: 36rem) {
    .rounds {
      grid-template-columns: minmax(0, 1fr);
    }

    .side {
      display: contents;
    }

    .pick {
      order: -1;
    }

    /* The last tab's name takes a row of its own, under the two short ones. */
    .tabs {
      flex-wrap: wrap;
    }

    .tabs button {
      white-space: nowrap;
    }

    .tabs button:last-child {
      flex-basis: 100%;
      white-space: normal;
    }
  }

  /* What a tab holds is already on this panel, so it brings no panel of its own. */
  .pane :global(.panel) {
    margin: 0 0 1rem;
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .count {
    margin: 0;
    font-weight: 700;
  }

  .soon {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-top: 1rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }

  .soon h3 {
    margin: 0;
    font-size: 0.9rem;
  }

  .soon ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .upcoming {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .upcoming img {
    height: 1.75rem;
    opacity: 0.55;
    filter: grayscale(0.4);
  }

  .upcoming .render {
    width: 1.75rem;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }
</style>
