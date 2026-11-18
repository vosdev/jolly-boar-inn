/**
 * Generated from `schema/protocol.schema.json` by `make gen-protocol`. Do not edit:
 * change `server/app/ws/protocol.py` and regenerate. Import from `protocol.ts`.
 */

/**
 * Every websocket frame: server/app/ws/protocol.py.
 */
export type Protocol = ClientMessage | ServerMessage
export type ClientMessage =
  | Hello
  | Ping
  | Answer
  | StartGame
  | Skip
  | Promote
  | SetTv
  | Kick
  | EndGame
  | EndRound
  | Rematch
  | RotateKey
  | DecideRequest
  | SetProfile
  | Ready
  | SetTeam
  | MoveTeam
  | SetTeams
  | SetSettings
  | Editing
export type ServerMessage =
  | Welcome
  | RoomUpdated
  | PlayersUpdated
  | QuestionOpen
  | AnswerAck
  | AnswerCount
  | QuestionClosed
  | GameFinished
  | Pong
  | Error
/**
 * The values are what `answer_ack.scoring` carries on the wire.
 */
export type Scoring = 'speed' | 'accuracy' | 'step'

export interface Hello {
  t: 'hello'
  session: string
}
export interface Ping {
  t: 'ping'
}
export interface Answer {
  t: 'answer'
  question_id: string
  value: unknown
}
export interface StartGame {
  t: 'start_game'
}
/**
 * End `phase` of the question at `index`: what the host was looking at when they
 * pressed it, so a second tap that lands once the room has moved on ends nothing.
 */
export interface Skip {
  t: 'skip'
  phase: 'splash' | 'open' | 'reveal' | 'standings'
  index: number
}
export interface Promote {
  t: 'promote'
  player_id: string
}
/**
 * Admin: make `player_id` the room's one TV (`on`), or a player again. Lobby only.
 */
export interface SetTv {
  t: 'set_tv'
  player_id: string
  on: boolean
}
export interface Kick {
  t: 'kick'
  player_id: string
}
export interface EndGame {
  t: 'end_game'
}
/**
 * End the round holding question `index`, which must still be the room's.
 */
export interface EndRound {
  t: 'end_round'
  index: number
}
/**
 * Admin: send a finished room back to its lobby for another game.
 */
export interface Rematch {
  t: 'rematch'
}
/**
 * Replace an invite-only room's key. Lobby only.
 */
export interface RotateKey {
  t: 'rotate_key'
}
/**
 * Let a join request in, or turn it away. Lobby of an invite-only room only.
 */
export interface DecideRequest {
  t: 'decide_request'
  request_id: string
  accept: boolean
}
/**
 * Rename, change the pet, or both. One message for both, because they are the
 * same operation on the same row: validated like a join, broadcast as `room_updated`.
 *
 * An omitted field is left as it is. The bounds here are only the outer ones; the name
 * rules and the list of pets are the manager's to apply.
 */
export interface SetProfile {
  t: 'set_profile'
  display_name?: string | null
  avatar?: string | null
}
/**
 * Tap ready, or take it back. In the lobby and on a splash; nowhere else.
 */
export interface Ready {
  t: 'ready'
  ready: boolean
}
/**
 * Join one of the room's teams. Lobby of a team game only, and not while ready.
 */
export interface SetTeam {
  t: 'set_team'
  team: 'saradomin' | 'zamorak' | 'guthix' | 'armadyl' | 'bandos' | 'zaros'
}
/**
 * Put any player on one of the room's teams, keeping their ready. Lobby only.
 */
export interface MoveTeam {
  t: 'move_team'
  player_id: string
  team: 'saradomin' | 'zamorak' | 'guthix' | 'armadyl' | 'bandos' | 'zaros'
}
/**
 * Admin: the whole list of a team game's gods, in the lobby. Names are checked by the
 * manager, so an unknown god is `bad_value` like any other wrong list.
 */
