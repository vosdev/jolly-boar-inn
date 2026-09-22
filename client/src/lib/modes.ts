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
 *
 * The splash's artwork is here too (D7, section 7.1 of ideas/design.md): six tavern
 * scenes, each mode assigned one, plus a small per-mode mark in the foreground that says
 * what the round is. Modes share scenes; a new mode costs a mark, not an illustration.
 * The art is a file, never code: `assets/scenes/<scene id>.<ext>` and
 * `assets/scenes/marks/<mode id>.<ext>`, found by name at build time. A scene with no file
 * yet is drawn as a placeholder by `Splash.svelte`, and dropping the file in replaces it
 * with nothing else to change. `assets/scenes/README.md` has the sizes.
 */

export interface Mode {
  id: string
  /**
   * The question type a round of this mode is answered in, as `OpenQuestion.type` names it.
   * Null for `custom` and `random_event`, whose questions each carry their own.
   */
  type: string | null
  /** Two or three words. The splash headline and the checkbox label. */
  label: string
  /** One line, for the create form. */
  hint: string
  /** One or two sentences, for the splash. Say what to do, not how it is scored. */
  blurb: string
  /** Which of the six scenes the splash hangs behind this mode's name. */
  scene: SceneId
  /**
   * What sits above the answer buttons, or null for a mode whose type view draws the
   * whole question itself. Named here and drawn in `components/questions/index.ts`, so
   * this file stays free of `.svelte` imports.
   */
  stem: StemId | null
  /**
   * The list a round of this mode is answered from, for a `pick_from_list` mode only.
   * The splash names it so the list is fetched while players read, not when the first
   * question is already running (`lib/vocab.ts`).
   */
  vocab?: string
}

/**
 * The stems a mode can name. Five modes answer on the same four buttons, and this is
 * what keeps them from looking alike: Bestiary asks in a sentence, Drop Table shows an
 * item, Who Said That? a line in a chatbox. Each id is one component under
 * `components/questions/stems/`, and a new one lands with the first mode that needs it.
 */
export type StemId = 'text' | 'asset' | 'examine'

/**
 * The six pubs of the crawl. Each is one scene, drawn once and shared by every mode
 * assigned to it; the variety between rounds comes from these rather than the palette,
 * which stays the one the player picked (section 1).
 */
export const SCENES = {
  jolly_boar: 'The Jolly Boar Inn',
  blue_moon: 'The Blue Moon Inn',
  rusty_anchor: 'The Rusty Anchor',
  dead_mans_chest: "The Dead Man's Chest",
  rising_sun: 'The Rising Sun',
  dragon_inn: 'The Dragon Inn',
} as const

export type SceneId = keyof typeof SCENES

/** The scene for a mode this build has no entry for: the inn the app is named after. */
export const DEFAULT_SCENE: SceneId = 'jolly_boar'

