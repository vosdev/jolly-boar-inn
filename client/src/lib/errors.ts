/**
 * What a player reads when the room refuses a message.
 *
 * The server's messages are written for whoever reads the logs ("no question is open"),
 * so the codes a player can run into in play get words of their own. `bad_state` covers
 * too many different refusals for one sentence, and its messages already read plainly;
 * the rest end the connection or belong to the name popover, so they keep the server's.
 */

import type { ErrorCode, OpenQuestion, ProtocolError } from './protocol'

/** A refusal as the room screens keep it. */
export interface Refusal extends ProtocolError {
  /** A `not_open` that came before the question's answers did, not after they closed. */
  early?: boolean
}

const PLAYER_TEXT: Partial<Record<ErrorCode, string>> = {
  not_open: 'Too late, that question had closed.',
  already_answered: "You've already answered this one.",
  excluded: "You can't answer this question.",
  bad_value: "That answer didn't go through. Try again.",
  not_admin: 'Only a host can do that.',
}

/**
 * Whether a `not_open` arriving now was the event's hold rather than the close.
 *
 * Judged against `ends_at`, not `answerable_at`: an answer sent a moment before the hold
 * ended is refused, but its refusal lands after it, when `answerable_at` has passed too.
 * A refusal for being late lands after `ends_at`, or after the question has gone.
 */
export function refusedEarly(question: OpenQuestion | null, serverNow: number): boolean {
  return question?.answerable_at !== undefined && serverNow < Date.parse(question.ends_at)
}

/** The banner text for a refusal: ours for the codes players hit, the server's otherwise. */
export function errorText(error: Refusal): string {
  if (error.code === 'not_open' && error.early === true) return "Hold on, answers aren't open yet."
  return PLAYER_TEXT[error.code] ?? error.message
}