export interface SetTeams {
  t: 'set_teams'
  /**
   * @maxItems 16
   */
  teams: string[]
}
/**
 * Admin: the game's whole settings, in the lobby. Left a plain object here and checked by
 * the manager, so a wrong value is `bad_value` and costs nobody their socket.
 */
export interface SetSettings {
  t: 'set_settings'
  settings: {
    [k: string]: unknown
  }
}
/**
 * The name field gained focus (`on`), or lost it. Lobby only; ignored anywhere else.
 */
export interface Editing {
  t: 'editing'
  on: boolean
}
/**
 * Reply to `hello`: the full snapshot the client rebuilds all state from.
 */
export interface Welcome {
  t: 'welcome'
  room: RoomView
  you: PlayerView
  players: PlayerView[]
  question: OpenQuestion | null
  your_answer: unknown
  standings: Standing[]
  /**
   * Null outside a team game, here and on every frame that carries it.
   */
  team_standings: TeamStanding[] | null
  server_time: string
  /**
   * `/VERSION` of the running server. A client built from another version reloads itself,
   * so a deploy never leaves an old bundle reading frames it does not know.
   */
  server_version: string
}
export interface RoomView {
  code: string
  status: 'lobby' | 'playing' | 'finished'
  settings: RoomSettings
  current_index: number | null
  total: number
  /**
   * The random events among `total`, so the lobby can tell them from the rounds' questions.
   */
  events: number
  phase: 'idle' | 'splash' | 'open' | 'reveal' | 'standings'
  /**
   * When the current timed phase ends: a splash gives way to its first question, a reveal to
   * the next question or to the standings, the standings to the next round. Null while a
   * question is open, during a splash still waiting for the room to be ready, and in a room that
   * is not playing. Also on `question_closed`, but a splash, reveal or standings a client
   * arrives into (a reconnect, or a room that just came back from a restart) has no frame of its
   * own to carry it.
   */
  next_at: string | null
  /**
   * How long the reveal ending at `next_at` holds, so a countdown bar knows its full
   * length: each question's is its own. Null outside a reveal.
   */
  reveal_seconds: number | null
  /**
   * How long the game takes at most, for the lobby's minutes: `rooms/duration.py`.
   */
  estimated_seconds: number
  /**
   * The round in progress, null before the first question and once the game is over.
   */
  segment: Segment | null
  /**
   * The round the standings hand over to, sent only in the standings phase: hidden or
   * shuffled rounds are its splash's news, which the standings' "Next up" tells a few
   * seconds early.
   */
  next_segment?: Segment
  /**
   * The modes of the rounds before `segment`, in the order they were played, so a splash
   * can name past rounds' hosts after a shuffle or with `settings.hide_rounds`. Rounds still
   * to come are never in it.
   */
  played: string[]
  /**
   * When the game ended, null until it has. Every browser files the result under it, so it
   * comes from the server's clock and not each one's own.
   */
  finished_at: string | null
  /**
   * How many rounds the room plays, sent only when `settings.hide_rounds` keeps the rest of
   * `settings.modes` from a non-admin. Counted off the stored questions, so it agrees with
   * `Segment.total`.
   */
  rounds?: number
  /**
   * An invite-only room's key, sent to its admins only: settings reach every player.
   */
  key?: string
  /**
   * Who is asking to be let in without the key, oldest first: an invite-only room's, sent to
   * its admins only, as the key is.
   */
  requests?: JoinRequestView[]
  /**
   * A daily room's day. Its reveal waits for the player's `skip` instead of a countdown.
   */
  daily?: Daily
  /**
   * The items this round's standings dealt, in standings order, sent only in that phase.
   * Each is also on its finder's `PlayerView.item` from then on.
   */
  drops?: Drop[]
}
/**
 * A room's settings as stored in and read back from `rooms.settings`.
 */
