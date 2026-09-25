/**
 * What a player reads when the room refuses a message.
 *
 * The server's messages are written for whoever reads the logs ("no question is open"),
 * so the codes a player can run into in play get words of their own. `bad_state` covers
 * too many different refusals for one sentence, and its messages already read plainly;
 * the rest end the connection or belong to the name popover, so they keep the server's.
 */

import type { ErrorCode, ProtocolError } from './protocol'

const PLAYER_TEXT: Partial<Record<ErrorCode, string>> = {
  not_open: 'Too late, that question had closed.',
  already_answered: "You've already answered this one.",
  excluded: "You can't answer this question.",
  bad_value: "That answer didn't go through. Try again.",
  not_admin: 'Only a host can do that.',
}

/** The banner text for a refusal: ours for the codes players hit, the server's otherwise. */
export function errorText(error: ProtocolError): string {
  return PLAYER_TEXT[error.code] ?? error.message
}
