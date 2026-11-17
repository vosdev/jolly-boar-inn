/**
 * What each game mode is called and how it is explained, one file a mode under `modes/`.
 *
 * The server sends a mode id and nothing else — no label, no blurb. Copy is a client
 * concern: it is what the create form's checkboxes read, what the lobby lists and what the
 * splash's scroll says before a round. Keeping all of a mode's in its one file is what stops
 * them drifting apart as modes are added.
 *
 * Which modes exist, which types each plays and how a round of each is paced is the
 * server's to say: `GET /api/modes` (see `lib/api.ts`) is what the create form lists, so a
 * build that plays a mode with no file here still offers it, under its id.
 *
 * A mode is a round, not a question type: several modes may be answered the same way.
 * A question on the wire carries its own `type`, and that is what draws it.
 *
 * Every round is presented by an NPC, its host, and the host's lines are the mode's voice
 * (section 8 of ideas/design.md). Question prompts stay plain: they are read against the
 * clock, and a joke around them is a second thing to read.
 *
 * Plain TypeScript with no `.svelte` imports, so every screen can use it. The components
 * that *draw* a question live in `components/questions/index.ts` instead.
 */

import type { FormWording } from './customQuestions'
import { HOUSE } from './house'
import { ALL_MODE_IDS, pictureOf, rulesOf } from './modeRules'
import type { OrderingWording } from './ordering'
import type { FieldHints } from './placeholders'
import type { Scoring } from './protocol'
import type { Sample } from './samples'
import { fnv1a, shuffle } from './seeded'

/** An NPC who presents a round: its art is `lib/npcs.ts`, found by `id`. */
export interface Host {
  id: string
  /** The NPC as the game names it. */
  name: string
}

/** Who presents a round, and what they say through it. */
export interface HostLines {
  host: Host
  /** On the splash's scroll, between the mode's name and the blurb. */
  greeting: string
  /**
   * While a question is open, before you answer: typed before the stem, and the only place
   * a mode's standing instruction is said. At most `ASK_MAX` letters, the hold's budget.
   */
  ask: string[]
  /** Once you have answered, while the room catches up, until `answer_ack` says how fast. */
  waiting: string[]
  /** In `waiting`'s place once `answer_ack` gives a band: how fast, or how early, you were. */
  pace: Record<Pace, string[]>
  /** On the reveal, before the explanation: the room's line, for the TV and whoever could not answer. */
  reveal: string[]
  /** On the reveal, in `reveal`'s place, to a player who could answer: by how they did. */
  verdict: Record<Verdict, string[]>
}

/** How a player did on a question, which picks the host's reveal line for them. */
export type Verdict = 'right' | 'partial' | 'wrong' | 'missed'

export const VERDICTS: readonly Verdict[] = ['right', 'partial', 'wrong', 'missed']

/**
 * How soon an answer landed: a `speed` band of 1–2 is quick, 3 middling and 4–5 late; a
 * `step` answer on the first step is early, any after it later.
 */
export type Pace = 'quick' | 'middling' | 'late' | 'early' | 'later'

export const PACES: readonly Pace[] = ['quick', 'middling', 'late', 'early', 'later']

/** The pace of an acked answer, or null for one with no band, scored on accuracy alone. */
export function paceOf(ack: { scoring: Scoring; band: number | null } | null): Pace | null {
  if (ack === null || ack.band === null || ack.scoring === 'accuracy') return null
  if (ack.scoring === 'step') return ack.band <= 1 ? 'early' : 'later'
  return ack.band <= 2 ? 'quick' : ack.band === 3 ? 'middling' : 'late'
}

/** What a player has heard of their own answer, which picks the host's lines for them. */
export interface Heard {
  verdict?: Verdict | null
  pace?: Pace | null
}

/** The longest ask line: the server's hold counts this many letters for it (`rooms/hold.py`). */
export const ASK_MAX = 50

/** The three lines a host says around one question. */
export interface Spoken {
  ask: string
  waiting: string
  reveal: string
}

/** What `pickLines` needs of a question: its place in the room's list and its round's start. */
export interface Placed {
  index: number
  segment: { start: number }
}