export interface RoomSettings {
  /**
   * One round each, in this order unless `mode_order` says to shuffle them.
   */
  modes: ModeSettings[]
  /**
   * `"listed"`: the rounds play in the order the host arranged them, which is the order
   * this list is in. `"random"`: shuffled once, at the start.
   */
  mode_order: 'listed' | 'random'
  /**
   * One random event per 20, 10 or 5 round questions. `None` is a room stored while the
   * choice was a boolean, with `random_events: false`: its host's questions only (see the
   * module docstring). Never `None` for a room created since.
   */
  random_event_frequency: ('less' | 'default' | 'more') | null
  /**
   * Scales every question's time to answer and its reveal. A room stored before pace was a
   * setting reads as `run`, the times each type was written for.
   */
  pace: 'walk' | 'run' | 'teleport'
  /**
   * Which question tiers the rounds draw first (`TIERS`). A room stored before the setting
   * existed reads as `mixed`, every question, which is what it drew.
   */
  difficulty: 'easy' | 'mixed' | 'hard'
  /**
   * How long the standings hold the floor between two rounds. Zero turns them off; the game's
   * last round never has them, because the final screen is its standings. Defaulted, so a room
   * stored before the field existed reads as a room that has them.
   */
  standings_seconds: number
  close_when_all_answered: boolean
  /**
   * Name the players who answered wrong under a reveal. The host's call, on unless they turn
   * it off: the count of who got it right is always shown, the names are a room's taste. Nothing
   * on the wire changes, since `question_closed.results` already carries every row; the
   * setting only says whether the client prints the names.
   */
  name_wrong_answers: boolean
  /**
   * Items for the lower half of the standings between rounds (`rooms/items.py`). Ignored
   * in team games and daily rooms, which never deal any. A room stored before the setting
   * existed reads as on.
   */
  items: boolean
  /**
   * Surprise rounds: a non-admin is sent only the rounds that have started (`Room.view`).
   * Left off the wire while false, so a room without it reads exactly as one created before it
   * existed.
   */
  hide_rounds?: boolean
  /**
   * Surprise modes: this many rounds drawn by the server at the start, hidden from the admin
   * too, who did not pick them either. Implies `hide_rounds`. Left off the wire at 0, like
   * `hide_rounds`.
   */
  surprise_modes?: number
  /**
   * `None` means "the server's MAX_PLAYERS_PER_ROOM"; `RoomManager.create` resolves it,
   * so a stored room always has a number here.
   */
  max_players: number | null
  /**
   * The gods of a team game, in `GODS` order; `[]` is a game without teams, as is a room
   * stored before teams existed.
   */
  teams: ('saradomin' | 'zamorak' | 'guthix' | 'armadyl' | 'bandos' | 'zaros')[]
}
/**
 * One mode's round: how many questions it holds.
 *
 * Optional on the way in and filled from the mode's own `Bounds`, so
 * `{"mode": "more_less"}` is a complete round. After validation it is always present,
 * which is what the game loop and the lobby read.
 */
export interface ModeSettings {
  mode: string
  questions: number
}
/**
 * The round the room is in: one mode, a run of consecutive questions.
 *
 * Grouped from the `questions.round` column rather than stored a second time, so it
 * cannot drift from the questions it describes. `start` is a position in the room's
 * question list, which is what `OpenQuestion.index` counts in too, so the question
 * number within the round is `index - start + 1`.
 */
export interface Segment {
  /**
   * A mode id (`app/modes`), never a type id; the client's mode registry key.
   */
  mode: string
  /**
   * 0-based round number.
   */
  index: number
  /**
   * Rounds in this room.
   */
  total: number
  /**
   * Position of the round's first question.
   */
  start: number
  /**
   * Questions in the round.
   */
  count: number
}
export interface JoinRequestView {
  id: string
  display_name: string
  /**
   * As on `PlayerView`.
   */
  avatar: string | null
}
/**
 * The day's set a daily room plays: one player, alone, once.
 */
export interface Daily {
  /**
   * The date the set's 08:00 UTC window opened on.
   */
  day: string
  /**
   * The day's number, counting `DAILY_FIRST_DAY` as #1.
   */
  number: number
}
/**
 * One item found on the standings: who, and which.
 */
