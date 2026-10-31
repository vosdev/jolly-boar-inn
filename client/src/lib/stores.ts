/**
 * The room as this client knows it, rebuilt from server frames.
 *
 * `welcome` is a full snapshot and is applied as a replacement, never a merge
 * (section 3, reconnect step 2). That is the whole reason the reconnect flow is as
 * simple as it is: a client that has been asleep for two questions does not have to
 * work out what it missed, it throws away what it had.
 *
 * Plain `svelte/store` writables rather than runes, because runes only compile inside
 * `.svelte` / `.svelte.ts` files and section 1 names this module `stores.ts`.
 */

import { get, writable } from 'svelte/store'

import { type Refusal, refusedEarly } from './errors'
import { savePastGame } from './history'
import type {
  AnswerAck,
  ClientMessage,
  OpenQuestion,
  PlayerView,
  ProtocolError,
  QuestionClosed,
  RoomView,
  ServerMessage,
  Standing,
  TeamStanding,
} from './protocol'
import { teamsOf } from './teams'
import type { ConnectionState } from './ws'

export const room = writable<RoomView | null>(null)
export const you = writable<PlayerView | null>(null)
export const players = writable<PlayerView[]>([])
export const question = writable<OpenQuestion | null>(null)
/**
 * Whether `question` arrived as it opened, in a `question_open`, rather than in a
 * `welcome`. A random event plays its entrance only for the first: a reconnect lands on
 * the settled stage.
 */
export const questionLive = writable(false)
export const yourAnswer = writable<unknown>(null)
export const standings = writable<Standing[]>([])
/** A team game's teams, ranked as `standings` ranks players; null outside one. */
export const teamStandings = writable<TeamStanding[] | null>(null)
/**
 * The game ended while this client watched, so the final screen plays its ceremony. A
 * `welcome` into a finished room, a reload included, goes straight to the hiscores.
 */
export const endedLive = writable(false)
/**
 * The `question_closed` frame for the question being revealed right now, plus the
 * question it closed.
 *
 * The frame is the only carrier of the correct answer and the per-player results, and
 * it never arrives twice, so it is kept until the next question opens. A client that
 * connects during a reveal never gets one — `welcome` has no reveal in it — which is
 * why the reveal screen has to work from the standings alone as well.
 *
 * `was` is the question as it stood while it was open, kept because the frame carries
 * neither the type that shaped `reveal` nor whether this player was allowed to score on
 * it. Null only if this client never saw the question open, in which case there is
 * nothing on screen to reveal either.
 */
export interface ClosedQuestion extends QuestionClosed {
  was: OpenQuestion | null
}

export const lastClosed = writable<ClosedQuestion | null>(null)
/**
 * What the server acked our answer with: how the question is scored and the band the
 * answer landed in there. Null until it does.
 */
export const answerAck = writable<Pick<AnswerAck, 'scoring' | 'band'> | null>(null)
/**
 * How many of the room have answered the open question, of how many can, and the ids of
 * who is still to. Seeded by the question's own frame and moved on by `answer_count` and
 * our `answer_ack`, which keeps the ids it does not carry; null with no question open, or
 * from a server that does not count.
 */
export const answerCount = writable<{ answered: number; of: number; waiting: string[] } | null>(
  null,
)
export const connection = writable<ConnectionState>('connecting')
/** The last rejected message, until dismissed or the next question opens. */
export const lastError = writable<Refusal | null>(null)
/**
 * The last rejected `set_profile`. Kept apart from `lastError` because the answer
 * belongs in the popover that sent it — "that name is taken" under the name field — not
 * in a banner across the lobby.
 */
export const profileError = writable<ProtocolError | null>(null)
const PROFILE_ERRORS: ReadonlySet<string> = new Set(['bad_name', 'name_taken', 'bad_avatar'])
/**
 * How many `welcome` and `error` frames have arrived. A request still waiting on the room
 * (the chip's `set_profile`) is over once this moves: an error answered something, and a
 * welcome replaced the state it was waiting to see change.
 */
export const requestsSettled = writable(0)

