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

export const MODES: Record<string, Mode> = {
  more_less: {
    id: 'more_less',
    label: 'More or Less',
    hint: 'A mix of Grand Exchange, High Alchemy and NPC prices.',
    host: { id: 'ali_morrisane', name: 'Ali Morrisane' },
    greeting: 'Ah, my friend! Step closer, step closer, and see what I have on my stall today.',
    blurb:
      'Two fine wares, one simple question: which is worth more, or less? My prices are always honest. Mostly.',
    ask: [
      'Look closely, my friend. My prices never lie!',
      'Two fine wares from Al Kharid. Which is it?',
      'Come, compare! I hide nothing from a customer.',
      'A shrewd trader like you can spot the bargain.',
      'Tell me, my friend, where does the smart money go?',
    ],
    waiting: [
      'Take your time. While we wait, do you need any bulk runes?',
      'No rush! Can I interest you in a slightly used flying carpet?',
      'A good haggle takes patience. My stall is not going anywhere.',
      'Still counting their coins, the others. Have a look at my crates.',
      'While they think, have you considered investing in Pollnivneach?',
    ],
    pace: {
      quick: [
        'Done in a heartbeat! You haggle like a Pollnivneach local.',
        'Quick as a desert wind! I love a decisive buyer.',
        'Sold! Before the ink on the price tag even dried.',
        'You know the street price by heart, I can tell!',
      ],
      middling: [
        'You weighed the merchandise carefully. I respect that.',
        'A sensible trader checks the goods for cracks first.',
        'Unrushed, unbothered. That is how fortunes are made.',
        'Bid placed! Now we wait on the window shoppers.',
      ],
      late: [
        'Just in time, my friend! I was already packing the crates.',
        'Got your bid in just in time before the camels left!',
        'Just in time! Another second and I would have sold it to Traiborn.',
        'In at the last moment, just in time to close the deal!',
      ],
      early: [
        'Bought sight unseen! I admire your nerve, my friend.',
        'An early bid! Either you know your market or you like a gamble.',
        'You barely glanced at the wares! My kind of customer.',
        'Snapped up before the rest of the bazaar even looked!',
      ],
      later: [
        'Checked the hallmark, bit the coin, weighed it twice. Smart.',
        'You drive a careful bargain, my friend.',
        'Never buy a camel without checking its teeth first.',
        'A cautious buyer! Hard to swindle someone like you.',
      ],
    },
    reveal: [
      'Let us check the ledger!',
      'The scales do not lie.',
      'What says the market?',
      'Count the coins, my friend!',
    ],
    verdict: {
      right: [
        'A shrewd eye! Have you ever thought of opening a stall?',
        'Spot on, my friend! I could not swindle you if I tried.',
        'Right on the coin! You should come work for me in Pollnivneach.',
        'Pure profit! You know the value of everything in Gielinor.',
      ],
      partial: [
        'Close enough to break even, my friend!',
        'Half a profit is better than a kick from a camel.',
        'Not bad! Call it mate’s rates.',
        'Almost on the coin. You still walk away with a deal.',
      ],
      wrong: [
        'Ooh, painful! You just paid Al Kharid toll-gate prices.',
        'Wrong, my friend! Never mind, want to buy a magic carpet instead?',
        'Ah, you have been fleeced! Even my nephew prices better than that.',
        'No, no! My coin purse weeps for you.',
      ],
      missed: [
        'No bid at all? I cannot haggle with silence, my friend!',
        'You stood there window-shopping until the bazaar closed!',
        'Not a single coin offered? That is no way to do business.',
        'The deal walked right past you while you were daydreaming!',
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
    greeting: 'Welcome to the Grand Exchange. Step up to the booth whenever you are ready.',
    blurb:
      'One item and a slider of prices. Slide to what it really trades for on the Grand Exchange - no +5% button to save you here.',
    ask: [
      'What does this item go for on the Grand Exchange?',
      'What would this item fetch on the Grand Exchange?',
      'Name the Grand Exchange guide price for this item.',
      'What does this trade for on the Grand Exchange?',
      'How much is this worth on the Grand Exchange?',
    ],
    waiting: [
      'Your offer is in the slot. Waiting on the rest of the floor.',
      'Hold on, someone at the west booth is still counting their gp.',
      'Offer logged. Feel free to bank-stand while the others finish.',
      'Still matching offers across the market. Won’t be a moment.',
      'Waiting on the other traders. Please do not spam-click the booth.',
    ],
    pace: {
      quick: [
        'Instabought! You did not even haggle over a single coin.',
        'Offer placed in a single tick. Flippers hate you.',
        'Faster than a merch clan dumping their stock!',
        'Straight in! You must flip these every day.',
      ],
      middling: [
        'Offer placed at guide price. Steady and sensible.',
        'Logged and queued. No need to mash the +5% button.',
        'A calm trade. Now we wait for the rest of the floor.',
        'Offer in! Let us see if the market meets your price.',
      ],
      late: [
        'Offer placed just in time, right before the daily price update!',
        'Slid across the counter just in time! The booth was closing.',
        'Got that offer in just in time, nearly hit the four-hour limit.',
        'Just in time! The clerk was already locking the till.',
      ],
      early: [
        'First offer in the book! Setting the market price yourself?',
        'An early bid, before the price checkers even loaded.',
        'Straight into the offer slot! You know your street prices.',
      ],
      later: [
        'Double-checked the margin before hitting confirm. Smart.',
        'Took a moment to count the zeroes. Better than selling for 1 gp!',
        'Careful with the slider. Nobody wants a misplaced decimal.',
      ],
    },
    reveal: [
      'Your offer has completed.',
      'Let us check the guide price.',
      'Collect your items and coins.',
      'Here is what it goes for.',
    ],
    verdict: {
      right: [
        'Green bar! Your offer filled to the very last coin.',
        'Spot on the guide price. You could run a booth yourself.',
        'Matched the market to a tee. Pleasure doing business with you.',
        'Exact price! Not a single coin wasted on the margin.',
      ],
      partial: [
        'Close enough to fill! You only overpaid by a few percent.',
        'Your offer partially completed. Respectable eye for the market.',
        'Right ballpark! A flipper would happily take that margin.',
        'Near the guide price. You will not go broke trading like that.',
      ],
      wrong: [
        'That offer is going to sit in your slot for six months.',
        'Way off market price. Did you miss a zero on the slider?',
        'Offer rejected! Not even a desperate quester would pay that.',
        'Ouch. Whoever traded with you just made a fortune.',
      ],
      missed: [
        'You left your offer slot completely empty!',
        'Too busy bank-standing at the booth to place a bid?',
        'No offer submitted. The market waits for no one!',
        'Did you hit the four-hour buy limit, or just forget to bid?',
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
    greeting: 'Welcome to the Digsite exam hall. Have your trowel and specimen brush ready.',
    blurb:
      'Every true adventurer right-clicks and examines everything in sight. I will read you an examine text; you tell me what it belongs to.',
    ask: [
      'What is this the examine of?',
      'Next specimen: what is this the examine of?',
      'Read the field notes: what is this the examine of?',
      'Which object in Gielinor has this examine text?',
      'Examine this closely: what is this the examine of?',
    ],
    waiting: [
      'Do not copy off your neighbour’s slate while we wait.',
      'The others are still brushing the dirt off their specimens.',
      'Quiet in the hall, please. Some candidates are still thinking.',
      'Wait for the rest of the dig team to hand in their notes.',
      'Patience. Good archaeology cannot be rushed with a pickaxe.',
    ],
    pace: {
      quick: [
        'Identified at a glance! You really do right-click everything.',
        'Remarkably quick! Have you been reading the wiki during lectures?',
        'First slate handed in! Level 3 Earth Sciences material.',
        'Instant recognition! You did not even need a magnifying glass.',
      ],
      middling: [
        'Logged in the field journal at a sensible pace.',
        'Careful brushwork, handed in on time.',
        'A methodical identification. Let us wait for the other candidates.',
        'Specimen tagged. Now we wait for the rest of the hall.',
      ],
      late: [
        'Handed your slate in just in time! The ink is still wet.',
        'Just in time! I was already reaching for the red pen.',
        'Finished just in time, before the dig site closed for the day!',
        'Scraped through just in time! Do not cut it so close next question.',
      ],
      early: [
        'Barely dusted the soil off and you already named it!',
        'An early identification. Confident in your field notes?',
        'Tagged before the rest of the hall even picked up their brushes.',
      ],
      later: [
        'Inspected it from every angle first. Very thorough.',
        'A cautious archaeologist checks twice before labelling a find.',
        'Took your time with the magnifying glass. Nothing wrong with that.',
      ],
    },
    reveal: [
      'Let us check the field guide.',
      'What was the specimen?',
      'Here is what you examined.',
      'Let us mark the slates.',
    ],
    verdict: {
      right: [
        'Full marks! Worthy of a Digsite pendant.',
        'Spot on! You clearly examine every rock and barrel you pass.',
        'Correct! I shall stamp your Earth Sciences certificate myself.',
        'Flawless identification. Curator Haig Halen will be delighted.',
      ],
      partial: [
        'Partial credit. You had the right era, at least.',
        'Close, though your field notes are a little smudged.',
        'Half marks. Enough to pass Level 1, if I am feeling generous.',
      ],
      wrong: [
        'Incorrect! Did you clean that specimen with a bronze pickaxe?',
        'No marks! Go back to panning for uncut jade at the river.',
        'Wrong, I am afraid. That would blow up the whole excavation.',
        'Not even close. Back to the student textbooks with you.',
      ],
      missed: [
        'A blank slate? Staring at the dirt will not pass the Digsite exam.',
        'Nothing written down! Did a workman steal your specimen brush?',
        'Time is up, and your field journal is still empty.',
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
    greeting: 'Welcome up to the first floor of the Varrock Museum! Mind the display cases.',
    blurb:
      'Someone has muddled up our museum placards from the First Age to the Fifth. Put them back in the right order and there may be Kudos in it for you.',
    ask: [
      'Help me put this display back in order, would you?',
      'These placards are mixed up. Sort them out for me!',
      'There are Kudos in it if you get the order right.',
      'Line these up for the Varrock Museum archives.',
      'Quickly, before Curator Haig Halen comes upstairs!',
    ],
    waiting: [
      'I shall polish the glass cases while the rest of the tour finishes.',
      'Waiting on the others. Please do not lean on the Zarosian pottery.',
      'Still sorting their notes downstairs. Take a breather.',
      'These finds have waited since the Fourth Age; a moment more is fine.',
      'While we wait, have you told me about all your quests lately?',
    ],
    pace: {
      quick: [
        'Sorted in a flash! You have the makings of a senior historian.',
        'My word, that was quick, and you didn’t even chip the pottery!',
        'Straight into the right cases! Have you been studying the plaques?',
        'Done already! You’ll have the Bone Voyage barge unlocked in no time.',
      ],
      middling: [
        'Arranged at a proper museum pace. No running in the galleries!',
        'Neatly catalogued. Let us wait for the rest of the visitors.',
        'A steady hand with the exhibits. Much appreciated.',
        'Filed and labelled! Now we wait on the other researchers.',
      ],
      late: [
        'Slotted the last piece in just in time before closing bell!',
        'Just in time! I heard Haig Halen climbing the stairs.',
        'Got the display case locked just in time!',
        'Finished just in time! Nearly had to hold the museum doors for you.',
      ],
      early: [
        'Catalogued before the dust even settled on the display!',
        'So early! You must know our collection inside out.',
        'First exhibit arranged! Let us see if the archives agree.',
      ],
      later: [
        'Cross-referenced every label before moving a thing. Very scholarly.',
        'Measured twice before touching the artefacts. A true curator.',
        'You took your time reading the plaques. I wish more visitors did!',
      ],
    },
    reveal: [
      'Let us check the catalogue.',
      'How do they line up?',
      'Here is the proper order.',
      'What say the archives?',
    ],
    verdict: {
      right: [
        'Every single one in its proper place! Five Kudos to you.',
        'Flawless! Even Curator Haig Halen could not find fault with that.',
        'Spot on! Worthy of an antique lamp from the top shelf.',
        'Exactly right! The Varrock Museum owes you a debt of gratitude.',
      ],
      partial: [
        'Mostly in order! Only a couple of cases swapped around.',
        'Not bad at all. A quick shuffle and the display will be presentable.',
        'Close! You earned a few Kudos for that effort, at least.',
        'Nearly there! Good enough that the tourists won’t notice.',
      ],
      wrong: [
        'Oh dear, you have got the First Age mixed up with last Tuesday!',
        'Completely backwards! Please do not touch the Oldones exhibit.',
        'Not a single placard in place. No Kudos for that, I’m afraid.',
        'Goodness, even the natural history goblins downstairs know better!',
      ],
      missed: [
        'You did not move a single placard! The display is still a shambles.',
        'Too busy staring at the fossils to sort the case?',
        "No answer? You'll never reach the Fossil Island barge at this rate.",
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
    greeting: 'Squawk! Careful with the teacup, there’s a parrot listening in!',
    blurb:
      'I sit on shoulders in every tavern from Port Sarim to Mos Le’Harmless and repeat whatever I overhear. Tell me who said it first!',
    ask: [
      'Squawk! Overheard this at the bar - who said it?',
      'Polly heard a rumour! Whose voice is this?',
      'Pieces of eight! Who goes around saying this?',
      'Squawk! Heard this on my perch. Name the speaker!',
      'Who said that? Who said that? Tell the bird!',
    ],
    waiting: [
      'Preening my feathers while the slowpokes think. Squawk!',
      'Got a Karamjan banana while we wait? Or a cracker?',
      'Don’t tap on the teacup! The others are still thinking.',
      'Polly’s waiting... waiting... somebody toss me a peanut!',
      'Squawk! Five gp says half the table guesses wrong!',
    ],
    pace: {
      quick: [
        'Squawk! Faster than a seagull stealing a kebab!',
        'Sharp ears! You recognized that voice right away!',
        'Quick on the perch! Polly’s impressed!',
        'Straight in! You eavesdrop even more than I do!',
      ],
      middling: [
        'Tucked your answer under your wing. Now we wait!',
        'A sensible bird doesn’t flap in a hurry. Squawk!',
        'Heard you loud and clear! Waiting on the rest of the flock.',
      ],
      late: [
        'Squawk! Flew in just in time before the cage door shut!',
        'Chose your perch just in time - Polly nearly dozed off!',
        'Just in time! One more second and you’d have missed the boat!',
      ],
      early: [
        'Squawk! Barely chirped the first word and you knew it!',
        'Early bird gets the worm, and the points!',
        'Didn’t even need the whole quote! Sharp beak on you!',
      ],
      later: [
        'Cocked your head and listened twice. Smart bird!',
        'Took a long squint at the chatbox first, eh?',
        'Slow flapper, but you got there in the end! Squawk!',
      ],
    },
    reveal: [
      'Squawk! Here’s who said it!',
      'A little bird told me!',
      'Out of the horse’s mouth!',
      'Pieces of eight! The speaker:',
    ],
    verdict: {
      right: [
        'Squawk! Spot on! Have a cracker, matey!',
        'Clever bird! You know every voice in Gielinor!',
        'Right you are! Polly tips her teacup to you!',
        'Dead right! You’ve been reading the dialogue boxes!',
      ],
      partial: [
        'Half a cracker for you! Close, very close!',
        'Nearly had it! Right tavern, wrong loudmouth!',
        'Squawk! Close enough for a nibble of seed!',
      ],
      wrong: [
        'Squawk! Wrong! Have you been holding spacebar through quests?',
        'No cracker for you! They never said a word of that!',
        'Squawk! Dead wrong - even a drunken pirate knows better!',
        'Bawk! Did you play with your chatbox minimized?',
      ],
      missed: [
        'Cat got your tongue? Not even a squawk from you!',
        'Silent as a stuffed parrot! Did you fall off your perch?',
        'Nothing?! Polly can’t repeat silence, matey!',
      ],
    },
    stem: 'quote',
  },
  know_your_content_creator: {
    id: 'know_your_content_creator',
    label: 'Know Your Content Creator',
    hint: 'Are you sure you are a fan?',
    host: { id: 'gnome_child', name: 'Gnome child' },
    greeting: 'Do you ever think about what it means to watch someone else click trees?',
    blurb:
      'Streamers say things, and things are said about streamers. Close the second monitor and show me what you know.',
    ask: [
      'But do you really know them?',
      'Is a streamer real if nobody is in chat?',
      'Think about it. Then think about it again.',
      'Somewhere out there, a hardcore just died.',
      'Have you ever noticed the green pixel?',
    ],
    waiting: [
      'Time is a construct. So is waiting for the rest of the room.',
      'Do the others think, or do they only guess?',
      'I have stood in the Gnome Stronghold forever. A few seconds is fine.',
      'Waiting is just watching a stream while the streamer is AFK.',
      'Every 0.6 seconds, another tick passes us all by.',
    ],
    pace: {
      quick: [
        'One-ticked it. Did you even stop to think?',
        'So fast. Your second monitor never leaves Twitch, does it?',
        'You answered before the game tick even finished.',
        'Quick. Some people just live in the chat.',
      ],
      middling: [
        'Not fast, not slow. Perfectly balanced, like a gnomeball pass.',
        'An answer at the speed of a four-tick whip.',
        'You took exactly as many ticks as you needed.',
      ],
      late: [
        'Just in time. Or was time just in you?',
        'Got it in just in time, on the very last tick.',
        'Just in time. Does the timer bar even exist?',
      ],
      early: [
        'You answered before you even read it. Interesting.',
        'Early. Do you see the future, or just the clips?',
        'So soon. Perhaps you were there live.',
      ],
      later: [
        'You waited to see more. So do we all.',
        'Later is just now, but a few ticks further away.',
        'You took your time. No XP waste here.',
      ],
    },
    reveal: [
      'Now you know. Or always knew.',
      'The truth was always there.',
      'Clip it and ship it.',
      'Was it ever in doubt?',
    ],
    verdict: {
      right: [
        'You knew. Perhaps you always knew.',
        'Correct. Nice.',
        'Right. You were definitely in the chat when it happened.',
        'True. The birthday boy would be proud.',
      ],
      partial: [
        'Partly right. 50/50: either you know it or you do not.',
        'Some of it was true. Like most clips on Reddit.',
        'Half right. Close enough for the highlight reel.',
      ],
      wrong: [
        'Wrong. Back to Lumbridge, hcim btw.',
        '73. Wait, no. Zero points.',
        'That was not it. Perhaps touch some Gnome Stronghold grass.',
        'Wrong. Clip that.',
      ],
      missed: [
        'You said nothing. AFK at the crab again?',
        'Silence is also an answer. Just worth zero points.',
        'No answer. You logged out mid-question.',
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
    greeting: 'Welcome to Ardougne Zoo! Keep your fingers outside the bars, some of these bite.',
    blurb:
      'From Lumbridge goblins to slayer cave horrors, I have notes on every creature in Gielinor. Let’s see how well you know your monsters.',
    ask: [
      'What do you make of this creature?',
      'Careful by the bars! What do you know about it?',
      'How well do you know this beast?',
      'Step up to the bars and tell me this.',
      'This monster is in my book. Do you know it?',
    ],
    waiting: [
      'Hang on, those two penguins by the rock are whispering again.',
      'Keep your hands off the unicorn cage while the others finish up.',
      'Just tossing a bucket of fish to the sea turtles while we wait.',
      'Check your bag - nobody smuggled a Karamjan monkey in here, right?',
      'Waiting on the rest of the tour group. Mind the cyclops!',
    ],
    pace: {
      quick: [
        'Faster than a startled chinchompa! You know your monsters.',
        'Quick as a pit-trap! You’ve fought plenty of those, haven’t you?',
        'Straight in! You didn’t even need the Monster Examine spell.',
        'Rapid! You could wrangle escaped penguins for a living.',
      ],
      middling: [
        'A steady pace, faster than a gnome tortoise at least.',
        'In at a comfortable trot. Let’s wait for the rest of the group.',
        'Answered without spooking the animals. Nice and calm.',
        'Got your answer in! The others are still squinting through the bars.',
      ],
      late: [
        'Slipped through the zoo gates just in time!',
        'Got that in just in time before feeding time started!',
        'Just in time! The scorpion nearly had your fingers.',
        'Right at closing bell, just in time!',
      ],
      early: [
        'Called it from a single footprint! Impressive.',
        'Barely saw the horns on it and you already knew!',
        'So early! Have you been keeping one of these in your POH menagerie?',
      ],
      later: [
        'Kept a safe distance and observed it first. Smart.',
        'Never poke a strange beast without checking its combat level first.',
        'Took a good long look through the bars. Can’t blame you.',
      ],
    },
    reveal: [
      'Let’s check the bestiary.',
      'What does the field guide say?',
      'Here’s the creature’s file.',
      'Back in its cage!',
    ],
    verdict: {
      right: [
        'Spot on! You know Gielinor’s wildlife better than Parroty Pete.',
        'Dead right! Toss a fish to the penguins on your way out.',
        'Correct! Even the cyclops is nodding at you.',
        'Nailed it! You’ve clearly spent some hours in the field.',
      ],
      partial: [
        'Close! You’d survive the encounter, maybe with a scratch or two.',
        'Mostly right, just don’t try petting it.',
        'Half marks! You’ve seen one before, even if you forgot the details.',
      ],
      wrong: [
        'Oof, no! Walk into its lair thinking that and you’re dragon food.',
        'Wrong beast entirely! Did a monkey write your notes?',
        'Not even close! Stay on the visitor path where it’s safe.',
        'Wrong! Even the sheep by the north fence knew that one.',
      ],
      missed: [
        'No answer? Did you wander off toward the Ardougne monastery?',
        'Frozen like a deer in a hellhound’s sights!',
        'Nothing from you. Too busy watching the penguins plot?',
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
    greeting: 'Got a task for you. Not a task to kill, but a question to solve.',
    blurb:
      'Your task: know the loot. Who drops it, what they drop, and at what rate they drop it. Show me what you know.',
    ask: [
      'Next on your task: how well do you know this drop?',
      'Every ironman has wiki-searched this one at 2 a.m.',
      'Load your cannon. What do you make of this?',
      'Do you check the loot beam, or alch everything?',
      'You’ve killed plenty of these. What’s the drop?',
    ],
    waiting: [
      'Waiting on your party. Reload your cannon while they think.',
      'Take your time. I’ve gone three thousand kills dry waiting on worse.',
      'Still waiting on the others. Did someone forget a Ring of Wealth?',
      'Sip a prayer potion while the rest of the room finishes up.',
      'Good loot takes patience. Unless you get spooned on kill count one.',
    ],
    pace: {
      quick: [
        'Spooned on the first kill! You knew that drop rate by heart.',
        'Fast! You’ve definitely camped that monster for a week straight.',
        'One-tick flicked that answer! Clean work.',
        'Instant answer, spoken like someone who’s gone dry for it.',
      ],
      middling: [
        'Solid pace, like a steady task in the Stronghold cave.',
        'Locked in! Now we wait to see what drops.',
        'Nice and steady, no prayer points wasted.',
        'Answer’s in. Let’s see if the RNG gods are smiling on you.',
      ],
      late: [
        'Got that in just in time - nearly ran out of prayer at 1 HP!',
        'Clicked your emergency teleport tab just in time!',
        'Just in time! One tick later and you’d be waking up in Lumbridge.',
        'Ate an anglerfish just in time to survive the hit!',
      ],
      early: [
        'Called the drop before the monster even hit the floor!',
        'Instant call! You’ve spent way too long staring at drop tables.',
        'Barely saw the loot beam and you already knew it!',
      ],
      later: [
        'Had to mentally calculate the 1-in-512 first? Fair enough.',
        'Checked the floor twice to make sure you didn’t miss a rare drop.',
        'Slow kill, but as long as the loot’s on the ground, it counts.',
      ],
    },
    reveal: [
      'Check the loot pile!',
      'What’s under the loot beam?',
      'Let’s see the drop table.',
      'Here’s what dropped.',
    ],
    verdict: {
      right: [
        'Collection log slot: completed! Nice work.',
        'Pink loot beam! You know your drop tables inside out.',
        'Spot on! Thirty slayer points and a pat on the back.',
        'Clean kill, clean answer. Steve couldn’t have done it better.',
      ],
      partial: [
        'Close! Call it rare drop table: uncut sapphire for your trouble.',
        'Half credit. Like getting a dragon med helm instead of the visage.',
        'Not quite the unique, but decent alchables at least.',
      ],
      wrong: [
        'Oof, nothing but ashes and a troll roll of 32 pure essence.',
        'Wrong! Go see Turael and reset your streak.',
        'Missed! Did you forget to wear your slayer helmet?',
        'Zero points. Enjoy your task of 180 bronze dragons.',
      ],
      missed: [
        'AFK with auto-retaliate off? The despawn timer ate your loot!',
        'You stood there watching your purple drop disappear on the floor!',
        'No answer at all. Did you DC mid-task?',
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
      'Most of these belong together. One does not. Find it before Mr. Mordaut punishes me again!',
    ask: [
      "One of these is like me: it doesn't fit.",
      "Find the one that doesn't belong here.",
      'I picked the wrong one last time. Your turn.',
      'Something here belongs in the corner with me.',
      'All of these belong together except one. Which?',
    ],
    waiting: [
      "Take your time. Nobody's letting me out of this corner anyway.",
      "Don't look at me for a hint, I'm wearing the pointy hat.",
      "I'm counting the bricks in the wall while the others finish.",
      'Mr. Mordaut is watching. Pretend you’re thinking hard.',
    ],
    pace: {
      quick: [
        "Whoa, so quick! I'm still sounding out the first word.",
        "Fast! I'd still be counting on my fingers.",
        'Show-off! How did you spot it that fast?',
        'Already?! Save some brains for the rest of us.',
      ],
      middling: [
        'Not bad, quicker than me anyway.',
        'Finished at normal-person speed. Must be nice.',
        'Answer’s in! You didn’t even have to guess, did you?',
      ],
      late: [
        "Just in time! That's usually when I panic and guess C.",
        'Phew, got it in just in time! My palms were sweating for you.',
        'Just in time! Right before the chalk hit the blackboard.',
      ],
      early: [
        "So early! I hadn't even finished reading the options.",
        'Instant pick! Are you actually sure, or pulling a me?',
        'Barely looked at it! You must sit in the front row.',
      ],
      later: [
        'Stared at it a long time. Story of my life.',
        'Had to squint at all four of them, huh? Me too.',
        'Slow and steady. Better than a trip to the corner.',
      ],
    },
    reveal: [
      "Told you it didn't fit.",
      'That one goes in the corner.',
      "Even I'd have spotted that.",
      'The odd one out:',
    ],
    verdict: {
      right: [
        'You got it! Can I copy off your slate next round?',
        "Spot on! You'll never have to wear the pointy hat.",
        'Correct! I wish I knew half of what you know.',
        'Nailed it! Don’t tell the teacher I helped.',
      ],
      partial: [
        "Half right! Honestly, I'd frame that and hang it on the wall.",
        'Almost! Only half a trip to the corner for you.',
        'Close enough! Better than my usual zero.',
      ],
      wrong: [
        'Wrong! Budge over, I’ll make room for you in the corner.',
        "Hey, that's the exact one I picked! Wait, that's bad.",
        'Oops. I have a spare dunce hat if you want it.',
        'Nope! Welcome to the back of the classroom, friend.',
      ],
      missed: [
        "No answer? Honestly, sometimes that's safer than guessing.",
        'Left it blank? I tried that once and still ended up in the corner.',
        'Daydreaming out the window? I do that every lesson.',
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
      "Next game's starting! Step through the portal.",
      'The lobby is full. Let’s see what you know!',
      "Saradomin or Zamorak, you'll want to know this.",
      'Grab your bandages and have a go at this one.',
      'Pest Control to Wintertodt: do you know this one?',
    ],
    waiting: [
      'Waiting for enough players. As always.',
      'Someone still hasn’t called their role on the horn.',
      'Hold the stairs! Waiting on the rest of the lobby.',
      'Grab a bandage from the table while the others finish up.',
      'Please do not leave on Wave 9 while we wait.',
    ],
    pace: {
      quick: [
        'First through the portal! Straight to the enemy flag!',
        'Faster than a Zamorakian leaping the stepping stones!',
        'Instant call! Your Defender horn is already blown.',
        'Speedy! You’d top the Agility Arena ticket board.',
      ],
      middling: [
        'In with the main pack, holding the middle of the bridge.',
        'Steady play! Keep the Void Knight alive while we wait.',
        'Locked in with time to spare. Nobody’s kicking you from the boat.',
      ],
      late: [
        'Slipped through the portal just in time before the game started!',
        'Got the flag home just in time, right on the whistle!',
        'Repaired the barricade just in time! Close call.',
        'Made the Pest Control boat just in time!',
      ],
      early: [
        'Rushed the flag before the barricades even went up!',
        'Called your role in the first tick of the wave!',
        'Out of the gate before the horn even finished blowing!',
      ],
      later: [
        'Camping the catapult on the castle wall? At least you answered.',
        'Took your time. Fletching kindling by the brazier, were we?',
        'Held onto the flag until the last minute, then scored.',
      ],
    },
    reveal: [
      'The game has ended! Who won?',
      'Time’s up! Flags down!',
      'Count the reward tickets!',
      'Back to the lobby!',
    ],
    verdict: {
      right: [
        'Victory! Two Castle Wars tickets and bragging rights.',
        'Your team takes the flag! Gold decorative armour material.',
        'Spot on! The Void Knight lived with full hitpoints.',
        'Wave 10 cleared! The Penance Queen didn’t stand a chance.',
      ],
      partial: [
        'A 1-1 draw! One ticket each for your trouble.',
        'Close game! You kept the brazier lit, at least.',
        'Partial points. Call it mid-tier reward potential.',
      ],
      wrong: [
        'Defeat! Somebody forgot to shut the gate at Pest Control.',
        'Dropped the flag in the river! Better luck next game.',
        'Wrong! The Wintertodt cold just interrupted your answer.',
        'Collapsed the wrong tunnel! Your whole team is buried.',
      ],
      missed: [
        'Kicked from the lander for zero activity!',
        'Stood AFK in the waiting room and missed the portal!',
        'Your zeal bar dropped to zero. No points this round!',
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
    greeting: 'Parcel for you! Smudged address, mind - all I’ve got is a silhouette.',
    blurb:
      "Everyone in Gielinor gets post from me. I'll show you their shadow; you tell me whose letterbox it goes in.",
    ask: [
      "Parcel with no name on it! Who's this one for?",
      'Only a silhouette on the envelope. Who is it?',
      'Special delivery! Whose shadow have we got here?',
      'Help a postie out: who am I delivering this to?',
      "I've seen this outline on my rounds. Who is it?",
    ],
    waiting: [
      'Hang on, still rummaging through the bottom of my mailbag.',
      'Waiting on the rest of the street to answer the door.',
      'Careful, don’t let a highwayman nick the parcels while we wait.',
      'Still sorting the Varrock post from the Falador post.',
    ],
    pace: {
      quick: [
        'First-class express! Faster than a teleport tab.',
        'Delivered in a flash! You know every face on my route.',
        'Stamped and sorted before the ink even dried!',
        'Rapid! Evil Bob could use a courier as quick as you.',
      ],
      middling: [
        'Delivered on the afternoon round, steady and reliable.',
        'Popped through the letterbox in good time.',
        'Nice brisk walking pace. My skeletal feet approve.',
      ],
      late: [
        'Caught the last post of the day just in time!',
        'Slipped it under the door just in time before closing!',
        'Just in time! The mail cart was already rolling out of town.',
      ],
      early: [
        'Barely saw the outline of their hat and you knew them!',
        'Recognized them from down the street! Sharp eyes.',
        'Sorted before the sack even hit the table!',
      ],
      later: [
        'Had to squint at the silhouette in the candlelight first?',
        'Checked the postcode twice before knocking. Sensible.',
        'Took a long look at the shadow. Better than wrong delivery!',
      ],
    },
    reveal: [
      'Signed, sealed, delivered!',
      "Here's who answered the door.",
      'Let’s read the name tag.',
      'Special delivery for:',
    ],
    verdict: {
      right: [
        'Right letterbox, first try! Signed for and everything.',
        'Spot on! You know more locals than I do.',
        'Delivered! Not a single parcel lost in the post.',
        'Bang on the address! Worthy of a tip.',
      ],
      partial: [
        'Right street, wrong house! Close enough to toss over the fence.',
        'Nearly! The neighbour can walk it over for them.',
        'Half right. At least it landed in the right kingdom.',
      ],
      wrong: [
        'Return to sender! That looks nothing like them.',
        'Wrong door! You just handed Elvarg’s post to a goblin.',
        'No such person at this address! Back in the sack it goes.',
        'Misdelivered! That’s going to end up in the Dead Letter Office.',
      ],
      missed: [
        'Knocked three times and nobody came to the door!',
        'Left a "Sorry we missed you" card on your table.',
        'No signature from you. Parcel goes back to the depot.',
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
    greeting: 'Step up to the flax field. Let us see how sharp your eyes really are.',
    blurb:
      'I will reveal an item a few pixels at a time. Name it from the list before the full icon shows - the fewer pixels you need, the more points you earn.',
    ask: [
      'A new master challenge. What item is this?',
      'Squint at the pixels. Which item do you see?',
      'How many pixels do you need to name this item?',
      'Show me your bank knowledge. What item is this?',
      'Focus your eyes. Which item is taking shape?',
    ],
    waiting: [
      'Waiting on the others. Some folk still sort their bank by colour.',
      'Hold on, the rest of the room is still squinting at the pixels.',
      'I have stood by the Seers’ flax field for years; I can wait a bit.',
      'Still puzzling it out, the others. No Bloodhound pet for slow eyes.',
    ],
    pace: {
      quick: [
        'Spot-checked in a second! You know every sprite in your bank.',
        'Fast! You did not even need a magnifying glass.',
        'Completed the challenge before the second pixel pass!',
        'Razor-sharp! Worthy of a master clue casket.',
      ],
      middling: [
        'Named once the silhouette came together. Sensible.',
        'Challenge completed at a steady pace. Hand me your scroll.',
        'A clean identification. Let us wait on the rest of the room.',
      ],
      late: [
        'Named it just in time, with the full icon staring right at you!',
        'Completed the challenge just in time before your clue scroll tore!',
        'Got it in just in time! The last pixel was already in place.',
      ],
      early: [
        'From four giant squares of colour?! You stare at your bank too much.',
        'First-step snipe! Did you memorize the item database?',
        'Barely a smear of pixels and you called it! Extraordinary.',
      ],
      later: [
        'Waited until you could count the pixels on the handle. Safe play.',
        'No shame in waiting for the sharper pass. Wrong guesses pay zero.',
        'Let the picture come into focus first. A patient detective.',
      ],
    },
    reveal: [
      'Every pixel in place.',
      'Here is the full icon.',
      'Challenge complete:',
      'The item revealed:',
    ],
    verdict: {
      right: [
        'Spot on! Here is your challenge scroll back, marked complete.',
        'Flawless eye! One step closer to the Bloodhound.',
        'Correct! You know your inventory sprites inside out.',
        'Solved! Even Watson could not fault that eye.',
      ],
      partial: [
        'Right item family, wrong tier. Partial credit.',
        'Close! The colours fooled you on the early pass.',
        'Half credit. Squint a little harder next time.',
      ],
      wrong: [
        'Wrong item! Did you mistake a bronze med helm for a cabbage?',
        'Incorrect! Drop your master clue scroll and go train your eyes.',
        'Not even the right colour palette! Back to easy clues in HAM robes.',
        'Failed the challenge! Even a blurry pixel looked nothing like that.',
      ],
      missed: [
        'Stared at the pixels until the timer ran out and never picked one!',
        'No answer at all? Your master clue scroll just blew away.',
        'Left the challenge blank. No casket for you.',
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
    hint: "He's forgotten what this verse was about. Can you help him out?",
    host: { id: 'falo', name: 'Falo the Bard' },
    greeting: 'Ah, a crowd! I know the song, but not what item it is about.',
    blurb:
      "I'll sing you a verse about an iconic item, if only I could remember which one. Find it on the list to jog my memory.",
    ask: [
      'Listen to the verse. Which item is it about?',
      'Right on the tip of my tongue! Name the item.',
      'Show me the item from this ballad, friend!',
      'I wrote this song, yet the item escapes me...',
      'A verse from my travels: what item is it about?',
    ],
    waiting: [
      'Let me tighten a string on my lyre while the others think.',
      'The rest of the tavern is still humming the melody.',
      'Wait a moment, don’t spoil the chorus for the others!',
      'It gets chilly on the road to Rellekka waiting for an audience.',
    ],
    pace: {
      quick: [
        'Before the first chord even faded! What a memory you have!',
        'You knew the ballad from the very first line!',
        'Faster than a bard chasing a gold coin!',
        'Named it on the downbeat! My memory is saved!',
      ],
      middling: [
        'Right on the rhythm, neither rushing the tempo nor dragging.',
        'Answered by the end of the verse. Now we wait for the chorus.',
        'A pleasant tempo! Let the rest of the crowd finish listening.',
      ],
      late: [
        'Got it in just in time, on the very last strum of the lyre!',
        'Just in time! The ballad was fading into the final note.',
        'Remembered it just in time before the encore ended!',
      ],
      early: [
        'You named it before I even reached the rhyming line!',
        'Barely plucked a single string and you knew the item!',
        'So early! Have you heard me sing this on the Rellekka road before?',
      ],
      later: [
        'Listened to the whole verse twice to be sure. A polite audience.',
        'Let the lyrics sink in first. Good poetry deserves a moment.',
        'Took your time with the riddle. Better sure than out of tune!',
      ],
    },
    reveal: [
      'Ah yes, now I remember!',
      'Of course! That was the item!',
      'The ballad comes back to me:',
      'How could I forget?',
    ],
    verdict: {
      right: [
        'Yes, that’s the one! Seeing it brings the whole song back to me!',
        'Bravo! You know my repertoire better than I do!',
        'Spot on! Take your clue scroll before I forget the next verse too.',
        'That is the very item! My lyre sings for you, friend!',
      ],
      partial: [
        'Close! Right melody, slightly the wrong verse.',
        'Nearly had it, it would almost fit the metre!',
        'Half right! My own memory is no better today.',
      ],
      wrong: [
        'No, no! That doesn’t fit the rhyme or the legend at all!',
        'Wrong item! Singing about that would clear the whole tavern.',
        'Alas, a sour note! That is not what the verse was about.',
        'Not even close, friend. Now you have got me even more confused!',
      ],
      missed: [
        'Dead silence from the crowd? A bard’s worst nightmare!',
        'Not a single guess? Now neither of us knows how the song ends!',
        'You stood there like a Rellekka rock crab and said nothing!',
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
      'Read the answer on the board. Pick its question.',
      'An answer on the board: what is its question?',
    ],
    waiting: [
      'Eyes on your own desk. The rat finished ten seconds ago.',
      'Please refrain from eating your classmates while we wait.',
      'Silence in the classroom while the slower mammals finish reading.',
      'Do not poke the balloons until every paper is handed in.',
    ],
    pace: {
      quick: [
        'Handed in already? Even for a two-legged creature, that was brisk.',
        'Quick work. Did you actually read all four questions?',
        'First desk finished. You may sit with your arms folded.',
      ],
      middling: [
        'Submitted at an adequate pace. Remain in your seat.',
        'Paper received. Try not to fidget while the others finish.',
        'On time, as a properly trained pupil should be.',
      ],
      late: [
        'Slid onto my desk just in time! My claw was on the bell.',
        'Just in time! One second later and it would be detention.',
        'Handed in just in time. Stop chewing your quill.',
      ],
      early: [
        'Answered before the chalk dust settled on the board!',
        'Remarkably early. Have you been peeking at my lesson plan?',
        'Done on the first glance. Sit quietly.',
      ],
      later: [
        'Read all four questions twice, did you? Sensible.',
        'Slow, steady, and hopefully not backwards.',
        'Took the full exam period. At least you wrote something.',
      ],
    },
    reveal: [
      'Time. Quills down.',
      'Let us mark the slates.',
      'The matching question was:',
      'Eyes on the blackboard.',
    ],
    verdict: {
      right: [
        'Correct. You may pop a balloon on your way out.',
        'Full marks! A pupil with a functioning brain, at last.',
        'Right! Here is a Book of Knowledge for your trouble.',
        'Astonishing. You actually thought backwards properly.',
      ],
      partial: [
        'Half marks. Better than the goblin in the front row, I suppose.',
        'Partly right. Stay behind after class for remedial uncooking.',
        'Some credit, though your logic is muddled.',
      ],
      wrong: [
        "That's WRONG. Go stand in the corner with the Dunce.",
        'Incorrect! Is that what they teach you in regular Gielinor?',
        'No, no, no! Even Evil Bob’s servants score higher than that.',
        'Zero marks! Did you uncook your own brain before class?',
      ],
      missed: [
        'A completely blank slate. Detention.',
        'Nothing written at all? Even the frog wrote down a guess.',
        'Time expired while you stared at the blackboard. F.',
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
    greeting: 'Pull up a chair by the bookshelf. I have stories older than Draynor Village.',
    blurb:
      "I have walked every road in Gielinor, fought Elvarg's kin and retired with a blue partyhat. Let's see how much of the lore you actually paid attention to.",
    ask: [
      'Tell me, do you remember how this tale goes?',
      'Here is one from my adventuring days.',
      'Did you read the quest dialogue, or hold spacebar?',
      'Now, where was I? Ah yes, answer me this.',
      'From the old chronicles: what do you make of this?',
    ],
    waiting: [
      'While we wait, would you like me to check your bank for junk?',
      'Still thinking? You lot take longer than Swan Song.',
      'Let me polish my spectacles while the rest of the table catches up.',
      'I have plenty of time. Though at my age, not *that* much time.',
    ],
    pace: {
      quick: [
        'Quick! Not even I cleared out Draynor Bank that fast.',
        'In a flash! A true Quest Point Cape wearer.',
        'Straight in! You didn’t even need to check the wiki guide.',
        'Sharp as a Saradomin strike! My knees wish they were that quick.',
      ],
      middling: [
        'A sensible walking pace. No need to burn your run energy.',
        'Answered in good time. Now let the youngsters catch up.',
        'Steady and sure, like an old campaigner.',
      ],
      late: [
        'Got that in just in time, before I nodded off in my rocking chair!',
        'Just in time! The curtain was nearly falling on the act.',
        'Squeezed your answer in just in time, like a last-second teleport!',
      ],
      early: [
        'Barely opened the scroll and you knew the lore!',
        'Youth! Always rushing ahead before the old man finishes speaking.',
        'Answered on the first line. You’ve done this quest before.',
      ],
      later: [
        'Had to dust off the back of your quest journal for that one, eh?',
        'Took a moment to recall the chapter. Wisdom is never rushed.',
        'Searched your memory carefully. I respect that.',
      ],
    },
    reveal: [
      'Here is how the tale goes.',
      'As written in the chronicles:',
      'I was there, you know.',
      'What says the quest journal?',
    ],
    verdict: {
      right: [
        'Well remembered! Worthy of the blue partyhat on my head.',
        'Spot on! You actually read the dialogue instead of holding spacebar.',
        'Correct! Two quest points and a bowl of monkfish stew for you.',
        'Exactly right! Dionysius himself is impressed.',
      ],
      partial: [
        'Close! You remembered the boss fight, even if you skimmed the plot.',
        'Half the tale right. The bards embellish the rest anyway.',
        'Nearly there! Old memories get a little fuzzy for me, too.',
      ],
      wrong: [
        'Rubbish! That is what happens when you spacebar through quests.',
        'Wrong! Even a Lumbridge goblin knows that bit of history.',
        'No, no. You have muddled up the Fourth Age with a pub rumour.',
        'Incorrect! Go talk to Reldo and read a book or two.',
      ],
      missed: [
        'No answer? And here I thought I was the one who naps mid-tale.',
        'Nothing at all? Did a highwayman outside Draynor rob your wits?',
        'You stood there in silence like a guard outside Varrock Palace.',
      ],
    },
    stem: 'text',
  },
  uris_unravelling: {
    id: 'uris_unravelling',
    label: 'Uri’s Unravelling',
    hint: 'Can you actually solve the clue without the help of a blinking yellow arrow?',
    host: { id: 'uri', name: 'Uri' },
    greeting: 'I once named a duck after a girl. Big mistake.',
    blurb:
      'No Runelite plugin or blinking yellow arrow to save you here. Only the clue scroll, your wits, and a man in a bowler hat.',
    ask: [
      'Put on your rune heraldic helm and unravel this.',
      'No yellow arrow for this step. Read the scroll.',
      'The Double Agent is down. Now solve this clue.',
      'Do a jig, equip your spade, and tell me this.',
      'Unravel this cipher before my smoke bomb clears.',
    ],
    waiting: [
      'Want to see me bend a spoon while the others finish thinking?',
      'Standing in the Kharidian Desert in a bowler hat builds patience.',
      'The others are still searching their bank for a mitre and a crozier.',
      'Do not mind me. I am simply waiting to vanish in a puff of smoke.',
    ],
    pace: {
      quick: [
        'Solved in a heartbeat, and without a clue helper plugin!',
        'Faster than a spade on a one-tick dig!',
        'Quick work, comrade. The Double Agent didn’t even finish spawning.',
        'Instant decode! You have memorized every anagram in Gielinor.',
      ],
      middling: [
        'Checked your sextant and chart at a measured pace.',
        'Unravelled cleanly. Keep your briefcase close while we wait.',
        'Steady work. Nobody had to trek back to the bank for a headband.',
      ],
      late: [
        'Finished the emote just in time before I vanished in smoke!',
        'Dug up the casket just in time!',
        'Unravelled it just in time - my smoke bomb was already in my hand.',
      ],
      early: [
        'Didn’t even need to read the second half of the riddle!',
        'Solved on the first glance! Have you done a thousand hard clues?',
        'You already had the emote items in your inventory, didn’t you?',
      ],
      later: [
        'Counted the letters on your fingers for the anagram? Sensible.',
        'Better to read the coordinates twice than dig up the wrong patch.',
        'Took your time. Probably forgot your spade at the bank.',
      ],
    },
    reveal: [
      'Open the casket.',
      'Here is what the scroll meant.',
      'Loser says what.',
      'The cipher unravels:',
    ],
    verdict: {
      right: [
        'Correct. Take your casket, may it be Ranger boots, not firelighters.',
        'Spot on, and not a blinking yellow arrow in sight.',
        'Well solved. I shall vanish in a puff of smoke now.',
        'Third-age material! You know your Treasure Trails by heart.',
      ],
      partial: [
        'Right coordinates, wrong step: you forgot to equip rune platelegs.',
        'Close! One pace off the dig spot.',
        'Half solved. You brought the crozier but forgot the headband.',
      ],
      wrong: [
        'Wrong spot! You just dug up an empty patch in the Wilderness.',
        'Incorrect. Enjoy your reward of 14 purple sweets and a longbow.',
        'No! Turn your clue plugin off more often, your skills are rusty.',
        'Wrong emote! Now the Double Agent is back for round two.',
      ],
      missed: [
        'Forgot to bring a spade? You stood there and never dug!',
        'No answer at all. The Double Agent knocked you back to Lumbridge.',
        'Silence? Even a mime clue requires an emote.',
      ],
    },
    stem: 'quote',
  },
  slayer_master: {
    id: 'slayer_master',
    label: 'Slayer Master',
    hint: 'A real slayer master knows the weaknesses, tasks, and the best way to bring down the monsters.',
    host: { id: 'konar_quo_maten', name: 'Konar quo Maten' },
    greeting: 'I need your help. There is balance to be brought.',
    blurb:
      'Every monster has a weakness, a Slayer level, and a lair where it belongs. Prove you know your quarry, adventurer.',
    ask: [
      'How do you bring this creature down, adventurer?',
      'A true slayer knows their quarry. Answer me this.',
      'Check your gear and task list: what is the answer?',
      'Before you descend into the dungeon, tell me this.',
      'What does a seasoned slayer make of this task?',
    ],
    waiting: [
      'Mount Karuulm has stood for millennia; we can wait for the others.',
      'Check that you brought your rock hammer while the others think.',
      'The others are still gearing up at the bank.',
      'Patience, slayer. Rushing into a lair unprepared is how slayers die.',
    ],
    pace: {
      quick: [
        'Swift and decisive! You knew that monster’s weakness at a glance.',
        'Clean strike! You did not waste a single combat tick.',
        'Fast work, adventurer. Worthy of a Brimstone key drop.',
        'Instant answer! You have clearly reached 99 Slayer.',
      ],
      middling: [
        'A measured strike. You checked the dungeon before charging in.',
        'Steady and prepared. Your gear tab is clearly in order.',
        'Answered with discipline. Let us wait for the rest of your party.',
      ],
      late: [
        'Struck the finishing blow just in time!',
        'Activated Protect from Melee just in time, adventurer!',
        'Got your answer in just in time before the dragonfire landed!',
      ],
      early: [
        'You knew the task before I even named the dungeon!',
        'Geared and ready on the first word. Impressive, slayer.',
        'Instant call! You did not even need to check the Slayer gem.',
      ],
      later: [
        'Took a moment to check whether you needed nosepeg or earmuffs. Wise.',
        'Better to double-check your gear at the bank than walk back.',
        'Deliberate and cautious. You will survive the Catacombs that way.',
      ],
    },
    reveal: [
      'Here is how the task is done.',
      'The Slayer codex says:',
      'Know your quarry:',
      'Open the Brimstone chest:',
    ],
    verdict: {
      right: [
        'Well struck, adventurer. Take a Brimstone key for your trouble.',
        'Flawless knowledge. Even Duradel would respect that answer.',
        'Correct! Your task is complete, and your streak grows stronger.',
        'Spot on. You know every weakness in the Slayer codex.',
      ],
      partial: [
        'You survived the task, though you brought the wrong combat style.',
        'Close, adventurer. You got the monster right, if not the detail.',
        'Partial credit. Next time, check your Slayer ring before you go.',
      ],
      wrong: [
        'You walked into dust devils without a facemask! Back to Lumbridge.',
        'Wrong! Did you try fighting gargoyles without a rock hammer?',
        'Incorrect, adventurer. You are fighting them in the wrong dungeon!',
        'No! Even Vannaka’s novices know better than to try that.',
      ],
      missed: [
        'You stood at the dungeon entrance and never drew your weapon!',
        'No answer, adventurer? Your slayer task remains unfinished.',
        'Hesitation in a slayer cave is fatal. Speak up next time.',
      ],
    },
    stem: 'text',
  },
  mark_the_map: {
    id: 'mark_the_map',
    label: 'Mark the Map',
    hint: 'Arr, ye a pirate? Show me where the treasure be.',
    host: { id: 'bill_teach', name: 'Bill Teach' },
    greeting: 'Ahoy, landlubber! Fetch me map and a pin.',
    blurb:
      'I need places to plunder, and you know the land. Help me find the places and I will share the loot with ye.',
    ask: [
      'Where be this spot on the chart, matey?',
      'Mark me the next place to plunder!',
      'Drop yer pin here and half the booty is yours.',
      'X marks the spot: where on the map does the X go?',
      'Point me helm toward this place, navigator!',
    ],
    waiting: [
      'Waiting on the rest of the crew to read the compass.',
      'Hurry it up, the Brimhaven pirates will beat us to the plunder!',
      'No peeking at a second world map, ye scurvy dog!',
      'Pouring meself a tot of Karamjan rum while the slowpokes squint.',
    ],
    pace: {
      quick: [
        'Pinned in a heartbeat! Ye must have raided that port yesterday!',
        'Faster than The Adventurous with a gale behind her sails!',
        'Sharp as a cutlass, matey! Born with a sea chart in yer hand.',
        'Instant pin! Ye know these waters better than Cap’n Hand.',
      ],
      middling: [
        'Steady as she goes, pin locked on the chart.',
        'A respectable pace for a landlubber! Now we wait on the crew.',
        'Course plotted! Keep the wheel steady while the others finish.',
      ],
      late: [
        'Dropped anchor just in time! We were about to sail past it.',
        'Got yer pin down just in time, like the last boat from Port Sarim!',
        'Just in time, ye barnacle! I was already raising the gangplank.',
      ],
      early: [
        'Pinned before I even unrolled the whole chart!',
        'Barely heard the name and yer pin was in the parchment!',
        'So early! Have ye buried treasure there yerself?',
      ],
      later: [
        'Searched every island and peninsula first. A thorough buccaneer.',
        'Took yer time with the sextant. Better than running aground!',
        'Slow on the compass, matey, but at least ye dropped anchor.',
      ],
    },
    reveal: [
      'Where did ye drop anchor?',
      'Where be the real spot?',
      'Roll out the captain’s chart!',
      'X marks this spot:',
    ],
    verdict: {
      right: [
        'Dead on the X! Break out the Braindeath rum, matey!',
        'Bullseye! Ye could steer The Adventurous through a fog bank.',
        'Right on the doubloon! Half the plunder is yours.',
        'Spot on! Finest navigator from Port Phasmatys to Mos Le’Harmless!',
      ],
      partial: [
        'Close! Within cannon shot of the target, at least.',
        'Not bad, only a short rowboat trip from where ye pinned!',
        'Right coastline, wrong cove! Still worth a share of the grog.',
      ],
      wrong: [
        'Arr, ye ran the ship straight into Karamja! Wrong side of the map!',
        'Way off course! Did ye hold the compass upside down, ye bilge rat?',
        'Wrong ocean entirely! Walk the plank for that one.',
        'Ye’d be digging in empty sand for a month at those coordinates!',
      ],
      missed: [
        'Never even dropped yer pin! Lost at sea without a rudder?',
        'Fell asleep in the crow’s nest! No pin, no share of the loot.',
        'Drifted right off the edge of the chart without marking a thing!',
      ],
    },
    stem: 'text',
  },
  random_events_only: {
    id: 'random_events_only',
    label: 'Random Events Only',
    hint: 'Nothing but random NPCs turning up with random questions.',
    host: { id: 'crowned_frog', name: 'The Frog' },
    greeting:
      'Ribbit. You adventurers kept clicking Dismiss on us, so tonight we brought the whole gang.',
    blurb:
      'One random event after another is about to pop up in a puff of smoke. Answer every last one of them, or I turn you into a frog.',
    ask: [
      'Poof! Look who just spawned beside you.',
      'No Dismiss button tonight. Hear them out!',
      'Another random event has tracked you down!',
      'Ribbit! Someone else just teleported into the inn.',
    ],
    waiting: [
      'Do not try to teleport away while the rest of the room answers.',
      'Polishing my crown while the others finish up. Ribbit.',
      'Hold still, the next random event is already queuing outside.',
      'Still waiting on a few of you. No frog tokens for stalling.',
    ],
    pace: {
      quick: [
        'Snapped that up faster than a frog’s tongue on a swamp fly!',
        'Quick! You didn’t even misclick Dismiss.',
        'Instant answer! A true friend of the Frog Realm.',
      ],
      middling: [
        'Answered politely and in good time. A royal nod to you.',
        'Nice steady hop! Waiting on the rest of the pond now.',
        'No fuss, no panic. Handled like a seasoned adventurer.',
      ],
      late: [
        'Answered just in time! You were one second away from the frog cave.',
        'Just in time! They were about to teleport you to ScapeRune.',
        'Got that in just in time before they despawned in a puff of smoke!',
      ],
      early: [
        'Answered before the smoke cloud even cleared!',
        'So early! You didn’t even ask for a frog token first.',
        'Instant reaction! You never ignore a random event, do you?',
      ],
      later: [
        'Stopped to check if they were giving out XP lamps first?',
        'Took your time. Making sure it wasn’t a River Troll, were you?',
        'Slow on the hop, but at least you didn’t ignore them.',
      ],
    },
    reveal: [
      'Back where they came from!',
      'And in a puff of smoke:',
      'Ribbit! Here is the answer:',
      'Off they hop!',
    ],
    verdict: {
      right: [
        'Royally done! Have a frog token and a kiss on the cheek.',
        'Spot on! You may keep your human legs for another question.',
        'Correct! The whole court of the Frog Realm applauds you.',
      ],
      partial: [
        'Half right. Worth a kebab and a warm beer, at least.',
        'Close enough! I will spare you the frog costume this time.',
        'Nearly there! Our visitor leaves reasonably satisfied.',
      ],
      wrong: [
        'Ribbit! Wrong! You are one step closer to a slimy green makeover.',
        'No, no! That is how people end up stranded on Bob’s Island.',
        'Incorrect! Keep answering like that and you’ll be catching flies.',
      ],
      missed: [
        'Ignored a random event?! Straight into the frog cave with you!',
        'You acted like you were AFK splashing rats! How rude.',
        'No answer at all! That is how your pickaxe head flies off.',
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
    greeting: 'Pull up a stool. Your room’s host scribbled a few questions of their own.',
    blurb:
      'Your host wrote these ones on the back of a beer mat. Whatever they ask, give it your best shot.',
    ask: [
      'Your host wrote this one. Have a go!',
      'A house special, straight from your host.',
      "Fresh off the back of your host's beer mat.",
      'Let’s see what your host cooked up for the table.',
    ],
    waiting: [
      'Your host is grinning behind their mug while the others think.',
      "I'll wipe down the bar while the rest of the table finishes.",
      "The table's still thinking. Another round of ales?",
    ],
    pace: {
      quick: [
        'Quick! Faster than it took your host to write it.',
        'Straight in! Your host didn’t stump you for a second.',
        'Fast work! Have a sip while the others scratch their heads.',
      ],
      middling: [
        'Answered at a comfortable pub pace.',
        'Locked in! Let’s see how the rest of the table handles it.',
        'In good time. The others are still squinting at it.',
      ],
      late: [
        'Just in time! Your host was already reaching for the bell.',
        'Got that in just in time, right before last orders!',
        'Slid across the table just in time!',
      ],
      early: [
        'Called it before the ink on the scroll even dried!',
        'Early! You clearly know how your host’s mind works.',
        'Instant answer! Did you peek over your host’s shoulder?',
      ],
      later: [
        'Had to read your host’s handwriting twice? Can’t blame you.',
        'Took a long hard look at that one. Tricky host!',
        'Left it late, but at least you got an answer on the coaster.',
      ],
    },
    reveal: ['What did your host write?', 'Drinks on the winner!', 'The house reveals:'],
    verdict: {
      right: [
        'Spot on! Your host owes you a pint for that one.',
        "Nailed it! Even a custom question couldn't trip you up.",
        'Dead right! You know your host’s tricks.',
      ],
      partial: [
        'Close enough for pub rules!',
        'Half marks. Your host will have to allow it.',
        'Nearly there! Worth half a pint, at least.',
      ],
      wrong: [
        'Ooh, walked right into your host’s trap!',
        'Wrong! You’re buying your host the next round.',
        'Not what was on the beer mat, I’m afraid!',
      ],
      missed: [
        'Stumped by your own host! Your ale’s gone flat.',
        'Nothing at all? Your host spent ages writing that one!',
        'Left your coaster blank while the clock ran out.',
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
      'A visitor has a question for the table.',
      'Hear out our guest before they vanish!',
    ],
    waiting: [
      "They'll be on their way once the rest of the table answers.",
      'Our visitor is tapping their foot waiting on the others.',
      'Nearly done with our unexpected guest.',
    ],
    pace: {
      quick: [
        'Quick! Our visitor barely finished spawning.',
        'Fast! Handled like a pro.',
        'Straight in! No XP waste on this interruption.',
      ],
      middling: [
        'Answered in good time. Our guest nods.',
        'A steady answer. Now we wait on the rest of the table.',
        'Sorted without a fuss.',
      ],
      late: [
        'Just in time! Our visitor was about to despawn.',
        'Got that in just in time before the door shut!',
        'Answered just in time - nearly missed your reward!',
      ],
      early: [
        'Answered before the smoke even cleared!',
        'So early! Our guest had barely opened their mouth.',
        'Instant answer! You know this visitor well.',
      ],
      later: [
        'Let them finish their whole speech first. Good manners.',
        'Took your time sizing up our visitor.',
        'Thought it over carefully before answering our guest.',
      ],
    },
    reveal: ['And off they go.', 'Back on the road with them.', 'Mind the door on your way out.'],
    verdict: {
      right: [
        'Our guest liked that answer! Enjoy the reward.',
        "Spot on! They'll leave you in peace with a prize.",
        'Correct! Off they go, happy as can be.',
      ],
      partial: [
        "Half an answer. They'll let you off with a warning.",
        'Close enough for a passing stranger.',
        'Nearly! Our guest shrugs and hands over half credit.',
      ],
      wrong: [
        'Wrong! Lucky they didn’t teleport you across Gielinor.',
        "Not what our visitor wanted to hear, I'm afraid.",
        'Incorrect! Our guest shakes their head and vanishes.',
      ],
      missed: [
        'Ignored our visitor completely! That’s how you get frog-ported.',
        'No answer at all. Our guest wandered off muttering.',
        'Left our visitor hanging in awkward silence.',
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
export const UPCOMING_MODES: {
  id: string
  label: string
  hint: string
  host: string
}[] = [
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