export interface Drop {
  player_id: string
  /**
   * An item id (`rooms/items.py`); the client has the name, the picture and the line.
   */
  item: string
}
export interface PlayerView {
  id: string
  display_name: string
  /**
   * A pet's id in `data/pets.json`; the server stores one for every player.
   */
  avatar: string | null
  role: 'player' | 'admin' | 'tv'
  /**
   * The god they play for in a team game; null outside one, and for everyone who just joined.
   */
  team: ('saradomin' | 'zamorak' | 'guthix' | 'armadyl' | 'bandos' | 'zaros') | null
  connected: boolean
  /**
   * The ready check: ready to start in the lobby, ready for this round on a splash. Every
   * splash starts it false for everyone again.
   */
  ready: boolean
  /**
   * Is typing a name in the lobby: "picking a name…". Advice, never a gate.
   */
  editing: boolean
  /**
   * What they hold or wear, in the open for everyone; null between its round's end and the
   * next drop.
   */
  item: HeldItem | null
}
/**
 * The item in a player's one slot, for the round it was found for.
 */
export interface HeldItem {
  id: string
  /**
   * What is left of an item spent a charge at a time; null for the rest.
   */
  charges: number | null
}
/**
 * What every socket sees while a question is open: `client_view` only, never the
 * answer or the raw payload ("Websocket protocol", "What the server withholds").
 */
export interface OpenQuestion {
  /**
   * The `questions` row id, never the content id: that one hashes the answer.
   */
  question_id: string
  index: number
  total: number
  /**
   * How it is answered: the key into `questions/types`.
   */
  type: string
  /**
   * Which mode it was drawn for (`app/modes`); not always the same string as `type`. On
   * the question itself rather than only on `segment`, because it is a fact about the
   * question, and the round it sits in is a different fact that merely agrees today.
   */
  mode: string
  /**
   * Repeated from `RoomView` because the client patches its room from this frame rather
   * than replacing it, and a round can change without a splash to announce it (a restart in the
   * splash resumes at the question).
   */
  segment: Segment
  view: {
    [k: string]: unknown
  }
  /**
   * The picture's random name in the client's bundle (`app/pictures.py`), or `None`.
   * Never the payload's `image`: for some modes that asset id is the answer.
   */
  picture: string | null
  /**
   * The NPC interrupting the round with this question, or `None` for a question that
   * belongs to its round. An id from `app/random_events.py`; the client has the copy.
   */
  random_event: string | null
  opened_at: string
  /**
   * When the buttons appear and the clock starts: `opened_at` plus the time the scroll
   * takes to type the question in (`rooms/hold.py`). An answer before it is `not_open`, and
   * `ends_at` is this plus the question's seconds.
   */
  answerable_at: string
  ends_at: string
  you_can_answer: boolean
  /**
   * How many have answered, of how many can, for the waiting state. Current as of this frame:
   * zero on `question_open`, the live count in a `welcome`, and kept up to date after that
   * by `answer_count` and the answerer's own `answer_ack`.
   */
  answered: number
  of: number
  /**
   * Who is still to answer, as player ids: connected, allowed to, and not yet in. Never
   * what anyone answered. The TV's waiting panel shows them; `answer_count` keeps it current.
   */
  waiting: string[]
}
export interface Standing {
  player_id: string
  display_name: string
  /**
   * As on `PlayerView`.
   */
  avatar: string | null
  /**
   * Answers' points and item points together.
   */
  points: number
  rank: number
  /**
   * What the round of the latest close added, item points included, and the rank before it;
   * None in the first.
   */
  points_gained: number
  previous_rank: number | null
}
/**
 * A team game's team: its members' points averaged and rounded, so a silent member counts.
 *
 * `rank` is dense over `points`, ties in `settings.teams` order; `points_gained` and
 * `previous_rank` follow `Standing`'s rule on the averages. A team without members is
 * left out.
 */
