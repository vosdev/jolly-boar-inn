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
 * Every round is presented by an NPC, its host, and the host's lines are the mode's voice
 * (section 8 of ideas/design.md). Question prompts stay plain: they are read against the
 * clock, and a joke around them is a second thing to read.
 *
 * Plain TypeScript with no `.svelte` imports, so every screen can use it. The components
 * that *draw* a question live in `components/questions/index.ts` instead.
 */

import type { Scoring } from './protocol'

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

/** 0..n-1 in an order fixed by `seed`: a Fisher-Yates shuffle on a string hash. */
function shuffled(n: number, seed: string): number[] {
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
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
   * Left out, as it is.
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

/** The inn's own: the host's questions, and any round this build has no host for. */
export const HOUSE: Host = { id: 'house', name: 'The House' }

/** What a mode this build does not know is presented with. It makes up no blurb. */
export const GENERIC_HOST: HostLines = {
  host: HOUSE,
  greeting: 'Welcome to the Jolly Boar Inn. This round is on the house.',
  ask: [
    "Here's one for the table.",
    'Next question, on the house.',
    'Have a think about this one.',
  ],
  waiting: [
    'Waiting on the rest of the table.',
    'The others are still thinking.',
    'Another drink while they finish?',
  ],
  pace: {
    quick: [
      'Quick as a barmaid on a busy night!',
      "Fast! Your answer's in before the ale settled.",
      'That was quick. Now we wait on the slow drinkers.',
    ],
    middling: [
      'In at a steady pace. Now we wait.',
      'Not the first, not the last. Have a sip.',
      'A fair speed. The others are still thinking.',
    ],
    late: [
      'Just in time! Nearly called last orders on you.',
      'Cutting it fine, friend. Just in time!',
      'Just in time! The bell was about to ring.',
    ],
    early: [
      "Barely a glimpse and you've answered!",
      "Brave, answering that early. Let's see.",
      'Early bird gets the first pint.',
    ],
    later: [
      'You took a good long look. Fair enough.',
      'Waited for a clearer view, did you? Wise.',
      'Better late and sure, I always say.',
    ],
  },
  reveal: ["Let's see how you did.", "Here's the answer.", 'Right, the answer.'],
  verdict: {
    right: [
      "Spot on. That one's on the house.",
      'Right you are! Pour this one a pint.',
      'Correct! The whole table salutes you.',
    ],
    partial: [
      'Close enough for a half pint.',
      'Not bad. Most of the way there.',
      "Near enough. I'll pour you a half.",
    ],
    wrong: [
      'Not this time, friend.',
      'Ah, no. Drown your sorrows at the bar.',
      "Wrong, I'm afraid. Next round's coming.",
    ],
    missed: [
      'Too slow! Your drink went flat.',
      'No answer? The table waited for you.',
      'Nothing from you that time, friend.',
    ],
  },
}

export const MODES: Record<string, Mode> = {
  more_less: {
    id: 'more_less',
    label: 'More or Less',
    hint: 'A mix of Grand Exchange, High Alchemy and NPC prices.',
    host: { id: 'ali_morrisane', name: 'Ali Morrisane' },
    greeting: 'Ah, my friend! Come, come, see what Ali has on his stall today.',
    blurb: 'Two items, one question: which is worth more, or less? Ali is always honest. Mostly.',
    ask: [
      "Look closely, my friend. Ali's prices never lie.",
      'Two fine wares, one honest question.',
      'Come, compare! Ali hides nothing. Almost nothing.',
      'A bargain hunter like you knows this one.',
    ],
    waiting: [
      'Patience, my friend. A good trade is never rushed.',
      'Ali will wait. Ali is very good at waiting.',
      'While we wait, may I interest you in a magic carpet?',
      'No rush, no rush. The stall is not going anywhere.',
    ],
    pace: {
      quick: [
        'So fast! Ali has never seen such a quick trader.',
        'Quick as a desert wind, my friend!',
        'You decide fast. Ali likes a decisive customer.',
      ],
      middling: [
        'A considered choice. Ali respects that.',
        'Not too fast, not too slow. A wise trader.',
        'You weighed it well, my friend. Now we wait.',
      ],
      late: [
        'Just in time, my friend! The stall nearly closed.',
        'Ah, just in time! Ali was packing up.',
        'Just in time! Another moment and no deal.',
      ],
      early: [
        'You barely looked! Ali admires your nerve.',
        'So early! You trust your eye, my friend.',
        'An early bid! Bold, very bold.',
      ],
      later: [
        'You looked long and hard. Ali understands.',
        'A careful buyer waits for the full picture.',
        'You took your time. A wise merchant does.',
      ],
    },
    reveal: [
      'Who knows the value of things?',
      'Ali was right, of course.',
      'The scales do not lie.',
      'A fair price, my friend!',
    ],
    verdict: {
      right: [
        'A shrewd eye, my friend! Ali is impressed.',
        'Correct! You would make a fine merchant.',
        'Right! Ali could use a partner like you.',
      ],
      partial: [
        'Almost, my friend. Almost a bargain.',
        'Half right is still half a profit!',
        'Not bad! Ali gives you a small discount.',
      ],
      wrong: [
        'Ah, my friend, you have been swindled.',
        'Wrong! But Ali will still sell you a carpet.',
        'No, no. Ali weeps for your coin purse.',
      ],
      missed: [
        'No offer? Ali cannot haggle with silence.',
        'You said nothing! The deal walked away.',
        'Silence, my friend? That is no way to trade.',
      ],
    },
    // Which of the two costs more, on the scroll; the names are the buttons below it.
    stem: 'more_less',
  },
  price_is_right: {
    id: 'price_is_right',
    label: 'The Price is Right',
    hint: 'Test your Grand Exchange knowledge.',
    host: { id: 'grand_exchange_clerk', name: 'Grand Exchange Clerk' },
    greeting: 'Welcome to the Grand Exchange. How may I help you today?',
    blurb: 'One item, a range of prices. Slide to what it really trades for on the Exchange.',
    ask: [
      'What does this item go for on the Grand Exchange?',
      'What would this item fetch on the Grand Exchange?',
      "Please estimate this item's Grand Exchange price.",
      'What does this trade for on the Grand Exchange?',
    ],
    waiting: [
      'Your offer has been placed. Please wait while the market catches up.',
      'Your offer is being processed. Thank you for your patience.',
      'Please hold. The market is busy this evening.',
      'Offers are matched in the order received. Please wait.',
    ],
    pace: {
      quick: [
        'Your offer was placed promptly. Thank you.',
        'A swift offer. The market appreciates speed.',
        'Offer received in record time.',
      ],
      middling: [
        'Your offer has been placed. Please wait.',
        'Offer received at a standard pace.',
        'Your offer is in the queue. Thank you.',
      ],
      late: [
        'Your offer arrived just in time.',
        'Just in time. Your offer has been accepted.',
        'Offer received just in time, before closing.',
      ],
      early: [
        'An early offer. Please wait for the market.',
        'Your offer was placed early. Noted.',
        'Early offers are processed first. Thank you.',
      ],
      later: [
        'Your offer was placed after some deliberation.',
        'A late offer, but a valid one.',
        'Your offer has been received. Please wait.',
      ],
    },
    reveal: [
      'Your offer has completed.',
      'The market has spoken.',
      'Please collect your coins.',
      'Thank you for trading.',
    ],
    verdict: {
      right: [
        'Your offer was spot on. Congratulations.',
        'An excellent estimate. Thank you for trading.',
        'Your offer matched the market exactly.',
      ],
      partial: [
        'Your offer has partially completed.',
        'Close to market price. Well estimated.',
        'Your offer was near the mark.',
      ],
      wrong: [
        "I'm afraid your offer did not complete.",
        'That offer was far from market price.',
        'Your offer has been returned unfilled.',
      ],
      missed: [
        'No offer was placed. Please try again.',
        "Your offer slot is empty, I'm afraid.",
        'We received no offer from you.',
      ],
    },
    // The item and its picture, above a slider; what to do with them is the host's to say.
    stem: 'price',
  },
  guess_examine: {
    id: 'guess_examine',
    label: 'Guess the Examine',
    hint: 'Name the thing from the line you get when you examine it.',
    host: { id: 'examiner', name: 'The Examiner' },
    greeting: 'Pens down, eyes up. Your examination begins now.',
    blurb: 'I shall read you an examine line. Pick what it belongs to.',
    ask: [
      'What is this the examine of?',
      'Next question: what is this the examine of?',
      'Read it carefully. What is this the examine of?',
      'Name the thing this examine belongs to.',
    ],
    waiting: [
      'No talking while the others finish, please.',
      'Eyes on your own paper, please.',
      'Pens down when you are done. Others are still writing.',
      'I shall collect the papers shortly.',
    ],
    pace: {
      quick: [
        'Finished already? Check your work.',
        'Remarkably quick. Sit quietly, please.',
        'First paper in. Do not gloat.',
      ],
      middling: [
        'Handed in on time. Please wait in silence.',
        'A steady pace. Others are still writing.',
        'Paper received. Eyes front, please.',
      ],
      late: [
        'Just in time. I nearly called pens down.',
        'Just in time, by the skin of your teeth.',
        'Just in time. Do not make a habit of it.',
      ],
      early: [
        'An early answer. Confident, or reckless?',
        'Answered early. I shall mark it closely.',
        'You barely read the question. We shall see.',
      ],
      later: [
        'You took your time. Thoroughness is good.',
        'Answered late, but answered.',
        'A careful candidate. I shall note it.',
      ],
    },
    reveal: [
      'Let us mark your paper.',
      'Time is up. Papers, please.',
      'Let us see the answer key.',
      'The marking is done.',
    ],
    verdict: {
      right: [
        'Full marks. Well done.',
        'Correct. A credit to the class.',
        'Top marks. You may look smug.',
      ],
      partial: [
        'Partial marks. Show more working next time.',
        'Some credit, for some of it.',
        'Half marks. Not a pass, not a fail.',
      ],
      wrong: [
        'Incorrect. See me after class.',
        'Wrong. I shall note that in red ink.',
        "No marks for that, I'm afraid.",
      ],
      missed: [
        'A blank paper. How disappointing.',
        'You left it blank. No marks.',
        'Nothing written? Pens up sooner next time.',
      ],
    },
    // The examine line alone; the host asks what it belongs to.
    stem: 'examine',
  },
  sort_it_out: {
    id: 'sort_it_out',
    label: 'Sort It Out',
    hint: 'Are you a skiller or a slacker?',
    host: { id: 'historian_minas', name: 'Historian Minas' },
    greeting: 'Welcome to the Varrock Museum. Mind the display cases.',
    blurb:
      'I have muddled up my exhibits again. Put them back in order before the curator notices.',
    ask: [
      'Quickly, before the curator walks by!',
      'These exhibits are all out of order again.',
      'Help me put this display right, would you?',
      'Mind how you handle them. Some are very old.',
    ],
    waiting: [
      'Take your time. History is not going anywhere.',
      'I shall dust the cases while we wait.',
      'The curator is still in the other wing. For now.',
      'Some of these exhibits have waited centuries. A moment more is fine.',
    ],
    pace: {
      quick: [
        'My word, that was quick! Careful with them.',
        "Done already? You'd make a fine curator.",
        'Quick hands! I hope nothing got chipped.',
      ],
      middling: [
        'A steady hand. History rewards patience.',
        'Done at a museum pace. Very proper.',
        'Neatly done. Let us wait for the others.',
      ],
      late: [
        'Just in time! I heard the curator coming.',
        'Just in time! The doors were about to close.',
        'Phew, just in time! Not a moment to spare.',
      ],
      early: [
        'Sorted before the dust settled! Remarkable.',
        'So early! You must know your history.',
        "An early answer! I hope you're right.",
      ],
      later: [
        'You studied them closely. Very scholarly.',
        'A thorough look before deciding. Good.',
        'Late, but a historian is never rushed.',
      ],
    },
    reveal: [
      'Let us check the records.',
      'Back in their proper places.',
      'The archives agree.',
      'Now for the right order.',
    ],
    verdict: {
      right: [
        'Perfect! The curator will never know.',
        'Every exhibit in its place. Splendid!',
        'Exactly right! You have an eye for history.',
      ],
      partial: [
        'Mostly right. I shall fix the rest myself.',
        'Close! Only a few out of place.',
        'Nearly there. Good enough for a quiet day.',
      ],
      wrong: [
        'Oh dear. The curator will have my head.',
        "That order is entirely wrong, I'm afraid.",
        "Hmm. Even I don't muddle them that badly.",
      ],
      missed: [
        "You didn't touch a thing! Still muddled.",
        'Nothing moved? The display stays a mess.',
        'No answer? The exhibits gather dust.',
      ],
    },
    // Each question says what it sorts by; the entries below it are only what gets sorted.
    stem: 'text',
  },
  who_said_that: {
    id: 'who_said_that',
    label: 'Who Said That?',
    hint: 'Name the character behind the line.',
    host: { id: 'cracked_jennys_tea_cup', name: "Cracked Jenny's Tea Cup" },
    greeting: 'Squawk! Who said that? Who said that?',
    blurb: 'I repeat everything I hear. Tell me who said it first.',
    ask: [
      'Squawk! Who said it? Who said it?',
      'Polly heard this! Who said it first?',
      'Squawk! Somebody said this! Who?',
      'Polly repeats! Polly repeats! Who said it?',
    ],
    waiting: [
      'Pretty Polly waits. Pretty Polly waits.',
      'Squawk! Waiting! Waiting!',
      'Polly wants a cracker. Polly wants an answer.',
      'Squawk! Hurry up, hurry up!',
    ],
    pace: {
      quick: [
        'Squawk! Fast! Fast!',
        'Quick! Quick! Polly impressed!',
        'Squawk! Speedy bird! Speedy bird!',
      ],
      middling: [
        'Squawk! Answer in! Answer in!',
        'Polly heard you. Polly waits.',
        'Not fast, not slow! Squawk!',
      ],
      late: [
        'Squawk! Just in time! Just in time!',
        'Phew! Just in time! Squawk!',
        'Just in time! Polly almost napped!',
      ],
      early: [
        'Squawk! So early! So early!',
        'Early bird! Early bird!',
        'Polly barely spoke! Squawk!',
      ],
      later: [
        'Squawk! Took your time! Took your time!',
        'Slow bird! Slow bird!',
        'Squawk! Finally! Finally!',
      ],
    },
    reveal: [
      'Squawk! The answer!',
      'Squawk! Polly knew it!',
      'Who said it? This one!',
      'Pieces of eight! Squawk!',
    ],
    verdict: {
      right: [
        'Squawk! Right! Polly gives you a cracker!',
        'Clever! Clever! Squawk!',
        'Squawk! You knew it! You knew it!',
      ],
      partial: [
        'Squawk! Nearly! Nearly!',
        'Half a cracker! Squawk!',
        'Close! Close! Polly almost proud!',
      ],
      wrong: [
        'Squawk! Wrong! Wrong!',
        'Polly knows better! Squawk!',
        'No cracker for you! Squawk!',
      ],
      missed: [
        'Squawk! Cat got your tongue?',
        'Nothing? Polly heard nothing!',
        'Squawk! Say something! Say something!',
      ],
    },
    stem: 'quote',
  },
  know_your_content_creator: {
    id: 'know_your_content_creator',
    label: 'Know Your Content Creator',
    hint: 'Are you sure you are a fan?',
    host: { id: 'gnome_child', name: 'Gnome child' },
    greeting: 'Do you ever think about what it means to watch someone else play?',
    blurb: 'Streamers say things, and things are said about streamers. Show me what you know.',
    ask: [
      'But do you really know them?',
      'Is a streamer real if nobody watches?',
      'Think about it. Then think about it again.',
      'We are all content. Some of us create it.',
    ],
    waiting: [
      'Time is a construct. So is waiting.',
      'Do the others think, or do they only answer?',
      'I have been here forever. A little longer is fine.',
      'Waiting is just watching with nothing to watch.',
    ],
    pace: {
      quick: [
        'So fast. Did you even think about it?',
        'Quick. Some people just know things.',
        'You answered before the thought finished.',
      ],
      middling: [
        'Not fast, not slow. Just there.',
        'An answer at the speed of thought.',
        'You took exactly as long as you took.',
      ],
      late: [
        'Just in time. Or was time just in you?',
        'Just in time. Time was always on your side.',
        'Just in time. Does time even exist?',
      ],
      early: [
        'You answered before you saw. Interesting.',
        'Early. Do you see the future?',
        'So soon. Perhaps you always knew.',
      ],
      later: [
        'You waited to see more. So do we all.',
        'Later is just now, but further away.',
        'You took your time. Time took you too.',
      ],
    },
    reveal: [
      'Now you know. Or always knew.',
      'The truth was always there.',
      'Was it ever really a question?',
      'Knowledge is a stream.',
    ],
    verdict: {
      right: [
        'You knew. Perhaps you always knew.',
        'Correct. But what is correct, really?',
        'Right. The stream flows through you.',
      ],
      partial: [
        'Partly right. Like most things.',
        'Some of it was true. Some of it always is.',
        'Half known is still half known.',
      ],
      wrong: [
        "Wrong. But aren't we all, sometimes?",
        'That was not it. Nothing ever is.',
        "Wrong. It's fine. It's all content.",
      ],
      missed: [
        'You said nothing. That says a lot.',
        'Silence is also an answer. Not this one.',
        'No answer. Were you even watching?',
      ],
    },
    // Quotes and plain trivia share the round; the stem tells them apart by `quote`.
    stem: 'quote',
  },
  bestiary: {
    id: 'bestiary',
    label: 'Bestiary',
    hint: 'Combat levels, looks and haunts of the monsters.',
    host: { id: 'zoo_keeper', name: 'Zoo keeper' },
    greeting: 'Welcome to the zoo! Mind the bars, some of these bite.',
    blurb: 'Every beast in Gielinor has a page in my book. Tell me what you know about them.',
    ask: [
      "Here's one from my book. Do you know it?",
      'Careful, this one bites. What do you know?',
      "Every beast has a page. Let's read this one.",
      'Step up to the enclosure and have a look.',
    ],
    waiting: [
      'Feeding time. Back in a moment.',
      'Hold on, one of the penguins has got out again.',
      'Keep your hands outside the bars while we wait.',
      "The monkeys are restless. Won't be long.",
    ],
    pace: {
      quick: [
        'Quick! Faster than a startled chinchompa.',
        'That was fast! You know your beasts.',
        "Speedy! You'd catch the penguins in no time.",
      ],
      middling: [
        'A steady pace. Like a tortoise, but quicker.',
        'In at a fair trot. Now we wait.',
        'Not bad. The cows take longer.',
      ],
      late: [
        'Just in time! The gates were closing.',
        'Just in time! Feeding time nearly started.',
        'Just in time, before the monkeys got it.',
      ],
      early: [
        'Early! You barely saw the beast.',
        'Answered early! Brave keeper.',
        'So early! You know your book well.',
      ],
      later: [
        'You had a long look at that one. Fair.',
        'Waited for a better view. Smart.',
        'Took your time. That one does bite.',
      ],
    },
    reveal: [
      "Let's check the plaque.",
      'Says so right here in my book.',
      "That's the one on the sign.",
      'Back in its pen, that one.',
    ],
    verdict: {
      right: [
        "Spot on! You'd make a fine keeper.",
        'Right! Have a fish for the penguins.',
        "Correct! That one's on the plaque.",
      ],
      partial: [
        "Close! You've got half the plaque right.",
        'Nearly. Mind the bars next time.',
        "Not bad. Some of that's in my book.",
      ],
      wrong: [
        "No, no. That one would've bitten you.",
        'Wrong! Back to the gift shop with you.',
        'Not even close. The monkeys knew that one.',
      ],
      missed: [
        'No answer? Too busy feeding the ducks?',
        "You missed it! Feeding time's over.",
        'Nothing from you. Lost in the reptile house?',
      ],
    },
    // Every question names its monster in the sentence, whatever answers it below.
    stem: 'text',
  },
  drop_table: {
    id: 'drop_table',
    label: 'Drop Table',
    hint: 'Ironmen should know this.',
    host: { id: 'nieve', name: 'Nieve' },
    greeting: 'Got a task for you. Not a kill, a question.',
    blurb: 'Your task: know the loot. Who drops it, what they drop, and how rarely.',
    ask: [
      'Your next task. Know your loot.',
      "Here's an easy one. Or is it?",
      'Every slayer should know this one.',
      'Think before you answer. Like before you attack.',
    ],
    waiting: [
      'Patience. Good drops take time.',
      'Still hunting? I can wait.',
      'Took me a hundred kills to see that one. Take your time.',
      'Rare drops come to those who wait.',
    ],
    pace: {
      quick: [
        "Fast. That's a quick kill.",
        'Quick answer. Good reflexes.',
        "Speedy. You'd be great at bossing.",
      ],
      middling: [
        'Steady pace. Like a good slayer trip.',
        "Answer's in. Now we wait for the loot.",
        'A fair speed. Nothing wrong with that.',
      ],
      late: [
        'Just in time. That was nearly a wipe.',
        'Just in time. Cutting it close.',
        'Just in time. Eat food sooner next time.',
      ],
      early: [
        "Early. You didn't need to see more.",
        'Answered early. Confident.',
        "Barely saw it and you've called it.",
      ],
      later: [
        'Waited to see more. Safe play.',
        'Took a while. Better safe than dead.',
        'A slow kill, but a kill.',
      ],
    },
    reveal: [
      'The loot is on the floor.',
      'Check your loot.',
      'Did you get the drop?',
      'Task complete.',
    ],
    verdict: {
      right: [
        'Task complete. Nice work.',
        "Right. You'd make a decent slayer.",
        "Correct. That's a clean kill.",
      ],
      partial: [
        'Partly right. Count it as an assist.',
        'Close. Finish the job next time.',
        'Some of it. Not a bad trip.',
      ],
      wrong: [
        "Wrong. That's a death in the Wilderness.",
        'No. Back to Turael for you.',
        'Missed. Check your slayer helmet.',
      ],
      missed: [
        'No answer? You let the task run off.',
        'You froze. That gets slayers killed.',
        'Nothing? Your task timed out.',
      ],
    },
    // The prompt still names the item or the monster: a question whose picture is
    // missing has to read without it.
    stem: 'text',
  },
  odd_one_out: {
    id: 'odd_one_out',
    label: 'Odd One Out',
    hint: 'All alike but one. Spot the odd one out.',
    host: { id: 'dunce', name: 'Dunce' },
    greeting: "I'm in the corner for getting it wrong. Let's see if you do better.",
    blurb:
      "Most of these belong together. One does not. Find it before I'm sent back to the corner.",
    ask: [
      "One of these is like me. It doesn't fit.",
      "Find the one that doesn't belong.",
      'I picked the wrong one last time. Your turn.',
      'Something here should be in the corner with me.',
    ],
    waiting: [
      "Take your time. Nobody's making me stand here for it.",
      "I'll just stand here. In my corner.",
      "Don't look at me, I always get these wrong.",
      "I'm counting the bricks. There are a lot of bricks.",
    ],
    pace: {
      quick: [
        "Wow, so quick! I'm still reading them.",
        "Fast! I'd still be counting on my fingers.",
        'That was quick. Show-off.',
      ],
      middling: [
        'Not bad. Quicker than me, anyway.',
        'In at a normal speed. Normal people speed.',
        'A fair pace. Better than my usual.',
      ],
      late: [
        "Just in time! That's what I usually do.",
        'Phew, just in time! I nearly panicked for you.',
        'Just in time! I know that feeling well.',
      ],
      early: [
        "So early! I hadn't even looked yet.",
        'Early! Are you sure? I never am.',
        'You answered early. Very brave.',
      ],
      later: [
        'You took a long look. Me too, always.',
        "Took your time. Can't rush these.",
        'Late, like me in the mornings.',
      ],
    },
    reveal: [
      "Told you it didn't fit.",
      'That one goes in the corner.',
      "Even I'd have got that.",
      'The odd one, out!',
    ],
    verdict: {
      right: [
        'You got it! Can I sit next to you?',
        "Right! You'll never end up in my corner.",
        'Correct. I wish I was clever like you.',
      ],
      partial: [
        "Half right. That's more than I ever get.",
        'Almost! Only half a corner for you.',
        "Some of it! Don't tell the teacher.",
      ],
      wrong: [
        'Wrong! Come join me in the corner.',
        "That's the kind of answer I give.",
        "Oops. There's room in my corner.",
      ],
      missed: [
        "No answer? Smart. Can't be wrong that way.",
        'You said nothing. I should try that.',
        "Nothing? They'll put you in the corner anyway.",
      ],
    },
    // The question is the same line each time; the names below it are all there is to read.
    stem: 'text',
  },
  minigame_madness: {
    id: 'minigame_madness',
    label: 'Minigame Madness',
    hint: 'Every lobby in Gielinor, from Castle Wars to Tempoross.',
    host: { id: 'lanthus', name: 'Lanthus' },
    greeting:
      "Are you team Castle Wars, Barbarian Assault or Pest Control? It doesn't matter tonight. Everyone's on the quiz team!",
    blurb:
      "I've watched every lobby in Gielinor fill up. Prizes, points, places: tell me what you know.",
    ask: [
      "Next round's starting! Ready?",
      'The portal is open. Answer this!',
      "Saradomin or Zamorak, you'll want to know this.",
      'Grab your tickets and have a go.',
    ],
    waiting: [
      'Waiting for enough players. As always.',
      "The next game starts when everyone's in.",
      'Still waiting on the other team.',
      'Grab a bandage while you wait.',
    ],
    pace: {
      quick: [
        'Quick off the mark! First through the portal!',
        "Fast! You'd win any race at Agility Arena.",
        'Speedy! First in the lobby!',
      ],
      middling: [
        'In with the main pack. Steady play.',
        "Answer's in at a fair pace.",
        'Middle of the pack. Respectable.',
      ],
      late: [
        'Just in time! The portal was closing.',
        'Just in time! You nearly missed the round.',
        'Just in time! Right before the whistle.',
      ],
      early: [
        'Early start! Bold strategy.',
        "First move! Let's see if it pays off.",
        'Answered early! Confident play.',
      ],
      later: [
        'Waited for the right moment. Tactical.',
        'Took your time. Patience wins games.',
        'A late play, but still in the game.',
      ],
    },
    reveal: [
      'The game has ended! Who won?',
      'Tickets are on the way.',
      "Time's up! Flags down!",
      "Let's see the scoreboard.",
    ],
    verdict: {
      right: [
        'Victory! Collect your tickets.',
        'Your team wins! Well played.',
        "Right! That's a win for your side.",
      ],
      partial: [
        'A draw! Some tickets for your trouble.',
        'Close game! Have a few tickets.',
        'Not a win, not a loss. A few tickets.',
      ],
      wrong: [
        'Defeat! Better luck next game.',
        'Your team loses this one.',
        'Wrong! The other team takes the flag.',
      ],
      missed: [
        'You never left the waiting room!',
        'AFK? No tickets for idlers.',
        "You didn't join the game. No reward.",
      ],
    },
    // A pictured item's question still names it: the prompt has to read without the picture.
    stem: 'text',
  },
  whos_that_npc: {
    id: 'whos_that_npc',
    label: 'Who is That NPC?',
    hint: "It's Elvarg!",
    host: { id: 'postie_pete', name: 'Postie Pete' },
    greeting: 'Parcel for you! No name on it, mind. Only a shadow.',
    blurb:
      "Everyone in Gielinor gets post from me. I'll show you a shadow; you tell me who it's for.",
    ask: [
      "Parcel for you! Who's this one for?",
      'No name on this one. Only a shadow.',
      "Here's a shadow. Who's it addressed to?",
      'Special delivery! Whose shadow is this?',
    ],
    waiting: [
      'Hold on, still sorting the post.',
      "One more sack to go through, won't be long.",
      'Keep your eyes peeled for the postman.',
      'Lost a letter down the well. Back in a tick.',
    ],
    pace: {
      quick: [
        'Quick! Faster than a teleport tab.',
        "That was fast! You'd make a fine postie.",
        'Speedy delivery! I like it.',
      ],
      middling: [
        'Steady pace. Like my rounds.',
        'In at a fair speed. Now we wait.',
        'Got it at a nice walking pace.',
      ],
      late: [
        'Just in time! The mail coach was leaving.',
        'Just in time! Last post of the day.',
        'Just in time! I was about to give up.',
      ],
      early: [
        "Barely a shadow and you've got it!",
        'So early! You know your neighbours.',
        'Answered early! Sharp eyes.',
      ],
      later: [
        'Needed a closer look? Fair enough.',
        'Waited for more of the shadow. Wise.',
        'Took your time. Better than lost post.',
      ],
    },
    reveal: [
      'Signed, sealed, delivered.',
      'Delivered! Right on time.',
      "Here's the name on the label.",
      'Got the address now.',
    ],
    verdict: {
      right: [
        'Right address! Delivered first time.',
        'Spot on! You know everyone in Gielinor.',
        "That's the one! Signed for.",
      ],
      partial: [
        'Close! Right street, wrong door.',
        'Nearly! Almost the right address.',
        "Half right. I'll find the rest.",
      ],
      wrong: [
        'Wrong address! Return to sender.',
        "No, that's somebody else's post.",
        "Not them! This one's going back.",
      ],
      missed: [
        "Nobody home? I'll leave a card.",
        'No answer at the door. Typical.',
        "Couldn't get a signature from you.",
      ],
    },
    // The prompt is the same line every time, which the host's ask line says; the picture
    // alone is the question.
    stem: null,
    picture: 'shadow',
  },
  pixel_hunt: {
    id: 'pixel_hunt',
    label: 'Pixel Hunt',
    hint: 'How fast can you recognize the item?',
    host: { id: 'sherlock', name: 'Sherlock' },
    greeting: 'Elementary! Every item leaves a clue, if you look closely.',
    blurb:
      "I'll show you an item, a little at a time. Name it from the list before the picture gives it away.",
    ask: [
      'Look closely. What item is this?',
      'A clue is forming. Name the item.',
      "Here's a fresh piece of evidence.",
      'What do you deduce from this one?',
    ],
    waiting: [
      'The others are still examining the evidence.',
      'Patience. Not everyone has cracked it yet.',
      'The trail has gone cold for some of them.',
      'Still deducing, the rest of them.',
    ],
    pace: {
      quick: [
        'Quick! A sharp eye for detail.',
        'Swift work. Not a clue wasted.',
        "Fast! You'd make a fine detective.",
      ],
      middling: [
        'A steady deduction. Well reasoned.',
        'In at a fair pace. Now we wait.',
        'Careful work, neither rushed nor slow.',
      ],
      late: [
        'Just in time! The case nearly closed.',
        'Just in time! You cut it fine, my friend.',
        'Just in time! The trail was going cold.',
      ],
      early: [
        'From a few pixels? Remarkable!',
        'Named before the picture came clear. Elementary!',
        'You spotted it early. Impressive.',
      ],
      later: [
        'Waited for more clues? Prudent.',
        'A closer look never hurt a case.',
        'More evidence, more certainty. Wise.',
      ],
    },
    reveal: [
      'The case is solved.',
      "Here's the culprit.",
      'Elementary, all along.',
      'The evidence, revealed.',
    ],
    verdict: {
      right: [
        'Correct! Elementary, my friend.',
        'Case closed. Well deduced!',
        'Right! Not a detail escaped you.',
      ],
      partial: [
        'Partly right. Keep investigating.',
        "Close, but the case isn't closed.",
        'Some of it, not all. Look again.',
      ],
      wrong: [
        'Wrong item! A false lead.',
        'Not that one. The clues misled you.',
        'A red herring caught you out.',
      ],
      missed: [
        'No answer? The trail went cold.',
        'You let this case slip away.',
        'No guess at all? Even a hunch helps.',
      ],
    },
    // The prompt is the same line every time, which the host's ask line says; the picture
    // alone is the question.
    stem: null,
    picture: 'build',
  },
  forgetful_bard: {
    id: 'forgetful_bard',
    label: 'The Forgetful Bard',
    hint: "He's forgotten what this one was about. Help him out.",
    host: { id: 'falo', name: 'Falo the Bard' },
    greeting: 'Ah, a crowd! I know the song, but not what it is about.',
    blurb:
      "I'll sing you a verse about an item, if only I could recall which. Find it on the list for me.",
    ask: [
      'Listen well. What was this song about?',
      'Hum along. Which item is this verse about?',
      'It was on the tip of my tongue. Which item?',
      'A new verse! What was it about again?',
    ],
    waiting: [
      'Still humming, the rest of them.',
      'Hold that note. Others are still thinking.',
      "I'd sing something, but I've forgotten the words.",
      'Let me tune my lyre while they think.',
    ],
    pace: {
      quick: [
        'Quick! Before the last note faded.',
        'Fast! You knew it by the first line.',
        'Swift! A better memory than mine.',
      ],
      middling: [
        'In on the beat. Now we wait.',
        'A steady tempo. I like it.',
        'Neither rushed nor late. Nicely sung.',
      ],
      late: [
        'Just in time! On the very last note.',
        'Just in time! The song was nearly done.',
        'Just in time! I was losing the tune.',
      ],
      early: [
        'Before the chorus? Impressive!',
        'Named it on the first note!',
        'So early! Do you know this song?',
      ],
      later: [
        'Waited for the chorus? Fair enough.',
        'Listened to the end. Very polite.',
        'Took your time. Good songs deserve it.',
      ],
    },
    reveal: [
      'Ah yes, now I remember!',
      'It all comes back to me now.',
      'Of course! How could I forget?',
      'Now the song makes sense.',
    ],
    verdict: {
      right: [
        'Yes! That was it! What a memory.',
        'Right! I shall write that down.',
        'That is the one! My thanks, friend.',
      ],
      partial: [
        'Close! Almost the right song.',
        'Nearly! Same tune, wrong verse.',
        'Half right. I remember half, too.',
      ],
      wrong: [
        'No, that rhymes with nothing!',
        'Wrong verse! Even I know that.',
        'Not that one. Now I am confused.',
      ],
      missed: [
        'No answer? Now we have both forgotten.',
        'Silence? Nobody likes that in a song.',
        'Not a word? Even I can do better.',
      ],
    },
    stem: 'text',
    // The verse is the question; the picture would be its answer.
    picture: 'reveal',
  },
  scaperune: {
    id: 'scaperune',
    label: 'ScapeRune',
    hint: 'Welcome to the opposite of Gielinor.',
    host: { id: 'mr_mordaut', name: 'Mr. Mordaut' },
    greeting: 'Welcome to ScapeRune.',
    blurb:
      'Fish come cooked and go in the uncooking pot, and exams start with the answer. Find the question. Sit down.',
    // No splash in the Daily, so each of these has to say what to do on its own.
    ask: [
      'Here is the answer. What is the question?',
      'Which question goes with this answer?',
      'The answer comes first. Find its question.',
      'Here is the answer. Find the question.',
    ],
    waiting: [
      'Eyes on your own paper.',
      'The rat finished ages ago.',
      'Do not eat your classmates.',
      'Quiet, please. Still reading.',
    ],
    pace: {
      quick: [
        'Done already? Hand it in.',
        'Quick. Did you read all four?',
        'Early. The rat would approve.',
      ],
      middling: ['On time. As expected.', 'Handed in. Now we wait.', 'Neither early nor late.'],
      late: [
        'Just in time! The bell nearly rang.',
        'Just in time! Pens were going down.',
        'Just in time! I was collecting papers.',
      ],
      early: [
        'Before the chalk dried? Well.',
        'Already? Sit down, then.',
        'So early! Did you see this paper?',
      ],
      later: [
        'Read every word. Good.',
        'Took your time. Exams are long.',
        'Read it twice? Sensible.',
      ],
    },
    reveal: [
      'Time. Papers down.',
      'Let us mark these.',
      'The question was this one.',
      'Here is the mark scheme.',
    ],
    verdict: {
      right: [
        'Correct. Next answer.',
        'Wonderful! Next answer.',
        'A pupil using their brains, finally.',
      ],
      partial: [
        'Half marks. Show your working.',
        'Partly right. See me after class.',
        'Half a mark. Hit the books.',
      ],
      wrong: ["That's WRONG.", 'No, no, no. Next answer.', 'Is that how they do it in Gielinor?'],
      missed: [
        'A blank paper. Hit the books.',
        'Nothing? Even the dunce wrote something.',
        'No answer? You failed, naturally.',
      ],
    },
    stem: 'board',
    stacked: true,
  },
  // Only on a server that switched it on, for testing the NPCs' questions in a row.
  tales_of_gielinor: {
    id: 'tales_of_gielinor',
    label: 'Tales of Gielinor',
    hint: 'Quests, lore and the tales of Gielinor.',
    host: { id: 'wise_old_man', name: 'Wise Old Man' },
    greeting: 'Sit down, sit down. I have stories older than this inn.',
    blurb:
      "I have walked every road in Gielinor, and most of them twice. Let's see what you remember.",
    ask: [
      'Sit still and tell me this.',
      'Now, where was I? Ah, yes.',
      'Here is one from my travels.',
      'An old tale. Do you know how it goes?',
    ],
    waiting: [
      'I have waited out whole ages. I can wait for this.',
      'Let me find my glasses while we wait.',
      'This is slower than robbing Draynor Bank.',
      'I may have dozed off. Has everyone answered?',
    ],
    pace: {
      quick: [
        'Quick! Not even I robbed that bank so fast.',
        'Fast! You have read your quest journal.',
        'Quick! You must have lived through it yourself.',
      ],
      middling: [
        'At a fair walking pace. No need to run.',
        'Steady. A sensible adventurer, this one.',
        'Neither hasty nor late. I approve.',
      ],
      late: [
        'Just in time! The tale was nearly over.',
        'Just in time, before I forgot the question.',
        'Just in time, like any good hero.',
      ],
      early: [
        'Early! You barely let me finish the tale.',
        'Answered early! Youth, always in a hurry.',
        'So early! Did you skip the dialogue?',
      ],
      later: [
        'You took your time. A wise choice.',
        'Waited for more of the tale. Smart.',
        'Patient. You will live to my age yet.',
      ],
    },
    reveal: [
      'Here is how it really goes.',
      'Check your quest journal.',
      'I was there, you know.',
      'It is all in the old books.',
    ],
    verdict: {
      right: [
        'Well remembered. There is hope for you yet.',
        'Right! You have earned a quest point.',
        'Correct! I could not have told it better.',
      ],
      partial: [
        'Close. You only skipped some of the dialogue.',
        'Part of the tale, but not all of it.',
        'Nearly. You missed a chapter or two.',
      ],
      wrong: [
        'Hmm. Perhaps read your quest journal next time.',
        'No, no. That is not how the tale goes.',
        'Wrong! In my day, we read the dialogue.',
      ],
      missed: [
        'No answer? Have you nodded off?',
        'Nothing? I thought I was the old one here.',
        'You missed it. The tale went on without you.',
      ],
    },
    stem: 'text',
  },
  uris_unravelling: {
    id: 'uris_unravelling',
    label: 'Uri’s Unravelling',
    hint: 'Solve the clue without the help of a blinking yellow arrow.',
    host: { id: 'uri', name: 'Uri' },
    greeting: 'Comrade. The goose flies south at noon. Do not ask which goose.',
    blurb: 'No yellow arrow here, comrade. Only the clue, your wits and a man who was never here.',
    ask: [
      'Comrade. Unravel this.',
      'The goose has landed. Unravel this.',
      'Read it once, then unravel it.',
      'Quietly now. Unravel this one.',
    ],
    waiting: [
      'The walrus sleeps. We wait.',
      'I have stood in worse places, in stranger hats.',
      'Patience. Even a spoon bends slowly.',
      'My briefcase grows heavy. Do hurry.',
    ],
    pace: {
      quick: [
        'Quick! The arrow blinked for nobody.',
        'Fast, comrade. Were you followed?',
        'Quick! Even the agent is impressed.',
      ],
      middling: [
        'A measured pace. Nobody saw a thing.',
        'Steady. That is how one crosses a bridge at dusk.',
        'Neither early nor late, like the eels.',
      ],
      late: [
        'Just in time! The message was burning.',
        'Just in time, comrade. The bag was closing.',
        'Just in time. I saw nothing.',
      ],
      early: [
        'Early! You did not wait for the emote.',
        'So early! The briefcase is still shut.',
        'Answered early! Someone has done their reading.',
      ],
      later: [
        'You took your time. Nobody was watching.',
        'You waited it out. Wise, comrade.',
        'Slowly, as the milk drifts north.',
      ],
    },
    reveal: [
      'The briefcase opens.',
      'Now the clue unravels.',
      'Read it, then eat it.',
      'Here is what the scroll meant.',
    ],
    verdict: {
      right: [
        'Correct, comrade. You were never here.',
        'Right! The walrus approves.',
        'Solved, and no arrow in sight.',
      ],
      partial: [
        'Half a clue. The other half is in the well.',
        'Partly. You stopped one step short.',
        'Close, comrade. Keep digging.',
      ],
      wrong: [
        'No. You have dug in the wrong place.',
        'Wrong! Even a blinking arrow would be ashamed.',
        'No, comrade. Burn that answer.',
      ],
      missed: [
        'Nothing? The double agent got to you.',
        'No answer. Very discreet.',
        'Silence. Well trained, but no answer.',
      ],
    },
    stem: 'quote',
  },
  slayer_master: {
    id: 'slayer_master',
    label: 'Slayer Master',
    hint: 'Weaknesses, tasks and how to bring down the beasts.',
    host: { id: 'konar_quo_maten', name: 'Konar quo Maten' },
    greeting: 'Sit, slayer. There is balance to be brought.',
    blurb: 'Every beast has its place and its weakness. Name them, and bring balance to Gielinor.',
    ask: [
      'Answer me this, and bring balance.',
      'A slayer must know this.',
      'Know your task. Tell me.',
      'Balance asks this of you.',
    ],
    waiting: [
      'Balance is patient. So am I.',
      'The volcano can wait. Can your task?',
      'Weigh it well, slayer.',
      'All tasks end. So will this silence.',
    ],
    pace: {
      quick: [
        'Quick! A clean kill.',
        'So fast. The beast never saw you.',
        'Quick! Balance is pleased.',
      ],
      middling: [
        'A steady hand. Balance holds.',
        'Neither hasty nor slow. As it should be.',
        'A measured strike, slayer.',
      ],
      late: [
        'Just in time! The task nearly slipped.',
        'Just in time. Balance wavered.',
        'Just in time, slayer.',
      ],
      early: [
        'Early! You came well prepared.',
        'So early! You knew your task.',
        'Answered early! A true slayer.',
      ],
      later: [
        'You took your time. The beast did not mind.',
        'Slowly, then. Even the volcano stirs faster.',
        'You waited it out, slayer.',
      ],
    },
    reveal: [
      'Now see the balance.',
      'See what the task asked.',
      'The beast gives up its secret.',
      'Look, and remember it.',
    ],
    verdict: {
      right: [
        'Correct. Balance is restored.',
        'Right! A task well done.',
        'Yes. You bring balance, slayer.',
      ],
      partial: [
        'Half a task is no task. Yet it is something.',
        'Partly. The scales still tip.',
        'Close, slayer. Finish the job.',
      ],
      wrong: [
        'No. The scales tip further.',
        'Wrong! The beast still lives.',
        'No, slayer. Return to your studies.',
      ],
      missed: [
        'Nothing? Your task goes unfinished.',
        'Silence brings no balance.',
        'No answer. The beast walks free.',
      ],
    },
    stem: 'text',
  },
  random_events_only: {
    id: 'random_events_only',
    label: 'Random Events Only',
    hint: 'Nothing but random NPCs turning up with random questions.',
    host: { id: 'crowned_frog', name: 'The Frog' },
    greeting: 'The whole road has come in tonight, and every one of them wants a word.',
    blurb: 'One visitor after another, each with a question. Answer them all.',
    ask: [
      'Another visitor, another question.',
      "Who's at the door this time?",
      'One more from the road. Listen well.',
    ],
    waiting: [
      'Another visitor will be along shortly.',
      'Hold still. Someone else is coming up the road.',
      'The door will open again in a moment.',
    ],
    pace: {
      quick: [
        'Quick! Our guest is impressed.',
        "Fast as a frog's tongue!",
        'So speedy. The visitor barely blinked.',
      ],
      middling: [
        'A fair pace. Our guest nods politely.',
        'Answered in good time.',
        'Not too quick, not too slow. Royal.',
      ],
      late: [
        'Just in time! The visitor was leaving.',
        'Just in time! The door nearly shut.',
        'Just in time! Our guest was getting cross.',
      ],
      early: [
        'So early! Our guest had barely spoken.',
        'Answered early! Bold.',
        'Early! You know this visitor well.',
      ],
      later: [
        'You let them finish. Good manners.',
        'Took your time. Our guest waited.',
        'A patient answer. The visitor likes that.',
      ],
    },
    reveal: ['And off they go.', 'Back on the road with them.', 'Next visitor, please.'],
    verdict: {
      right: [
        'Well answered. The visitor is pleased.',
        "Right! They'll speak well of you on the road.",
        'Correct. A royal nod for you.',
      ],
      partial: [
        "Half an answer. They'll take it.",
        'Close. The visitor shrugs and moves on.',
        'Partly right. Good enough for the road.',
      ],
      wrong: [
        "Wrong. They'll tell the whole road.",
        'Not quite. The visitor frowns.',
        "Wrong! Lucky I don't turn you into a frog.",
      ],
      missed: [
        'You ignored our guest. How rude.',
        'No answer? The visitor wandered off.',
        'Silence. The road remembers that.',
      ],
    },
    stem: 'text',
  },
  // Never offered as a round: the host's questions are random events inside other rounds.
  // It is here for the stem those questions are drawn with, and for the splash of a room
  // created when custom questions were a round of their own, and still plays them as one.
  custom: {
    id: 'custom',
    label: "Host's Questions",
    hint: 'Questions the host wrote for this room.',
    host: HOUSE,
    greeting: 'Pull up a stool. The house has a few questions of its own.',
    blurb: 'Your host wrote these ones behind my bar. Whatever they ask, answer it.',
    ask: [
      'Your host wrote this one. Have a go.',
      'One of the house specials.',
      "Straight from the host's own notes.",
    ],
    waiting: [
      'Another drink while we wait?',
      "I'll wipe down the bar while the others finish.",
      "The table's still thinking. More ale?",
    ],
    pace: {
      quick: [
        'Quick! Your host will be impressed.',
        'Fast! Faster than your host wrote it.',
        'That was quick. Have a drink.',
      ],
      middling: [
        'Answered at a fair pace. More ale?',
        'A steady answer. Now we wait.',
        'In good time. The others are thinking.',
      ],
      late: [
        'Just in time! Your host was watching.',
        'Just in time! Nearly last orders.',
        'Just in time! The bell almost rang.',
      ],
      early: [
        'Answered early! Bold of you.',
        'Early! You must know your host well.',
        "So early! Let's see if it pays.",
      ],
      later: [
        "Took your time. Can't blame you.",
        'Waited for a better look. Wise.',
        'Late, but answered. That counts.',
      ],
    },
    reveal: ["Who's buying the next round?", 'Drinks on the winner!', 'The house has the answer.'],
    verdict: {
      right: [
        'Right! Your host will be pleased.',
        "Correct. That's one for the house.",
        "Spot on. The next pint's yours.",
      ],
      partial: [
        'Close enough for the house.',
        'Half right. Half a pint, then.',
        'Nearly there. Your host will allow it.',
      ],
      wrong: [
        "Not what your host wrote, I'm afraid.",
        'Wrong! Better buy your host a drink.',
        "No, friend. Check your host's notes.",
      ],
      missed: [
        "No answer? Your drink's gone warm.",
        'Nothing? Your host asked nicely.',
        'You let that one pass you by.',
      ],
    },
    // Every type a host can write asks in a sentence; the view below it is the answer.
    stem: 'text',
  },
  // Never a round either: the NPCs' own questions, each asked by the NPC it was written
  // for (`lib/randomEvents.ts`, `components/RandomEvent.svelte`). Here for its stem.
  random_event: {
    id: 'random_event',
    label: 'Random Event',
    hint: 'An NPC interrupts the round with a question of their own.',
    host: HOUSE,
    greeting: 'Someone has come in off the road, and they want a word.',
    blurb: 'Someone has turned up with a question. Answer it, and they will be on their way.',
    ask: [
      "Someone's come in off the road.",
      'A visitor with a question.',
      'Listen to our guest, now.',
    ],
    waiting: [
      "They'll be on their way once everyone has answered.",
      'Our guest is waiting on the rest of you.',
      'Nearly done with our visitor.',
    ],
    pace: {
      quick: [
        'Quick! Our guest is impressed.',
        'Fast! Our visitor barely blinked.',
        'That was speedy.',
      ],
      middling: [
        'In good time. Our guest nods.',
        'A fair pace. Now we wait.',
        'Answered steadily.',
      ],
      late: [
        'Just in time! Our guest was leaving.',
        'Just in time! The door nearly shut.',
        'Just in time! Nearly missed them.',
      ],
      early: [
        'Answered early! Bold.',
        'So early! Our guest had barely spoken.',
        'Early! You know this visitor.',
      ],
      later: [
        'You let them finish. Good manners.',
        'Took your time. Our guest waited.',
        'A patient answer.',
      ],
    },
    reveal: ['And off they go.', 'Back on the road with them.', 'Mind the door on your way out.'],
    verdict: {
      right: [
        'Our guest liked that answer.',
        "Right! They'll leave happy.",
        'Correct. Off they go, satisfied.',
      ],
      partial: [
        "Half an answer. They'll take it.",
        'Close enough for our visitor.',
        'Nearly. Our guest nods.',
      ],
      wrong: [
        'Our guest is not impressed.',
        "Wrong. They'll grumble on the road.",
        'Not quite what they wanted.',
      ],
      missed: [
        'You left our guest waiting.',
        'No answer for our visitor.',
        'Our guest heard nothing from you.',
      ],
    },
    // In character, and still a sentence.
    stem: 'text',
  },
}

/**
 * Modes still being built, shown on the create form faded and with nothing to press, their
 * host standing on the card as it will on the stage, so players can see who is coming. Copy
 * only: once a mode ships it gets a full `MODES` entry and `/api/modes` lists it, and the
 * form stops treating it as upcoming — so an entry left here after that is harmless, but
 * belongs deleted. A host here is never on the random-event roster: that face means an
 * interruption.
 */
export const UPCOMING_MODES: { id: string; label: string; hint: string; host: string }[] = [
  {
    id: 'release_order',
    label: 'Release Order',
    hint: 'Put quests and monsters in the order they came out.',
    host: 'aris',
  },
  {
    id: 'name_that_spell',
    label: 'Name that spell',
    hint: 'Because everyone plays with sound effects on!',
    host: 'aubury',
  },
  {
    id: 'minimap_guesser',
    label: 'Minimap Guesser',
    hint: 'Where in the name of Gielinor is that?',
    host: 'captain_errdo',
  },
  {
    id: 'scrying_pool',
    label: 'Scrying Pool',
    hint: 'Where did that teleport drop you?',
    host: 'archmage_sedridor',
  },
  {
    id: 'lost_in_gielinor',
    label: 'Lost in Gielinor',
    hint: 'Hans has wandered off. Follow his clues and find him.',
    host: 'hans',
  },
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
