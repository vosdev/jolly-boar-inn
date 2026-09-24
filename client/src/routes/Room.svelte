<script lang="ts">
  /**
   * `/r/:code` for a browser that has a session: open the socket, let `stores.ts` hold
   * what comes back, and pick a screen from it.
   *
   * The screen is a state machine over `room.status` and, inside `playing`,
   * `room.phase` — the same two fields the server's own `Room` carries, kept in step by
   * `stores.ts` as frames arrive:
   *
   *   lobby ─ start_game ─▶ playing/splash ─ question_open ─▶ playing/open ─┐
   *                              ▲                 ▲                        │
   *                              │                 │        question_closed │
   *                              │                 │                        ▼
   *                              └── room_updated ─┴─── question_open ── playing/reveal
   *                                  (a new round) │                         │   │
   *                                                │            room_updated │   │
   *                                                │                         ▼   │
   *                                                └──── question_open ── playing/standings
   *                                                                              │
   *   finished ◀───────────────── game_finished ─────────────────────────────────┘
   *
   * The splash comes round before each round's first question and before no other, so a
   * random event, which is a question inside a round, never gets one and neither does the
   * question after it. The event draws its own announcement instead: `RandomEvent`, the NPC
   * and their question, with the answers held back until `answerable_at`. The standings
   * (D9) follow every round but the last, whatever the splash does, and only between
   * rounds: inside one, there is no board under the reveal, and the last round's
   * standings are the final screen, which draws the same `<Scoreboard>`.
   *
   * `playing` with no question and nothing revealed is the gap between a reveal ending
   * and the next question opening. It is a frame or two wide in practice, and after a
   * restart (T11) it is however long the recovery reveal has left, so it gets a screen
   * of its own rather than a blank panel. A phase this build does not know lands there
   * too, which is how a build from before `standings` existed rides one out.
   */
  import { onMount } from 'svelte'

  import Lobby from '../components/Lobby.svelte'
  import PointsSlot from '../components/PointsSlot.svelte'
  import RandomEvent from '../components/RandomEvent.svelte'
  import RevealTally from '../components/RevealTally.svelte'
  import Scoreboard from '../components/Scoreboard.svelte'
  import Splash from '../components/Splash.svelte'
  import Question from '../components/questions/Question.svelte'
  import { MODES } from '../lib/modes'
  import { clearSession, getSession } from '../lib/session'
  import {
    answerAck,
    answerCount,
    applyServerMessage,
    connection,
    lastClosed,
    lastError,
    noteAnswerSent,
    players,
    question,
    resetRoom,
    room,
    roomSend,
    standings,
    you,
    yourAnswer,
  } from '../lib/stores'
  import { timerBar } from '../lib/timerbar'
  import { prefetchVocab } from '../lib/vocab'
  import { RoomSocket, type ClosureReason } from '../lib/ws'

  let { code, navigate }: { code: string; navigate: (to: string) => void } = $props()

  let socket = $state<RoomSocket | null>(null)
  let departure = $state<{ reason: ClosureReason; detail: string } | null>(null)

  onMount(() => {
    resetRoom()
    const session = getSession(code)
    if (session === null) {
      navigate(`/r/${code}`) // No session: the router sends us to Join instead.
      return
    }
    const live = new RoomSocket(code, session, {
      onMessage: applyServerMessage,
      onState: (state) => connection.set(state),
      onClosed: (reason, detail) => {
        // A session the room will not accept is worth nothing; drop it so the next
        // visit offers a fresh join rather than failing the same way forever.
        if (reason === 'bad_session' || reason === 'kicked') clearSession(code)
        departure = { reason, detail }
      },
    })
    socket = live
    // The identity chip in the top bar renames and re-rolls through this socket (D4).
    roomSend.set((message) => live.send(message))
    live.open()
    return () => {
      roomSend.set(null)
      timerBar.set(null)
      live.close()
      socket = null
    }
  })

  const FAREWELL: Record<ClosureReason, string> = {
    replaced: 'You opened this room on another device. Only the newest one stays connected.',
    bad_session: 'This device is no longer a player in the room. Join again to come back.',
    kicked: 'An admin removed you from the room.',
    no_room: 'That room is gone — it either never existed or it has expired.',
    protocol: 'The connection ended on a protocol error. Reloading usually fixes it.',
    stopped: 'Disconnected.',
  }

  // `bad_session` and `kicked` dropped the session above, so a reload lands on Join,
  // not back in the room. Say so rather than promising a reconnect that cannot happen.
  const RETRY = $derived(
    departure === null || departure.reason === 'no_room'
      ? null
      : departure.reason === 'bad_session' || departure.reason === 'kicked'
        ? 'Join again'
        : 'Reconnect',
  )

  const isAdmin = $derived($you?.role === 'admin')
  /** The position, 0-based. `index` is it while open; `current_index` survives a close. */
  const position = $derived($question?.index ?? $room?.current_index ?? 0)
  /**
   * The round in progress. `question_open` carries its own, which is the one to trust
   * while a question is up: a round can change with no splash to announce it.
   */
  const segment = $derived($question?.segment ?? $room?.segment ?? null)
  /** 1-based within the round, for people, with the whole game as the fallback. */
  const number = $derived(segment === null ? position + 1 : position - segment.start + 1)
  const total = $derived(segment?.count ?? $question?.total ?? $room?.total ?? 0)
  /**
   * How long this question is open for, from the question rather than from the settings:
   * the two agree, but only the frame knows what a room stored under older rules was
   * clamped to. With nothing open it falls back to the round's own `seconds`. The clock
   * starts at `answerable_at`, after a random event's NPC has held the floor, so that is
   * what the length is measured from.
   */
  const questionSeconds = $derived(
    $question === null
      ? ($room?.settings.modes.find((round) => round.mode === segment?.mode)?.seconds ?? 0)
      : (Date.parse($question.ends_at) -
          Date.parse($question.answerable_at ?? $question.opened_at)) /
          1000,
  )
  /** What the splash says each question of its round lasts; null for a round not in settings. */
  const roundSeconds = $derived(
    $room?.settings.modes.find((round) => round.mode === $room?.segment?.mode)?.seconds ?? null,
  )
  // A `pick_from_list` round answers from a list fetched once per session. The splash is
  // the time to fetch it, so the first question does not open on "Loading the list".
  $effect(() => {
    const vocab = $room?.phase === 'splash' ? MODES[$room.segment?.mode ?? '']?.vocab : undefined
    if (vocab !== undefined) prefetchVocab(vocab)
  })
  /**
   * The bar under the top bar (D8): the open question's clock, or the reveal's or the
   * standings' countdown to what comes next. The splash draws its own, and nothing else
   * in a room is timed.
   */
  $effect(() => {
    const current = $room
    const open = $question
    if (departure !== null || current === null || current.status !== 'playing') {
      timerBar.set(null)
    } else if (current.phase === 'open' && open !== null) {
      timerBar.set({ endsAt: open.ends_at, totalSeconds: questionSeconds, label: 'to answer' })
    } else if (
      (current.phase === 'reveal' || current.phase === 'standings') &&
      current.next_at !== null
    ) {
      const standing = current.phase === 'standings'
      timerBar.set({
        endsAt: current.next_at,
        totalSeconds: standing
          ? current.settings.standings_seconds
          : current.settings.reveal_seconds,
        label: standing ? 'to the next round' : 'to the next question',
      })
    } else {
      timerBar.set(null)
    }
  })
  /**
   * Our points after the question just closed, for the points slot. From `standings`,
   * which `question_closed` carries and the standings screen draws, so the slot's total
   * and the next board cannot disagree.
   */
  const yourTotal = $derived(
    $you === null
      ? null
      : ($standings.find((standing) => standing.player_id === $you.id)?.points ?? null),
  )
  /** A name for the reveal's tally: whoever is in the room, or was in the standings. */
  function nameOf(id: string): string | null {
    return (
      $players.find((player) => player.id === id)?.display_name ??
      $standings.find((standing) => standing.player_id === id)?.display_name ??
      null
    )
  }
  /** Our own row in the reveal, if we answered. */
  const yourResult = $derived(
    $you === null || $lastClosed === null ? null : ($lastClosed.results[$you.id] ?? null),
  )
  const winners = $derived($standings.filter((standing) => standing.rank === 1))
  /** Same grouping as the scoreboard, so the headline and the table agree. */
  const numbers = new Intl.NumberFormat()

  /**
   * What `answer_ack` told us, which is where the answer landed and nothing else: its
   * speed bucket, or the step of a question that shows more of itself as it runs. A
   * ranked question has no band — a guess is only worth something against the others —
   * so it gets no badge. Built here rather than in the markup because Svelte trims the
   * leading space off an `{#if}` block's first text node, and this clause needs one.
   */
  const landed = $derived.by(() => {
    const ack = $answerAck
    if (ack === null || ack.band === null) return null
    return ack.scoring === 'step'
      ? {
          badge: `step ${ack.band}`,
          sentence: `answered on step ${ack.band}, 1 being the earliest`,
        }
      : {
          badge: `${ack.band}/5`,
          sentence: `speed bucket ${ack.band} of 5, 1 being the fastest`,
        }
  })

  /** The host's skip, naming the phase and question on screen (see `Skip`). */
  function skip(): void {
    const current = $room
    if (current === null || current.phase === 'idle' || current.current_index === null) return
    socket?.send({ t: 'skip', phase: current.phase, index: current.current_index })
  }

  /**
   * The skip button says where it goes. From a reveal that is the next question, except
   * after a round's last, which goes to the standings (or the next round with them off),
   * and after the game's last, which goes to the final screen.
   */
  const skipLabel = $derived.by(() => {
    const current = $room
    if (current?.phase === 'open') return 'Close this question now'
    if (current?.phase === 'standings') return 'Start the next round now'
    if (current?.phase !== 'reveal' || current.current_index === null) {
      return 'Skip to the next question'
    }
    const at = current.current_index
    if (at + 1 >= current.total) return 'Show the final standings'
    const round = current.segment
    if (round === null || at !== round.start + round.count - 1) return 'Skip to the next question'
    return current.settings.standings_seconds > 0
      ? 'Show the standings now'
      : 'Start the next round now'
  })

  function answer(value: unknown): void {
    const open = $question
    if (open === null || socket === null) return
    if (!socket.send({ t: 'answer', question_id: open.question_id, value })) return
    noteAnswerSent(value)
  }

  function leave(): void {
    navigate('/')
  }