/**
 * Send on the room's socket, from outside the Room screen: the top bar's identity chip
 * renames and re-rolls with `set_profile`. Room sets this while its socket is open
 * and clears it on the way out; null means there is no room to send to.
 */
export const roomSend = writable<((message: ClientMessage) => boolean) | null>(null)

/**
 * `server_time` minus this browser's clock, in ms, as of the last frame that carried one.
 *
 * Timers are computed from `ends_at` against server time, not against the local clock
 * (section 3, reconnect step 2) — a phone whose clock is a minute out would otherwise
 * show a minute of nonsense.
 */
export const serverOffsetMs = writable(0)

function noteServerTime(serverTime: string): void {
  const server = Date.parse(serverTime)
  if (!Number.isNaN(server)) serverOffsetMs.set(server - Date.now())
}

/**
 * Fields the server changes on its own `Room` when it sends a frame that is not
 * `room_updated`.
 *
 * The server broadcasts `room_updated` for membership and status changes, and for the
 * start of a splash; `question_open` and `question_closed` move the room between `open`
 * and `reveal` without one. Applying that here is what lets the screen switch on `room.phase`
 * instead of second-guessing it: the client's `RoomView` stays the same view of the
 * room the server has, and a `welcome` replaces it outright if it ever drifts.
 */
function patchRoom(patch: Partial<RoomView>): void {
  room.update((current) => (current === null ? null : { ...current, ...patch }))
}

/** Forget one question: our answer, its ack, and the reveal it ended in. */
function forgetQuestion(): void {
  yourAnswer.set(null)
  answerAck.set(null)
  answerCount.set(null)
  lastClosed.set(null)
}

/** The count a frame carries, if it carries one. */
function countFrom(frame: { answered?: number; of?: number; waiting?: string[] } | null): void {
  if (frame !== null && typeof frame.answered === 'number' && typeof frame.of === 'number') {
    const waiting = frame.waiting ?? get(answerCount)?.waiting ?? []
    answerCount.set({ answered: frame.answered, of: frame.of, waiting })
  }
}

/**
 * We have sent an `answer` and not heard back yet.
 *
 * Optimistic on purpose: the buttons go dead on the click rather than a round trip
 * later, which is what stops a double tap from becoming an `already_answered` error.
 * `answer_ack` confirms it with a band; a rejection puts the buttons back.
 */
export function noteAnswerSent(value: unknown): void {
  yourAnswer.set(value)
  answerAck.set(null)
}

/**
 * Error codes that mean the answer we just sent was not taken, so the optimistic value
 * above has to go. `already_answered` is not one of them: the server is telling us it
 * has an answer from us, which is the state we are already showing.
 */
const ANSWER_REJECTED: ReadonlySet<string> = new Set(['not_open', 'excluded', 'bad_value'])

/**
 * Keep the final standings in this browser once the room is over. A `welcome` into a
 * finished room counts too: that is the phone that slept through the last question.
 */
function fileFinishedGame(): void {
  const current = get(room)
  if (current?.status !== 'finished' || current.finished_at === null) return
  // A daily has its own end screen, and Past games are rooms to look back on with others.
  if (current.daily != null) return
  savePastGame({
    code: current.code,
    finishedAt: current.finished_at,
    standings: get(standings),
    youId: get(you)?.id ?? null,
    teamStandings: get(teamStandings),
    teams: teamsOf(get(players)),
  })
}

/** Drop everything. Called when leaving a room, so the next one starts clean. */
export function resetRoom(): void {
  room.set(null)
  you.set(null)
  players.set([])
  question.set(null)
  questionLive.set(false)
  standings.set([])
  teamStandings.set(null)
  endedLive.set(false)
  forgetQuestion()
  lastError.set(null)
  profileError.set(null)
  connection.set('connecting')
  serverOffsetMs.set(0)
}

/**
 * `room_updated` and `players_updated` have no `you` field, but the player list has us in
 * it. A promote changes our own role and the list is the only thing that carries it, so
 * without this the promoted client keeps a stale `player` role and never sees the
 * controls it just earned. Falling back to the current value keeps a kicked player's
 * identity readable while their socket closes.
 */
