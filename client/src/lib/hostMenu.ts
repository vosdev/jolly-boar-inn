import { writable } from 'svelte/store'

/** One of the host's controls, as the top bar's Host menu lists it. */
export interface HostAction {
  label: string
  run: () => void
}

/** Set by the room for an admin, drawn by the top bar; null draws no Host menu. */
export const hostMenu = writable<HostAction[] | null>(null)
