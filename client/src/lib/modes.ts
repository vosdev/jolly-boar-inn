/**
 * What each game mode is called and how it is explained, in one place.
 *
 * The server sends a mode id and nothing else — no label, no blurb. Copy is a client
 * concern: it is what the create form's checkboxes read, what the lobby lists and what the
 * splash's scroll says before a round. Keeping all of it on one object is what stops them
 * drifting apart as modes are added.
 *
 * Which modes exist, which types each plays and how a round of each is paced is the
 * server's to say: `GET /api/modes` (see `lib/api.ts`) is what the create form lists, so a
 * build that plays a mode this file has no copy for still offers it, under its id.
 *
 * A mode is a round, not a question type: several modes may be answered the same way.
 * A question on the wire carries its own `type`, and that is what draws it.
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
  /**
   * What goes on the clue scroll above the answers, or null for a mode drawn by its
   * view alone. Named here and drawn in `components/questions/index.ts`, so
   * this file stays free of `.svelte` imports.
   */
  stem: StemId | null
}

/**
 * The stems a mode can name. Five modes answer on the same four buttons, and this is
 * what keeps them from looking alike: Bestiary asks in a sentence, Drop Table shows an
 * item, Who Said That? a line in a chatbox. Each id is one component under
 * `components/questions/stems/`, and a new one lands with the first mode that needs it.
 */
export type StemId = 'text' | 'asset' | 'examine' | 'more_less' | 'price'

export const MODES: Record<string, Mode> = {
  more_less: {
    id: 'more_less',
    label: 'More or Less',
    hint: 'A mix of Grand Exchange, High Alchemy and NPC prices.',
    blurb:
      'Two items, one question: which one is worth more or less?',
    // Which of the two costs more, on the scroll; the names are the buttons below it.
    stem: 'more_less',
  },
  price_is_right: {
    id: 'price_is_right',
    label: 'The Price is Right',
    hint: 'Test your Grand Exchange knowledge.',
    blurb: 'One item, four prices. Which one does it really go for on the Grand Exchange?',
    // The item and the question, above four prices that would not say what they price.
    stem: 'price',
  },
  guess_examine: {
    id: 'guess_examine',
    label: 'Guess the Examine',
    hint: 'Name the thing from the line you get when you examine it.',
    blurb: 'An examine line from the game. Search the list and pick what it belongs to.',
    // The examine line is the question; the list below it is only how you answer.
    stem: 'examine',
  },
  // Never offered as a round: the host's questions are random events inside other rounds.
  // It is here for the stem those questions are drawn with, and for the splash of a room
  // created before T21, whose custom questions still play as a round of their own.
  custom: {
    id: 'custom',
    label: "Host's Questions",
    hint: 'Questions the host wrote for this room.',
    blurb: 'The host wrote these ones. Whatever they ask, answer it.',
    // Every type a host can write asks in a sentence; the view below it is the answer.
    stem: 'text',
  },
  // Never a round either: the NPCs' own questions, each asked by the NPC it was written
  // for (`lib/randomEvents.ts`, `components/RandomEvent.svelte`). Here for its stem.
  random_event: {
    id: 'random_event',
    label: 'Random Event',
    hint: 'An NPC interrupts the round with a question of their own.',
    blurb: 'Someone has turned up with a question. Answer it, and they will be on their way.',
    // In character, and still a sentence.
    stem: 'text',
  },
}

/**
 * Modes still being built, shown on the create form ticked off and disabled so players
 * can see what is coming. Copy only: once a mode ships it gets a full `MODES` entry and
 * `/api/modes` lists it, and the form stops treating it as upcoming — so an entry left
 * here after that is harmless, but belongs deleted.
 */
export const UPCOMING_MODES: { id: string; label: string; hint: string }[] = [
  { id: 'whos_that_npc', label: 'Who is That NPC?', hint: "It's Elvarg!" },
  { id: 'bestiary', label: 'Bestiary', hint: 'Combat levels, weaknesses and haunts of the monsters.' },
  { id: 'drop_table', label: 'Drop Table', hint: 'Ironmen should know this.' },
  { id: 'odd_one_out', label: 'Odd One Out', hint: 'Four items, three alike. Spot the one that is not.' },
  { id: 'release_order', label: 'Release Order', hint: 'Put quests and monsters in the order they came out.' },
  { id: 'sort_it_out', label: 'Sort It Out', hint: 'Are you a skiller or a slacker?' },
  { id: 'who_said_that', label: 'Who Said That?', hint: 'Name the character behind the line.' },
  { id: 'pixel_hunt', label: 'Pixel Hunt', hint: 'How fast can you recognize the item?' },
  { id: 'clipped', label: 'Know Your Content Creator', hint: 'Are you sure you are a fan?' },
  { id: 'name_that_spell', label: 'Name that spell', hint: 'Because everyone plays with sound effects on!' },
  { id: 'minimap_guesser', label: 'Minimap Guesser', hint: 'Where in the name of Gielinor is that?' },
]

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