function setPlayers(list: PlayerView[]): void {
  players.set(list)
  you.update((current) =>
    current === null ? null : (list.find((player) => player.id === current.id) ?? current),
  )
}

export function applyServerMessage(message: ServerMessage): void {
  switch (message.t) {
    case 'welcome':
      // Replace, do not merge.
      room.set(message.room)
      you.set(message.you)
      players.set(message.players)
      question.set(message.question)
      questionLive.set(false)
      standings.set(message.standings)
      teamStandings.set(message.team_standings)
      endedLive.set(false)
      // No reveal and no ack in a snapshot: a client that arrives mid-reveal shows
      // the scoreboard, not the answer it never saw revealed.
      forgetQuestion()
      yourAnswer.set(message.your_answer)
      countFrom(message.question)
      lastError.set(null)
      noteServerTime(message.server_time)
      requestsSettled.update((n) => n + 1)
      fileFinishedGame()
      break

    case 'room_updated':
      // The room_updated saying `finished` comes before `game_finished`, and the final
      // screen mounts on it, so this is where it learns it is watching the end.
      if (get(room)?.status === 'playing' && message.room.status === 'finished') endedLive.set(true)
      room.set(message.room)
      setPlayers(message.players)
      if (message.standings !== undefined) standings.set(message.standings)
      if (message.team_standings !== undefined) teamStandings.set(message.team_standings)
      break

    case 'players_updated':
      setPlayers(message.players)
      break

    case 'question_open':
      question.set(message.question)
      questionLive.set(true)
      forgetQuestion()
      countFrom(message.question)
      // A refusal was about a moment that has passed; left up, "too late" would hang over
      // every question after it.
      lastError.set(null)
      // The segment comes along because a round can change with no splash to announce
      // it — a restart in the splash resumes at the question — and this frame is then
      // the only thing carrying the change.
      patchRoom({
        phase: 'open',
        current_index: message.question.index,
        segment: message.question.segment,
        next_at: null,
        reveal_seconds: null,
      })
      break

    case 'question_closed':
      // The question is behind us. A client that reconnects during a reveal is sent
      // `question: null` too, so this leaves both paths in the same state; the reveal
      // this frame carries is what the two screens differ by.
      {
        const open = get(question)
        question.set(null)
        standings.set(message.standings)
        teamStandings.set(message.team_standings)
        lastClosed.set({
          ...message,
          was: open?.question_id === message.question_id ? open : null,
        })
      }
      patchRoom({
        phase: 'reveal',
        next_at: message.next_at,
        reveal_seconds: message.reveal_seconds,
      })
      break

    case 'game_finished':
      endedLive.set(true)
      question.set(null)
      standings.set(message.standings)
      teamStandings.set(message.team_standings)
      // The `room_updated` that precedes this frame already says `finished`; saying it
      // again costs nothing and means the final screen never waits on frame order.
      patchRoom({ status: 'finished', phase: 'idle', next_at: null })
      fileFinishedGame()
      break

    case 'answer_ack':
      // Late news too, once the next question is up: its band is not this one's.
      if (get(question)?.question_id !== message.question_id) break
      answerAck.set({ scoring: message.scoring, band: message.band })
      countFrom(message)
      // The ack carries no list, and the broadcast that does leaves the answerer out.
      answerCount.update((count) =>
        count === null
          ? null
          : { ...count, waiting: count.waiting.filter((id) => id !== get(you)?.id) },
      )
      break

    case 'answer_count':
      // A count for a question that has already closed is late news; drop it.
      if (get(question)?.question_id === message.question_id) countFrom(message)
      break

    case 'pong':
      noteServerTime(message.server_time)
      break

    case 'error':
      requestsSettled.update((n) => n + 1)
      if (PROFILE_ERRORS.has(message.code)) {
        profileError.set(message)
        break
      }
      lastError.set(
        message.code === 'not_open'
          ? { ...message, early: refusedEarly(get(question), Date.now() + get(serverOffsetMs)) }
          : message,
      )
      if (ANSWER_REJECTED.has(message.code)) yourAnswer.set(null)
      break
  }
}
