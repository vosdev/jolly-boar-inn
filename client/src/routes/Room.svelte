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
   * and their question, with the answers held back until `answerable_at`. Its reveal hands
   * the stage back to the host as it ends. The standings
   * follow every round but the last, whatever the splash does, and only between
   * rounds: inside one, there is no board under the reveal, and the last round's
   * standings are the final screen, the same hiscores with a ceremony before them.
   *
   * `playing` with no question and nothing revealed is the gap between a reveal ending
   * and the next question opening. It is a frame or two wide in practice, and after a
   * restart it is however long the recovery reveal has left, so it gets a screen
   * of its own rather than a blank panel. A phase this build does not know lands there
   * too, which is how a build from before `standings` existed rides one out.
   *
   * Every screen with a stage shares one (`lib/sharedStage.svelte.ts`), drawn after the
   * screens and before the host's controls, so it moves from screen to screen rather than
   * each screen putting up its own.
   *
   * A screen reader hears the changes through one polite live region that stays mounted
   * for the whole visit, because a region inserted already filled is often never read: a
   * question opening, or who interrupts with a random event, the verdict on it, and a
   * lost connection. Focus moves to the
   * question's heading as it opens, since the answer just pressed is disabled or gone and
   * would otherwise drop focus back to the top of the page. The tab's title names the
   * screen.
   */
  import { onMount, tick, untrack } from 'svelte'

  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import ErrorBanner from '../components/ErrorBanner.svelte'
  import FinalStandings from '../components/FinalStandings.svelte'
  import Lobby from '../components/Lobby.svelte'
  import { verdictSentence } from '../components/PointsSlot.svelte'
  import QuestionStage from '../components/QuestionStage.svelte'
  import RevealTally from '../components/RevealTally.svelte'
  import Standings from '../components/Standings.svelte'
  import Splash from '../components/Splash.svelte'
  import SharedStageView from '../components/stage/SharedStageView.svelte'
  import { historyPath, latestPastGame } from '../lib/history'
  import { SharedStage, shareStage } from '../lib/sharedStage.svelte'
  import { randomEventFor } from '../lib/randomEvents'
  import { clearSession, getSession, normalizeCode } from '../lib/session'
  import {
    applyServerMessage,
    connection,
    endedLive,
    lastClosed,
    noteAnswerSent,
    players,
    question,
    questionLive,
    resetRoom,
    room,
    roomSend,
    standings,
    teamStandings,
    you,
    yourAnswer,
  } from '../lib/stores'
  import { teamsOf } from '../lib/teams'
  import { timerBar } from '../lib/timerbar'
  import { reloadIfStale } from '../lib/version'
  import { listFor, prefetchVocab } from '../lib/vocab'
  import { RoomSocket, type ClosureReason } from '../lib/ws'

  let { code, navigate }: { code: string; navigate: (to: string) => void } = $props()

  let socket = $state<RoomSocket | null>(null)
  let departure = $state<{ reason: ClosureReason; detail: string } | null>(null)
  let endingGame = $state(false)
  /** The question the host pressed End the round on, while they confirm it. */
  let endingRound = $state<number | null>(null)

  onMount(() => {
    resetRoom()
    const session = getSession(code)
    if (session === null) {
      navigate(`/r/${code}`) // No session: the router sends us to Join instead.
      return
    }
    const live = new RoomSocket(code, session, {
      onMessage: (message) => {
        if (message.t === 'welcome' && reloadIfStale(message.server_version)) return
        applyServerMessage(message)
      },
      onState: (state) => connection.set(state),
      onClosed: (reason, detail) => {
        // A deleted room's players kept its result; that is what this link means now.
        const past = reason === 'no_room' ? latestPastGame(code) : null
        if (past !== null) {
          navigate(historyPath(past))
          return
        }
        // A session the room will not accept is worth nothing; drop it so the next
        // visit offers a fresh join rather than failing the same way forever.
        if (reason === 'bad_session' || reason === 'kicked') clearSession(code)
        departure = { reason, detail }
      },
    })
    socket = live
    // The identity chip in the top bar renames and re-rolls through this socket.
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
   * How long this question is open for: only the frame knows, since its type and the
   * room's pace decide. The clock starts at `answerable_at`, after the scroll has typed
   * the question in, so that is what the length is measured from.
   */
  const questionSeconds = $derived(
    $question === null
      ? 0
      : (Date.parse($question.ends_at) -
          Date.parse($question.answerable_at ?? $question.opened_at)) /
          1000,
  )
  // A typed or shared link may be in any case; the address bar takes the server's
  // spelling once the room answers, so a copied link reads as the word.
  $effect(() => {
    const spelled = $room?.code
    if (spelled === undefined || normalizeCode(spelled) !== code) return
    const path = `/r/${spelled}`
    if (location.pathname !== path) history.replaceState(history.state, '', path + location.hash)
  })
  // Fetched as the question arrives rather than when its view mounts, so a question
  // spends its hold fetching the list instead of the first seconds of answering.
  $effect(() => {
    const vocab = listFor($question)
    if (vocab !== null) prefetchVocab(vocab)
  })
  /**
   * The bar under the top bar: the open question's clock, or the reveal's or the
   * standings' countdown to what comes next. The splash draws its own, and nothing else
   * in a room is timed.
   */
  $effect(() => {
    const current = $room
    const open = $question
    if (departure !== null || current === null || current.status !== 'playing') {
      timerBar.set(null)
    } else if (current.phase === 'open' && open !== null) {
      timerBar.set({
        endsAt: open.ends_at,
        totalSeconds: questionSeconds,
        label: 'to answer',
        progress: `${number}/${total}`,
      })
    } else if (
      (current.phase === 'reveal' || current.phase === 'standings') &&
      current.next_at !== null
    ) {
      const standing = current.phase === 'standings'
      timerBar.set({
        endsAt: current.next_at,
        totalSeconds: standing ? current.settings.standings_seconds : (current.reveal_seconds ?? 0),
        label: standing ? 'to the next round' : 'to the next question',
        ...(standing ? {} : { progress: `${number}/${total}` }),
      })
    } else {
      timerBar.set(null)
    }
  })
  /**
   * Our points after the question just closed, for the announcer. From `standings`,
   * which `question_closed` carries and the standings screen draws, so the two cannot
   * disagree.
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
  /** The question's own heading, for the heading line, the announcer and the title. */
  const questionTitle = $derived(`Question ${number} of ${total}`)
  /** What the announcer says as a question opens: the heading, round and all. */
  const questionSpoken = $derived(
    segment !== null && segment.total > 1
      ? `Round ${segment.index + 1} of ${segment.total}, question ${number} of ${total}`
      : questionTitle,
  )

  let announcement = $state('')
  let heading = $state<HTMLElement | null>(null)

  async function announce(text: string): Promise<void> {
    // Emptied first, so a sentence the same as the last one is still new text to read.
    announcement = ''
    await tick()
    announcement = text
  }

  /** Someone typing, into the name editor say, keeps their focus when a question opens. */
  function typing(): boolean {
    const active = document.activeElement
    return (
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
      !active.disabled
    )
  }

  let spokenQuestion: string | null = null
  $effect(() => {
    const open = $question
    if (open === null || open.question_id === spokenQuestion) return
    spokenQuestion = open.question_id
    untrack(() => {
      void announce(
        open.random_event && $questionLive
          ? `Random event: ${randomEventFor(open.random_event).name} interrupts the round.`
          : questionSpoken,
      )
      void tick().then(() => {
        if (!typing()) heading?.focus()
      })
    })
  })

  let spokenVerdict: object | null = null
  $effect(() => {
    const closed = $lastClosed
    if (closed === null || closed.was === null || closed === spokenVerdict) return
    spokenVerdict = closed
    const canAnswer = closed.was.you_can_answer
    untrack(() => void announce(verdictSentence(yourResult, canAnswer, yourTotal)))
  })

  $effect(() => {
    if ($connection === 'reconnecting') untrack(() => void announce('Connection lost'))
  })

  const siteTitle = document.title
  const screenTitle = $derived(
    departure !== null
      ? 'Disconnected'
      : $room === null
        ? 'Connecting'
        : $room.status === 'lobby'
          ? 'Lobby'
          : $room.status === 'finished'
            ? 'Final standings'
            : $room.phase === 'splash' && $room.segment !== null
              ? `Round ${$room.segment.index + 1} of ${$room.segment.total}`
              : $room.phase === 'standings'
                ? 'Standings'
                : questionTitle,
  )
  $effect(() => {
    document.title = `${screenTitle} · ${siteTitle}`
  })
  onMount(() => () => {
    document.title = siteTitle
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

  /** Ask before ending the round on screen; standings have no round left to end. */
  const askEndRound = $derived.by(() => {
    const current = $room
    if (current === null || current.current_index === null) return null
    if (current.phase !== 'splash' && current.phase !== 'open' && current.phase !== 'reveal') {
      return null
    }
    const at = current.current_index
    return () => (endingRound = at)
  })

  /** The last round's end is the game's, and the dialog says so. */
  const endRoundMessage = $derived.by(() => {
    const round = $room?.segment
    if (round != null && $room !== null && round.start + round.count >= $room.total) {
      return 'This is the last round. End the game now and show the final standings?'
    }
    return 'End this round now and move on to the next one?'
  })

  const stage = new SharedStage()
  shareStage(stage)

  /** The playing screens after the splash, which have the host's controls under the stage. */
  const hostControls = $derived(
    $room !== null &&
      $room.status !== 'lobby' &&
      $room.status !== 'finished' &&
      !($room.phase === 'splash' && $room.segment !== null),
  )

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

<p class="sr" aria-live="polite">{announcement}</p>

{#if departure !== null}
  <!-- The room's code is in the top bar (section 4). These headings say which screen
       you are on, which is what the code used to be crowding out. -->
  <section class="panel">
    <h1>Disconnected</h1>
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
    <div class="banner" role="status">Connection lost — reconnecting…</div>
  {/if}

  {#if $room === null}
    <section class="panel"><p class="note">Connecting…</p></section>
  {:else if $room.status === 'lobby'}
    {#if socket !== null}
      <Lobby {socket} />
    {/if}
  {:else if $room.status === 'finished'}
    <FinalStandings
      standings={$standings}
      teamStandings={$teamStandings}
      teamOf={teamsOf($players)}
      youId={$you?.id ?? null}
      ceremony={$endedLive}
    >
      <button type="button" onclick={leave}>Home</button>
    </FinalStandings>
  {:else if $room.phase === 'splash' && $room.segment !== null}
    <!-- The splash is the whole screen: no header, no scoreboard, nothing to read past.
         The host's skip is on the card, small, for the same reason. -->
    <ErrorBanner />
    <Splash
      segment={$room.segment}
      endsAt={$room.next_at}
      players={$players}
      youId={$you?.id ?? null}
      onReady={(ready) => socket?.send({ t: 'ready', ready })}
      onSkip={isAdmin ? skip : null}
      onEndRound={isAdmin ? askEndRound : null}
    />
  {:else}
    <!-- playing. A question's screen is the stage and nothing to read past it. -->
    <div class:column={$room.phase !== 'standings'}>
      {#if $room.phase === 'standings'}
        <h1 class="sr">
          {#if segment !== null}
            <span class="round">After round {segment.index + 1} of {segment.total}</span>
          {/if}
          Standings
        </h1>
      {:else}
        <!-- The splash said which round this is, and the timer bar's tab says which
           question: the heading is only for a screen reader and for focus. -->
        <h1 class="sr" bind:this={heading} tabindex="-1">
          {#if segment !== null && segment.total > 1}
            <span class="round">Round {segment.index + 1} of {segment.total}</span>
          {/if}
          {questionTitle}
        </h1>
      {/if}

      <ErrorBanner />

      {#if $room.phase === 'standings'}
        <Standings
          standings={$standings}
          teamStandings={$teamStandings}
          {segment}
          youId={$you?.id ?? null}
        />
      {:else if $room.phase === 'open' && $question !== null}
        <QuestionStage
          question={$question}
          yourValue={$yourAnswer}
          onAnswer={answer}
          live={$questionLive}
        />
      {:else if $lastClosed !== null && $lastClosed.was !== null}
        <QuestionStage
          question={$lastClosed.was}
          reveal={$lastClosed.reveal}
          yourValue={$yourAnswer}
          result={yourResult}
          results={$lastClosed.results}
          onAnswer={() => {}}
          nextAt={$room.next_at}
        >
          <RevealTally
            type={$lastClosed.was.type}
            reveal={$lastClosed.reveal}
            results={$lastClosed.results}
            unanswered={$lastClosed.unanswered}
            {nameOf}
            youId={$you?.id ?? null}
            showNames={$room.settings.name_wrong_answers === true}
            suggestedBy={$lastClosed.suggested_by ?? null}
            teams={$room.settings.teams}
            teamOf={teamsOf($players)}
          />
        </QuestionStage>
      {:else if $lastClosed !== null}
        <section class="panel">
          <p class="note">That question is closed.</p>
        </section>
      {:else}
        <!-- A reveal we arrived into: reconnected mid-reveal, or a room that just came
           back from a restart. No `question_closed` reached this client, so there is
           nothing to reveal. There is no board here either: inside a round, where
           everyone stands waits for the round's end. -->
        <section class="panel">
          <p class="note">
            {$room.phase === 'reveal'
              ? 'Between questions — the next one opens shortly.'
              : 'Waiting for the next question…'}
          </p>
        </section>
      {/if}
    </div>
  {/if}

  <SharedStageView {stage} />

  {#if $room !== null && hostControls && isAdmin && socket !== null}
    <div class:column={$room.phase !== 'standings'}>
      <section class="panel">
        <h2>Host</h2>
        <div class="row">
          <button type="button" onclick={skip}>{skipLabel}</button>
          {#if askEndRound !== null}
            <button type="button" onclick={askEndRound}>End the round</button>
          {/if}
          <button type="button" onclick={() => (endingGame = true)}>End the game</button>
        </div>
        <p class="note">
          {$players.length}
          {$players.length === 1 ? 'player' : 'players'} in the room.
        </p>
      </section>
      {#if endingGame}
        <ConfirmDialog
          message="End the game now and show the final standings?"
          confirmLabel="End the game"
          onConfirm={() => {
            socket?.send({ t: 'end_game' })
            endingGame = false
          }}
          onCancel={() => (endingGame = false)}
        />
      {/if}
    </div>
  {/if}
  {#if endingRound !== null && isAdmin}
    <ConfirmDialog
      message={endRoundMessage}
      confirmLabel="End the round"
      onConfirm={() => {
        if (endingRound !== null) socket?.send({ t: 'end_round', index: endingRound })
        endingRound = null
      }}
      onCancel={() => (endingRound = null)}
    />
  {/if}
{/if}

<style>
  .column {
    max-width: 30rem;
    margin-inline: auto;
  }

  .round {
    display: block;
    font-size: 0.8rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }
</style>
