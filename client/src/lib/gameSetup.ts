/** The part of a room's settings that is tonight's game, as the host edits it. */

import type { NewRoomSettings } from './api'
import type { RoomSettings } from './protocol'

export type TonightSettings = Omit<NewRoomSettings, 'teams' | 'max_players' | 'hide_rounds'>

/** Two games are the same game when this says so, whatever else their objects carry. */
export function tonightKey(settings: TonightSettings): string {
  const drawn = settings.surprise_modes ?? 0
  return JSON.stringify([
    drawn > 0 ? drawn : settings.modes,
    settings.mode_order,
    settings.random_event_frequency,
    settings.pace,
    settings.difficulty,
    settings.standings_seconds,
    settings.close_when_all_answered,
    settings.name_wrong_answers,
  ])
}

/** The game a room holds, for the host's panel to edit. */
export function tonightOf(settings: RoomSettings): TonightSettings {
  return { ...settings, random_event_frequency: settings.random_event_frequency ?? 'default' }
}
