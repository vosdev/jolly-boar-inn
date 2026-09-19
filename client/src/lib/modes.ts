/**
 * What each game mode is called and how it is explained, in one place.
 *
 * The server sends a mode id and nothing else — no label, no blurb. Copy is a client
 * concern: it is what the create form's checkboxes read, what the splash screen says
 * before a round, and where the artwork will hang when there is some. Keeping all three
 * on one object is what stops them drifting apart as modes are added.
 *
 * Plain TypeScript with no `.svelte` imports, so every screen can use it. The components
 * that *draw* a question live in `components/questions/index.ts` instead.
 */

export interface Mode {
  id: string
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
    label: 'More or Less',
    hint: 'Which of two items is worth more — or less',
    blurb:
      'Two items, one question: which one is worth more or less?',
  },
}

/** Registry order, which is the order the create form lists them in. */
export const MODE_LIST: Mode[] = Object.values(MODES)

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
