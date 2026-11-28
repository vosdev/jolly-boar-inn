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

/**
 * A switch that never greys out under the cooldown. A tap shows at once; one inside the
 * cooldown is kept, and only the last of those is sent once it ends, so a burst of taps is
 * one change on the wire. Unconfirmed, it falls back to what the server says.
 */
export class HeldToggle {
  #intent = $state<boolean | null>(null)
  #pending: boolean | null = null
  #held = false
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly send: (value: boolean) => boolean,
    private readonly actual: () => boolean,
    readonly ms: number = LOBBY_COOLDOWN_MS,
  ) {}

  /** What the switch shows: the latest tap, or the server's state once that has settled. */
  get shown(): boolean {
    return this.#intent ?? this.actual()
  }

  /** Flip the switch: sent now, or after the cooldown if one is running. */
  toggle(): void {
    const next = !this.shown
    this.#intent = next
    if (this.#held) this.#pending = next
    else this.#fire(next)
  }

  #fire(value: boolean): void {
    if (!this.send(value)) {
      this.#intent = null
      return
    }
    this.#held = true
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => this.#settle(), this.ms)
  }

  #settle(): void {
    this.#held = false
    const pending = this.#pending
    this.#pending = null
    if (pending !== null && pending !== this.actual()) this.#fire(pending)
    else this.#intent = null
  }
}
