/**
 * What each game mode is called and how it is explained, in one place.
 *
 * The server sends a mode id and nothing else — no label, no blurb. Copy is a client
 * concern: it is what the create form's checkboxes read, what the lobby lists, what the
 * splash screen says before a round, and where the artwork will hang when there is some.
 * Keeping all of it on one object is what stops them drifting apart as modes are added.
 *
 * Which modes exist, and how a round of each is paced, is the server's to say:
 * `GET /api/modes` (see `lib/api.ts`) is what the create form lists, so a build that
 * plays a mode this file has no copy for still offers it, under its id.
 *
 * A mode is a round, not a question type: several modes may be answered the same way.
 * Each entry names the type it plays as, which is the pairing `app/modes` holds on the
 * server. A question on the wire carries its own `type` as well, and that one is what
 * draws it.
 *
 * Plain TypeScript with no `.svelte` imports, so every screen can use it. The components
 * that *draw* a question live in `components/questions/index.ts` instead.
 */

export interface Mode {
  id: string
  /** The question type a round of this mode is answered in, as `OpenQuestion.type` names it. */
  type: string
  /** Two or three words. The splash headline and the checkbox label. */
  label: string
  /** One line, for the create form. */
  hint: string
  /** One or two sentences, for the splash. Say what to do, not how it is scored. */
  blurb: string
}

export const MODES: Record<string, Mode> = {
  more_less: {
    id: 'more_less',
    type: 'more_less',
    label: 'More or Less',
    hint: 'Which of two items is worth more — or less',
    blurb:
      'Two items, one question: which one is worth more or less?',
  },
}

/**
 * A mode's name, or the raw id for one this build does not know.
 *
 * A room can be playing a mode from a newer server than this client was built against.
 * Showing the id is ugly but honest, and it matches what the question components do with
 * a type they cannot draw.
 */
export function modeLabel(id: string): string {
  return MODES[id]?.label ?? id
}