/**
 * The lines `lines` says around question `at`, the same on every screen in the room; the
 * waiting line is `heard.pace`'s and the reveal line `heard.verdict`'s, when given.
 *
 * Each list of lines is shuffled once per round, seeded by the round's start, and the round's
 * questions walk through the shuffle in order. Any two questions fewer than a list's length
 * apart get different lines, so neighbours never repeat, a random event between them or not.
 */
export function pickLines(lines: HostLines, at: Placed, heard: Heard = {}): Spoken {
  const { verdict = null, pace = null } = heard
  const step = Math.max(0, at.index - at.segment.start)
  const pick = (list: string[], kind: string): string => {
    const order = shuffled(list.length, `${lines.host.id}:${kind}:${at.segment.start}`)
    return list[order[step % list.length] ?? 0] ?? ''
  }
  return {
    ask: pick(lines.ask, 'ask'),
    waiting: pace === null ? pick(lines.waiting, 'waiting') : pick(lines.pace[pace], pace),
    reveal: verdict === null ? pick(lines.reveal, 'reveal') : pick(lines.verdict[verdict], verdict),
  }
}

/** 0..n-1 in an order fixed by `seed`: a Fisher-Yates shuffle on a string hash. Over an LCG,
 * not `mulberry32`, because rooms already in play would see their host lines change. */
function shuffled(n: number, seed: string): number[] {
  let state = fnv1a(seed)
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  return shuffle(n, next)
}

/**
 * The Wise Old Man handing out the final's trophies, first place to fifth (section 11 of
 * ideas/design.md). He presents every final whoever hosted its rounds, so these are his
 * alone. Each line names the place and the tier and ends on "…": the scroll answers with
 * the names.
 */
export const TROPHY_LINES: readonly (readonly string[])[] = [
  [
    'For 1st place, the diamond trophy goes to…',
    'Top of the hiscores! 1st place and the diamond trophy go to…',
    'The diamond trophy. 1st place. Gz to…',
    'In all my years… 1st place, and the diamond trophy, goes to…',
  ],
  [
    'For 2nd place, the platinum trophy goes to…',
    'So close! 2nd place, and the platinum trophy, goes to…',
    'The platinum trophy, for a hard-fought 2nd place, goes to…',
  ],
  [
    'For 3rd place, the gold trophy goes to…',
    '3rd place, and a gold trophy. Not bad at all. For…',
    'The gold trophy, and 3rd place, goes to…',
  ],
  [
    'For 4th place, the silver trophy goes to…',
    '4th place! In my day that earned a nod. Today, silver, for…',
    'The silver trophy, for 4th place, goes to…',
  ],
  [
    'For 5th place, the bronze trophy goes to…',
    '5th place, and a bronze trophy, for steady gains. To…',
    'Every hiscore starts somewhere. 5th place, and bronze, for…',
  ],
]

/** For a place several players share: `{place}` is "2nd", `{tier}` "platinum". */
export const SHARED_TROPHY_LINES: readonly string[] = [
  'Tied for {place} place, a {tier} trophy each for…',
  '{place} place is shared! A {tier} trophy each for…',
  'Level on points! Tied for {place}, a {tier} trophy for each of…',
]

const PLACE_SUFFIXES = ['st', 'nd', 'rd', 'th', 'th']

/**
 * The Wise Old Man presenting rank `rank` (1 to 5) and its `tier`, `tied` when several hold
 * it. `seed` picks among the lines, so one game's final says the same on every screen.
 */
export function trophyLine(rank: number, tier: string, tied: boolean, seed: string): string {
  const list = tied ? SHARED_TROPHY_LINES : (TROPHY_LINES[rank - 1] ?? [])
  const line = list[shuffled(list.length, `trophy:${rank}:${tied}:${seed}`)[0] ?? 0] ?? ''
  const place = `${rank}${PLACE_SUFFIXES[rank - 1] ?? 'th'}`
  return line.replaceAll('{place}', place).replaceAll('{tier}', tier)
}

