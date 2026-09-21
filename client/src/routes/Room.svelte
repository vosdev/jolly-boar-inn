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
   *                                  (a new mode)                            │
   *                                                                          │
   *   finished ◀───────────────── game_finished ─────────────────────────────┘
   *
   * The splash only comes round again when the next round plays a different mode: it
   * introduces a mode, not a round, so a game of one mode shows it once.
   *
   * `playing` with no question and nothing revealed is the gap between a reveal ending
   * and the next question opening. It is a frame or two wide in practice, and after a
   * restart (T11) it is however long the recovery reveal has left, so it gets a screen
   * of its own rather than a blank panel.
   */
  import { onMount } from 'svelte'

  import Lobby from '../components/Lobby.svelte'
  import Scoreboard from '../components/Scoreboard.svelte'
  import Splash from '../components/Splash.svelte'
  import Timer from '../components/Timer.svelte'
  import Question from '../components/questions/Question.svelte'
  import { clearSession, getSession } from '../lib/session'
  import {
    answerAck,
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
   * clamped to. With nothing open it falls back to the round's own `seconds`.
   */
  const questionSeconds = $derived(
    $question === null
      ? ($room?.settings.modes.find((round) => round.mode === segment?.mode)?.seconds ?? 0)
      : (Date.parse($question.ends_at) - Date.parse($question.opened_at)) / 1000,
  )
  /** What the splash says each question of its round lasts; null for a round not in settings. */
  const roundSeconds = $derived(
    $room?.settings.modes.find((round) => round.mode === $room?.segment?.mode)?.seconds ?? null,
  )
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
    <!-- The table used to be captioned with the room code, which the top bar now carries
         on every screen; D9 makes this and the between-rounds board one component. -->
    <Scoreboard standings={$standings} youId={$you?.id ?? null} />
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
      onSkip={isAdmin ? () => socket?.send({ t: 'skip' }) : null}
    />
  {:else}
    <!-- playing -->
    <div class="spread head">
      <h1>
        {#if segment !== null && segment.total > 1}
          <span class="round">Round {segment.index + 1} of {segment.total}</span>
        {/if}
        Question {number} of {total}
      </h1>
      {#if $room.phase === 'open' && $question !== null}
        <Timer endsAt={$question.ends_at} totalSeconds={questionSeconds} label="to answer" />
      {:else if $room.next_at !== null}
        <Timer
          endsAt={$room.next_at}
          totalSeconds={$room.settings.reveal_seconds}
          label="to the next"
        />
      {/if}
    </div>

    {#if $lastError !== null}
      <div class="banner bad">
        {$lastError.message}
        <button type="button" class="link" onclick={() => lastError.set(null)}>dismiss</button>
      </div>
    {/if}

    {#if $room.phase === 'open' && $question !== null}
      <section class="panel">
        <Question question={$question} yourValue={$yourAnswer} onAnswer={answer} />
      </section>

      {#if $yourAnswer !== null}
        <!-- The band is all `answer_ack` carries: how fast or how early, never whether
             it was right. Correctness is nobody's until `question_closed`. The badge
             keeps it short; the sentence is in the tooltip for anyone who wants it. -->
        <p class="note waiting">
          Answer in.
          {#if landed !== null}<span
              class="band"
              title={landed.sentence}
              aria-label={landed.sentence}>{landed.badge}</span
            >{/if}
          Waiting for the rest of the room.
        </p>
      {/if}
    {:else if $lastClosed !== null}
      <section class="panel">
        {#if $lastClosed.was !== null}
          <Question
            question={$lastClosed.was}
            reveal={$lastClosed.reveal}
            yourValue={$yourAnswer}
            result={yourResult}
            onAnswer={() => {}}
          />
        {:else}
          <p class="note">That question is closed.</p>
        {/if}
      </section>
      <Scoreboard
        standings={$standings}
        youId={$you?.id ?? null}
        results={$lastClosed.results}
        title="Standings"
      />
    {:else}
      <!-- A reveal we arrived into: reconnected mid-reveal, or a room that just came
           back from a restart. No `question_closed` reached this client, so there is
           nothing to reveal — only where everyone stands. -->
      <section class="panel">
        <p class="note">
          {$room.phase === 'reveal'
            ? 'Between questions — the next one opens shortly.'
            : 'Waiting for the next question…'}
        </p>
      </section>
      <Scoreboard standings={$standings} youId={$you?.id ?? null} />
    {/if}

    {#if isAdmin && socket !== null}
      <section class="panel">
        <h2>Host</h2>
        <div class="row">
          <button type="button" onclick={() => socket?.send({ t: 'skip' })}>
            {$room.phase === 'open' ? 'Close this question now' : 'Skip to the next question'}
          </button>
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
    margin: -0.5rem 0 1.25rem;
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