</script>

{#if departure !== null}
  <!-- The room's code is in the top bar (D2, section 4). These headings say which screen
       you are on, which is what the code used to be crowding out. -->
  <h1>Disconnected</h1>
  <section class="panel">
    <p>{FAREWELL[departure.reason]}</p>
    <div class="row">
      {#if RETRY !== null}
        <button type="button" class="primary" onclick={() => location.reload()}>{RETRY}</button>
      {/if}
      <button type="button" onclick={leave}>Home</button>
    </div>
  </section>
{:else}
  {#if $connection === 'reconnecting'}
    <div class="banner">Connection lost — reconnecting…</div>
  {/if}

  {#if $room === null}
    <p class="note">Connecting…</p>
  {:else if $room.status === 'lobby'}
    <h1>Lobby</h1>
    {#if socket !== null}
      <Lobby {socket} />
    {/if}
  {:else if $room.status === 'finished'}
    <h1>Final standings</h1>
    {#if winners.length > 0}
      <p class="tagline">
        {winners.map((w) => w.display_name).join(' and ')}
        {winners.length === 1 ? 'wins' : 'tie for first'} with {numbers.format(winners[0].points)}
        points.
      </p>
    {:else}
      <p class="tagline">Nobody scored. A quiet night at the inn.</p>
    {/if}
    <Scoreboard standings={$standings} youId={$you?.id ?? null} final />
    <section class="panel">
      <!-- Rank is dense (section 6), so level scores genuinely share a place; what the
           sort settles is the order they are listed in, not the rank. -->
      <p class="note">
        Level scores share a place. Between them, more correct answers comes first, and
        after that the earliest to join.
      </p>
      <button type="button" onclick={leave}>Home</button>
    </section>
  {:else if $room.phase === 'splash' && $room.segment !== null}
    <!-- The splash is the whole screen: no header, no scoreboard, nothing to read past.
         The host's skip is on the card, small, for the same reason. -->
    {#if $lastError !== null}
      <div class="banner bad">
        {$lastError.message}
        <button type="button" class="link" onclick={() => lastError.set(null)}>dismiss</button>
      </div>
    {/if}
    <Splash
      segment={$room.segment}
      endsAt={$room.next_at}
      questionSeconds={roundSeconds}
      players={$players}
      youId={$you?.id ?? null}
      onReady={(ready) => socket?.send({ t: 'ready', ready })}
      onSkip={isAdmin ? skip : null}
    />
  {:else}
    <!-- playing -->
    <div class="spread head">
      {#if $room.phase === 'standings'}
        <h1>
          {#if segment !== null}
            <span class="round">After round {segment.index + 1} of {segment.total}</span>
          {/if}
          Standings
        </h1>
      {:else}
        <h1>
          {#if segment !== null && segment.total > 1}
            <span class="round">Round {segment.index + 1} of {segment.total}</span>
          {/if}
          Question {number} of {total}
        </h1>
      {/if}
      <!-- The points slot (D8): always here, in every mode, so the eye learns where the
           verdict is. The clock that used to sit here is the bar under the top bar. -->
      {#if $room.phase === 'reveal' && $lastClosed !== null && $lastClosed.was !== null}
        <PointsSlot
          result={yourResult}
          canAnswer={$lastClosed.was.you_can_answer}
          total={yourTotal}
        />
      {/if}
    </div>

    {#if $lastError !== null}
      <div class="banner bad">
        {$lastError.message}
        <button type="button" class="link" onclick={() => lastError.set(null)}>dismiss</button>
      </div>
    {/if}

    {#if $room.phase === 'standings'}
      <Scoreboard standings={$standings} youId={$you?.id ?? null} />
    {:else if $room.phase === 'open' && $question !== null}
      <section class="panel">
        {#if $question.random_event}
          <RandomEvent question={$question} yourValue={$yourAnswer} onAnswer={answer} />
        {:else}
          <Question question={$question} yourValue={$yourAnswer} onAnswer={answer} />
        {/if}
      </section>

      {#if $yourAnswer !== null}
        <!-- Answered and waiting (D8): up to fifteen seconds in which people look up at
             each other, so it says how the room is doing rather than one flat line. The
             answer itself is held, dimmed, in the view above. The band is all
             `answer_ack` carries: how fast or how early, never whether it was right.
             Correctness is nobody's until `question_closed`. -->
        <div class="waiting" role="status">
          <p class="held">
            Answer in{#if landed !== null}<span
                class="band"
                title={landed.sentence}
                aria-label={landed.sentence}>{landed.badge}</span
              >{/if}
          </p>
          <p class="room">
            {#if $answerCount !== null && $answerCount.of > 0}
              <span class="count">{$answerCount.answered} of {$answerCount.of}</span>
              answered — waiting for the room
            {:else}
              Waiting for the room
            {/if}
          </p>
        </div>
      {/if}
    {:else if $lastClosed !== null}
      <section class="panel">
        {#if $lastClosed.was !== null}
          {#if $lastClosed.was.random_event}
            <RandomEvent
              question={$lastClosed.was}
              reveal={$lastClosed.reveal}
              yourValue={$yourAnswer}
              result={yourResult}
              onAnswer={() => {}}
            />
          {:else}
            <Question
              question={$lastClosed.was}
              reveal={$lastClosed.reveal}
              yourValue={$yourAnswer}
              result={yourResult}
              onAnswer={() => {}}
            />
          {/if}
          <RevealTally
            results={$lastClosed.results}
            {nameOf}
            youId={$you?.id ?? null}
            showNames={$room.settings.name_wrong_answers === true}
          />
        {:else}
          <p class="note">That question is closed.</p>
        {/if}
      </section>
    {:else}
      <!-- A reveal we arrived into: reconnected mid-reveal, or a room that just came
           back from a restart. No `question_closed` reached this client, so there is
           nothing to reveal. There is no board here either: inside a round, where
           everyone stands waits for the round's end (D9). -->
      <section class="panel">
        <p class="note">
          {$room.phase === 'reveal'
            ? 'Between questions — the next one opens shortly.'
            : 'Waiting for the next question…'}
        </p>
      </section>
    {/if}

    {#if isAdmin && socket !== null}
      <section class="panel">
        <h2>Host</h2>
        <div class="row">
          <button type="button" onclick={skip}>{skipLabel}</button>
          <button
            type="button"
            onclick={() => {
              if (confirm('End the game now and show the final standings?')) {
                socket?.send({ t: 'end_game' })
              }
            }}
          >
            End the game
          </button>
        </div>
        <p class="note">
          {$players.length}
          {$players.length === 1 ? 'player' : 'players'} in the room.
        </p>
      </section>
    {/if}
  {/if}
{/if}

<style>
  .head {
    align-items: flex-end;
    margin-bottom: 1rem;
  }

  .head h1 {
    margin: 0;
  }

  .waiting {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: -0.5rem 0 1.25rem;
    font-size: 0.9rem;
  }

  .waiting p {
    margin: 0;
  }

  .held {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-weight: 600;
  }

  .room {
    color: var(--muted);
  }

  .count {
    color: var(--ink);
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .round {
    display: block;
    font-size: 0.8rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  .band {
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-variant-numeric: tabular-nums;
    cursor: help;
  }
</style>