export interface Mode extends HostLines {
  id: string
  /** Two or three words. The splash headline and the checkbox label. */
  label: string
  /** One line, for the create form. */
  hint: string
  /** One or two sentences, for the splash, in the host's voice. Say what to do, not how it is scored. */
  blurb: string
  /** After the blurb in a team game, for a mode that keeps paying for speed there. */
  teams?: string
  /**
   * What goes on the clue scroll above the answers, or null for a mode drawn by its
   * view alone. Named here and drawn in `components/questions/index.ts`, so
   * this file stays free of `.svelte` imports.
   */
  stem: StemId | null
  /**
   * How the question's picture shows: large with the name under it on the reveal, and while
   * a question picked from the list is open, `shadow` fills its outline with the theme's
   * `--silhouette`, `build` builds it up (`lib/pixelHunt.ts`) and `reveal` keeps it back.
   * Left out, as it is. Filled from the registry (`lib/modeRules.ts`), never in a mode's file.
   */
  picture?: 'shadow' | 'build' | 'reveal'
  /** Its options run to whole sentences: one button a row on a phone, on the reveal too. */
  stacked?: boolean
}

/**
 * The stems a mode can name. Five modes answer on the same four buttons, and this is
 * what keeps them from looking alike: Bestiary asks in a sentence, Drop Table shows an
 * item, Who Said That? a line in a chatbox. Each id is one component under
 * `components/questions/stems/`, and a new one lands with the first mode that needs it.
 */
export type StemId = 'text' | 'asset' | 'examine' | 'quote' | 'more_less' | 'price' | 'board'

// In its own module, so the mode files it presents import it without a cycle.
export { HOUSE }

/** What a mode this build does not know is presented with. It makes up no blurb. */
export const GENERIC_HOST: HostLines = {
  host: HOUSE,
  greeting: 'Welcome to the Jolly Boar Inn. Pull up a stool, this round is on the house.',
  ask: [
    "Here's one for the table.",
    'Next question, on the house.',
    'Have a think about this one.',
    'Set your mug down and have a look at this.',
  ],
  waiting: [
    'Waiting on the rest of the table.',
    "I'll top up the ales while the others finish.",
    'Another Wizard’s Mind Bomb while they think?',
    'No shouting the answer across the bar, now.',
  ],
  pace: {
    quick: [
      'Quick as a barmaid on a Friday night!',
      "Your answer's in before the foam settled on your pint.",
      'First at the bar! Now we wait on the slow drinkers.',
      'Straight in! Not even a sip of ale first.',
    ],
    middling: [
      'In at a comfortable pub pace.',
      'Not the first, not the last. Have a sip while we wait.',
      'A fair speed. Plenty of time to finish your pint.',
      'Answered with time to spare. The others are still nursing theirs.',
    ],
    late: [
      'Just in time! I nearly called last orders on you.',
      'Cutting it fine, friend, got that in just in time!',
      'Right before the bell! Just in time.',
      'Slid that across the bar just in time!',
    ],
    early: [
      "Barely a glimpse and you've called it!",
      'Answering that early takes nerve, or too much Asgarnian Ale.',
      'Early bird gets the first pint from the keg.',
      'You barely let me set the question down!',
    ],
    later: [
      'Took a good long look before putting your coins down.',
      'Measured twice, poured once. No harm in that.',
      'Waited until you could see the bottom of the glass.',
      'Better a slow answer than a spilled pint.',
    ],
  },
  reveal: [
    "Let's see how you did.",
    "Here's the answer.",
    'Pints down! The answer:',
    'What did the house have?',
  ],
  verdict: {
    right: [
      "Spot on. That one's on the house.",
      'Right you are! Pour this adventurer a pint.',
      'Correct! The whole table raises a glass to you.',
      'Bang on the money. You know your stuff.',
    ],
    partial: [
      'Close enough for a half pint.',
      'Not bad, you got the froth, if not the whole mug.',
      "Near the mark. I'll pour you a shandy.",
      'Halfway there. Worth a sip, at least.',
    ],
    wrong: [
      'Not this time, friend. Have a salted peanut.',
      'Ah, no. Drown your sorrows at the bar.',
      "Wrong, I'm afraid. Blame it on the Mind Bomb.",
      'Swing and a miss. Next round’s coming up.',
    ],
    missed: [
      'Too slow! Your ale went flat waiting for you.',
      'Asleep on your barstool? You missed the call.',
      'No answer? The whole table waited on you.',
      'Nothing from your corner of the booth that time.',
    ],
  },
}