export const MODES: Record<string, Mode> = {
  more_less: {
    id: 'more_less',
    type: 'more_less',
    label: 'More or Less',
    hint: 'A mix of Grand Exchange, High Alchemy and NPC prices.',
    blurb:
      'Two items, one question: which one is worth more or less?',
    // Varrock's pub, a short walk from the Grand Exchange whose prices this round is about.
    scene: 'blue_moon',
    // The question is the two buttons: a stem above them would say the names twice.
    stem: null,
  },
  price_is_right: {
    id: 'price_is_right',
    type: 'price_is_right',
    label: 'The Price is Right',
    hint: 'Test your Grand Exchange knowledge.',
    blurb: 'One item, four prices. Which one does it really go for on the Grand Exchange?',
    // Mos Le'Harmless, where a chest of coins is the thing everyone is pricing up.
    scene: 'dead_mans_chest',
    // The item, above four prices that would otherwise not say what they are prices of.
    stem: 'asset',
  },
  guess_examine: {
    id: 'guess_examine',
    type: 'pick_from_list',
    label: 'Guess the Examine',
    hint: 'Name the thing from the line you get when you examine it.',
    blurb: 'An examine line from the game. Search the list and pick what it belongs to.',
    // Falador's pub, where half the White Knights stand about waiting to be examined.
    scene: 'rising_sun',
    // The examine line is the question; the list below it is only how you answer.
    stem: 'examine',
    vocab: 'examines',
  },
  // Never offered as a round: the host's questions are random events inside other rounds.
  // It is here for the stem those questions are drawn with, and for the splash of a room
  // created before T21, whose custom questions still play as a round of their own.
  custom: {
    id: 'custom',
    type: null,
    label: "Host's Questions",
    hint: 'Questions the host wrote for this room.',
    blurb: 'The host wrote these ones. Whatever they ask, answer it.',
    // The inn the app is named after, where the host is the one behind the bar.
    scene: 'jolly_boar',
    // Every type a host can write asks in a sentence; the view below it is the answer.
    stem: 'text',
  },
  // Never a round either: the NPCs' own questions, each asked by the NPC it was written
  // for (`lib/randomEvents.ts`, `components/RandomEvent.svelte`). Here for its stem.
  random_event: {
    id: 'random_event',
    type: null,
    label: 'Random Event',
    hint: 'An NPC interrupts the round with a question of their own.',
    blurb: 'Someone has turned up with a question. Answer it, and they will be on their way.',
    scene: 'jolly_boar',
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
  { id: 'who_is_that_npc', label: 'Who is That NPC?', hint: "It's Elvarg!" },
  { id: 'bestiary', label: 'Bestiary', hint: 'Combat levels, weaknesses and haunts of the monsters.' },
  { id: 'drop_table', label: 'Drop Table', hint: 'Ironmen should know this.' },
  { id: 'odd_one_out', label: 'Odd One Out', hint: 'Four items, three alike. Spot the one that is not.' },
  { id: 'release_order', label: 'Release Order', hint: 'Put quests and monsters in the order they came out.' },
  { id: 'sort_it_out', label: 'Sort It Out', hint: 'Are you a skiller or a slacker?' },
  { id: 'who_said_that', label: 'Who Said That?', hint: 'Name the character behind the line.' },
  { id: 'pixel_hunt', label: 'Pixel Hunt', hint: 'How fast can you recognize the item?' },
  { id: 'clipped', label: 'Know Your Content Creator', hint: 'Are you sure you are a fan?' },
  { id: 'Name that spell', label: 'Name that spell', hint: 'Because everyone plays with sound effects on!' },
  { id: 'Minimap Guesser', label: 'Minimap Guesser', hint: 'Where in the name of Gielinor is that?' },
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

/** What the splash draws for a round: the scene, and the art for it where there is some. */
export interface SplashArt {
  scene: SceneId
  /** The scene's name, which is what a placeholder carries below the mode's. */
  sceneName: string
  /** The scene's image, or null while it has not been drawn yet. */
  sceneUrl: string | null
  /** The mode's foreground mark, or null: a scene is a whole picture without one. */
  markUrl: string | null
}

// Every art file present at build time, as URL by path. A folder with no files in it is
// an empty object, which is today, and which is why a missing picture is never a request
// that 404s: a scene with no file is known to have none before the page asks. Vite wants
// the patterns as literals, so the extensions are spelled out twice.
const sceneFiles = import.meta.glob<string>('../assets/scenes/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})
const markFiles = import.meta.glob<string>('../assets/scenes/marks/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The file named `id` in a glob, whatever its extension. */
function fileNamed(files: Record<string, string>, id: string): string | null {
  for (const [path, url] of Object.entries(files)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (base.slice(0, base.lastIndexOf('.')) === id) return url
  }
  return null
}

/**
 * The splash art for a mode. A mode this build does not know gets the default scene and
 * no mark, so a round from a newer server still has somewhere to be.
 */
export function splashArt(modeId: string): SplashArt {
  const scene = MODES[modeId]?.scene ?? DEFAULT_SCENE
  return {
    scene,
    sceneName: SCENES[scene],
    sceneUrl: fileNamed(sceneFiles, scene),
    markUrl: MODES[modeId] === undefined ? null : fileNamed(markFiles, modeId),
  }
}