export interface TeamStanding {
  team: 'saradomin' | 'zamorak' | 'guthix' | 'armadyl' | 'bandos' | 'zaros'
  points: number
  rank: number
  points_gained: number
  previous_rank: number | null
}
/**
 * Join, leave, promote, kick, status change, `set_profile`, and the start of a
 * splash or of the standings, which carries `standings`. Also a ready tap, connect or
 * disconnect that moves the room itself, which on a splash is its countdown.
 */
export interface RoomUpdated {
  t: 'room_updated'
  room: RoomView
  players: PlayerView[]
  standings?: Standing[]
  team_standings?: TeamStanding[]
}
/**
 * A ready tap, a team change, an `editing` change, connect or disconnect that changed
 * the players and nothing else.
 */
export interface PlayersUpdated {
  t: 'players_updated'
  players: PlayerView[]
}
export interface QuestionOpen {
  t: 'question_open'
  question: OpenQuestion
}
/**
 * How the answer will be scored and where it landed, never whether it was right.
 *
 * `band` is the speed bucket (1..5) for `speed`, the step the answer arrived on for
 * `step`, and null for `accuracy`, where the clock does not count. A team game scores
 * `speed` on accuracy alone, so its band is null there too.
 */
export interface AnswerAck {
  t: 'answer_ack'
  question_id: string
  scoring: Scoring
  band: number | null
  /**
   * The room's count with this answer in it: the answerer is left out of the `answer_count`
   * broadcast, so the ack is where they hear it.
   */
  answered: number
  of: number
}
/**
 * The open question's count moved: how many have answered, of how many can, and who is
 * still to. Sent on another player's answer, connect, disconnect or kick.
 *
 * Never what: the waiting state shows "4 of 6 answered" and the TV the players still
 * thinking, nothing a player could read an answer off. `of` is every connected
 * player allowed to answer plus anyone who answered and has since dropped, so the count
 * never reads more than the total.
 */
export interface AnswerCount {
  t: 'answer_count'
  question_id: string
  answered: number
  of: number
  waiting: string[]
}
export interface QuestionClosed {
  t: 'question_closed'
  question_id: string
  reveal: {
    [k: string]: unknown
  }
  /**
   * The question's picture, so a reveal can show it: a round may hold it back until now.
   */
  picture: string | null
  results: {
    [k: string]: PlayerResult
  }
  /**
   * Connected players who could have answered and did not, for the reveal's "No answer".
   */
  unanswered: string[]
  standings: Standing[]
  team_standings: TeamStanding[] | null
  next_at: string | null
  /**
   * How long this reveal holds, even for the last question. Null in a daily room, whose
   * reveal waits for the player.
   */
  reveal_seconds: number | null
  /**
   * The player who suggested the question, when they asked to be named. Left out otherwise.
   */
  suggested_by?: string
}
/**
 * One player's row in the reveal.
 *
 * `credit` is what the type's `grade` returned. It is here so a reveal can say
 * "three of five in the right place"; `correct` is the tie-break's boolean, and is
 * `credit >= 1.0`. `points` is the answer's own; an item's are `item_points`, its own
 * line on the reveal.
 */
export interface PlayerResult {
  value: unknown
  correct: boolean
  credit: number
  points: number
  item_points: number
  /**
   * The item that added `item_points`; null when none did.
   */
  item: string | null
}
export interface GameFinished {
  t: 'game_finished'
  standings: Standing[]
  team_standings: TeamStanding[] | null
}
export interface Pong {
  t: 'pong'
  server_time: string
}
export interface Error {
  t: 'error'
  code:
    | 'bad_hello'
    | 'bad_message'
    | 'not_admin'
    | 'not_open'
    | 'already_answered'
    | 'excluded'
    | 'bad_value'
    | 'bad_state'
    | 'bad_name'
    | 'name_taken'
    | 'bad_avatar'
  message: string
}