/**
 * Every mode with a file under `modes/`, in the server's registry order (`schema/modes.json`),
 * then the ones still being built. Create and the lobby read `MODES` in this order, which
 * file names would not keep.
 */
export const MODE_IDS: readonly string[] = ALL_MODE_IDS

/** A mode still being built: its card on the create form, and who will host it. */
export interface UpcomingMode {
  id: string
  label: string
  hint: string
  host: string
}

/**
 * What one mode's file under `modes/` exports: its `mode`, or `upcoming` until it is built,
 * and whichever of the other forms and pages need copy of their own for it.
 */
export interface ModeFile {
  mode?: Mode
  upcoming?: UpcomingMode
  /** Example text for its forms' question and explanation fields (`lib/placeholders.ts`). */
  hints?: FieldHints
  /** How to play's Try a question (`lib/samples.ts`). */
  sample?: Sample
  /** How its ordering form names the ends (`lib/ordering.ts`). */
  ordering?: OrderingWording
  /** How the suggestion form names its fields (`lib/suggestions.ts`). */
  wording?: FormWording
  /** Its card on the suggestion form (`lib/suggestions.ts`), for a mode that takes suggestions. */
  card?: SuggestCard
}

/** How the suggestion form's card presents a mode, beyond what the registry says of it. */
export interface SuggestCard {
  /** Where the card stands among the question cards, smallest first. */
  place: number
  /** In place of the mode's own label, hint and host. */
  label?: string
  hint?: string
  host?: string
  /** The question a new one starts with, which the player may change. */
  prompt?: string
}

const files = import.meta.glob<ModeFile>('./modes/*.ts', { eager: true })

/** Each file under `modes/`, by its name, which is the mode's id. */
export const MODE_FILES: Readonly<Record<string, ModeFile>> = Object.fromEntries(
  Object.entries(files).map(([path, file]) => [path.replace(/^\.\/modes\/|\.ts$/g, ''), file]),
)

/** One export of every listed mode file that has it, by mode id, in `MODE_IDS` order. */
export function modeCopy<K extends keyof ModeFile>(
  key: K,
): Record<string, NonNullable<ModeFile[K]>> {
  const found: Record<string, NonNullable<ModeFile[K]>> = {}
  for (const id of MODE_IDS) {
    const value = MODE_FILES[id]?.[key]
    if (value !== undefined) found[id] = value as NonNullable<ModeFile[K]>
  }
  return found
}

/** Each built mode's copy, its picture as the registry has it shown. */
export const MODES: Record<string, Mode> = Object.fromEntries(
  Object.entries(modeCopy('mode')).map(([id, mode]) => {
    const rules = rulesOf(id)
    const picture = rules === undefined ? undefined : pictureOf(rules)
    return [id, picture === undefined ? mode : { ...mode, picture }]
  }),
)

/**
 * Modes still being built, shown on the create form faded and with nothing to press, their
 * host standing on the card as it will on the stage, so players can see who is coming. Copy
 * only: once a mode ships its file exports a full `mode` in place of `upcoming`, and
 * `/api/modes` lists it, and the form stops treating it as upcoming. A host here is never on
 * the random-event roster: that face means an interruption.
 */
export const UPCOMING_MODES: UpcomingMode[] = Object.values(modeCopy('upcoming'))

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

/**
 * Who presents mode `id`, and their lines: the house's generic ones for a mode this
 * build lacks, said by its host-to-be if it is one still being built.
 */
export function hostOf(id: string): HostLines {
  const mode = MODES[id]
  if (mode !== undefined) return mode
  const upcoming = UPCOMING_MODES.find((entry) => entry.id === id)
  if (upcoming === undefined) return GENERIC_HOST
  const name = upcoming.host.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase())
  return { ...GENERIC_HOST, host: { id: upcoming.host, name } }
}
