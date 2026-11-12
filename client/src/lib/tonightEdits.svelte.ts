/**
 * The host's edits to tonight's game in the lobby, sent once they settle. The whole game
 * goes on each send, so a socket that dropped one has lost nothing; the questions the host
 * ticks go to the server the same way.
 */

import { ApiFailure, setRoomQuestions } from './api'
import type { HostQuestion } from './customQuestions'
import type { TonightSettings } from './gameSetup'

/** How long an edit waits for the next one, so a stepper held down is one frame. */
export const EDIT_SETTLES_MS = 250

function errorMessage(error: unknown): string {
  return error instanceof ApiFailure ? error.message : 'Could not save your questions. Try again.'
}

/** Tonight's game as the host edits it: what is waiting to go, and what stops a start. */
export class TonightEdits {
  /** What in the setup stops the game starting, in words, or null when nothing does. */
  block = $state<string | null>(null)
  #unsent: TonightSettings | null = null
  #editTimer: ReturnType<typeof setTimeout> | undefined
  #questionsTimer: ReturnType<typeof setTimeout> | undefined

  constructor(readonly send: (settings: TonightSettings) => void) {}

  /** Hold an edit until the next one has had time to come. */
  edited = (next: TonightSettings): void => {
    this.#unsent = next
    clearTimeout(this.#editTimer)
    this.#editTimer = setTimeout(this.flush, EDIT_SETTLES_MS)
  }

  /** Send the held edit now, before a start reads the settings. */
  flush = (): void => {
    clearTimeout(this.#editTimer)
    if (this.#unsent !== null) this.send(this.#unsent)
    this.#unsent = null
  }

  /** Store the room's own questions once the ticking settles; a refusal blocks the start. */
  upload(code: string, session: string, questions: HostQuestion[]): void {
    clearTimeout(this.#questionsTimer)
    this.#questionsTimer = setTimeout(() => {
      void setRoomQuestions(code, session, questions).catch(
        (error: unknown) => (this.block = errorMessage(error)),
      )
    }, EDIT_SETTLES_MS)
  }
}
