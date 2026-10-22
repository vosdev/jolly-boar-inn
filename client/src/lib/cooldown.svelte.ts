/**
 * The lobby's `CHANGE_COOLDOWN`, kept on this side too, so a control the server would
 * refuse for being changed again too soon is greyed out instead.
 */

/** The server's second, and a little over: it counts from when the change landed, after the tap. */
export const LOBBY_COOLDOWN_MS = 1200

/** A control held for a moment after each change it sends. */
export class Cooldown {
  held = $state(false)
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(readonly ms: number = LOBBY_COOLDOWN_MS) {}

  /** Hold the control from now until `ms` have passed. */
  start(): void {
    this.held = true
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => (this.held = false), this.ms)
  }
}
