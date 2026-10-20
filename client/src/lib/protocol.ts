/**
 * The websocket protocol's types, generated from `server/app/ws/protocol.py`.
 *
 * Every message and shared shape comes from `protocol.gen.ts`, which `make gen-protocol`
 * writes from `schema/protocol.schema.json`; a field renamed on the server is a compile
 * error here once that is regenerated, and a test fails until it is. This file adds only
 * what generation cannot: names for the unions the schema inlines, and two differences
 * forced by the language.
 *
 * - `datetime` fields are ISO 8601 strings. The server dumps with
 *   `model_dump(mode="json")`, so that is what actually arrives.
 * - `protocol.py`'s `Error` is `ProtocolError` here. `Error` is a global in TypeScript,
 *   and an `import type { Error }` would shadow it in the importing module.
 */

import type { Error, PlayerView, RoomSettings, RoomView, Skip } from './protocol.gen'

export type * from './protocol.gen'

/** `protocol.py`'s `Error`. Renamed; the wire `t` is still `"error"`. */
export type ProtocolError = Error
export type ErrorCode = Error['code']

export type RoomStatus = RoomView['status']
/**
 * `standings` sits between a round's last reveal and the next round, and nowhere
 * else. A screen that does not know a phase shows its waiting state.
 */
export type Phase = RoomView['phase']
/** Every timed phase: each one is a wait the host can cut short. */
export type SkippablePhase = Skip['phase']
export type Role = PlayerView['role']

/** Scales every question's time to answer and its reveal: a quarter more, as is, a quarter less. */
export type Pace = RoomSettings['pace']
/** How often an NPC interrupts: there is no off switch, `less` is the fewest. */
export type EventFrequency = NonNullable<RoomSettings['random_event_frequency']>

/** Round questions per random event at each frequency: `rooms/settings.py`'s `EVENT_EVERY`. */
export const EVENT_EVERY: Record<EventFrequency, number> = { less: 20, default: 10, more: 5 }
