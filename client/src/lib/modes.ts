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
  /** Once you have answered, while the room catches up. */
  waiting: string[]
  /** On the reveal, before the explanation. */
  reveal: string[]
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
 * The lines `lines` says around question `at`, the same on every screen in the room.
 *
 * Each kind of line is shuffled once per round, seeded by the round's start, and the round's
 * questions walk through the shuffle in order. Any two questions fewer than a list's length
 * apart get different lines, so neighbours never repeat, a random event between them or not.
 */
export function pickLines(lines: HostLines, at: Placed): Spoken {
  const step = Math.max(0, at.index - at.segment.start)
  const pick = (kind: keyof Spoken): string => {
    const list = lines[kind]
    const order = shuffled(list.length, `${lines.host.id}:${kind}:${at.segment.start}`)
    return list[order[step % list.length] ?? 0] ?? ''
  }
  return { ask: pick('ask'), waiting: pick('waiting'), reveal: pick('reveal') }
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
   * How the question's picture shows: `shadow` draws it large with the name under it on the
   * reveal, and while a question picked from the list is open fills its outline with the
   * theme's `--silhouette`. Left out, as it is.
   */
  picture?: 'shadow'
}

/**
 * The stems a mode can name. Five modes answer on the same four buttons, and this is
 * what keeps them from looking alike: Bestiary asks in a sentence, Drop Table shows an
 * item, Who Said That? a line in a chatbox. Each id is one component under
 * `components/questions/stems/`, and a new one lands with the first mode that needs it.
 */
export type StemId = 'text' | 'asset' | 'examine' | 'quote' | 'more_less' | 'price'

/** The inn's own: the host's questions, and any round this build has no host for. */
export const INNKEEPER: Host = { id: 'innkeeper', name: 'The Innkeeper' }

/** What a mode this build does not know is presented with. It makes up no blurb. */
export const GENERIC_HOST: HostLines = {
  host: INNKEEPER,
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
  reveal: ["Let's see how you did.", "Here's the answer.", 'Right, the answer.'],
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
    reveal: [
      'Who knows the value of things?',
      'Ali was right, of course.',
      'The scales do not lie.',
      'A fair price, my friend!',
    ],
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
    reveal: [
      'Your offer has completed.',
      'The market has spoken.',
      'Please collect your coins.',
      'Thank you for trading.',
    ],
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
    reveal: [
      'Let us mark your paper.',
      'Time is up. Papers, please.',
      'Let us see the answer key.',
      'The marking is done.',
    ],
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
    reveal: [
      'Let us check the records.',
      'Back in their proper places.',
      'The archives agree.',
      'Now for the right order.',
    ],
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
    reveal: [
      'Squawk! The answer!',
      'Squawk! Polly knew it!',
      'Who said it? This one!',
      'Pieces of eight! Squawk!',
    ],
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
    reveal: [
      'Now you know. Or always knew.',
      'The truth was always there.',
      'Was it ever really a question?',
      'Knowledge is a stream.',
    ],
    // Quotes and plain trivia share the round; the stem tells them apart by `quote`.
    stem: 'quote',
  },
  bestiary: {
    id: 'bestiary',
    label: 'Bestiary',
    hint: 'Combat levels, weaknesses and haunts of the monsters.',
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
    reveal: [
      "Let's check the plaque.",
      'Says so right here in my book.',
      "That's the one on the sign.",
      'Back in its pen, that one.',
    ],
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
    reveal: [
      'The loot is on the floor.',
      'Check your loot.',
      'Did you get the drop?',
      'Task complete.',
    ],
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
    reveal: [
      "Told you it didn't fit.",
      'That one goes in the corner.',
      "Even I'd have got that.",
      'The odd one, out!',
    ],
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
    reveal: [
      'The game has ended! Who won?',
      'Tickets are on the way.',
      "Time's up! Flags down!",
      "Let's see the scoreboard.",
    ],
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
    reveal: [
      'Signed, sealed, delivered.',
      'Delivered! Right on time.',
      "Here's the name on the label.",
      'Got the address now.',
    ],
    // The prompt is the same line every time; the shadow under it is the question.
    stem: 'text',
    picture: 'shadow',
  },
  // Only on a server that switched it on, for testing the NPCs' questions in a row.
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
    reveal: ['And off they go.', 'Back on the road with them.', 'Next visitor, please.'],
    stem: 'text',
  },
  // Never offered as a round: the host's questions are random events inside other rounds.
  // It is here for the stem those questions are drawn with, and for the splash of a room
  // created when custom questions were a round of their own, and still plays them as one.
  custom: {
    id: 'custom',
    label: "Host's Questions",
    hint: 'Questions the host wrote for this room.',
    host: INNKEEPER,
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
    reveal: ["Who's buying the next round?", 'Drinks on the winner!', 'The house has the answer.'],
    // Every type a host can write asks in a sentence; the view below it is the answer.
    stem: 'text',
  },
  // Never a round either: the NPCs' own questions, each asked by the NPC it was written
  // for (`lib/randomEvents.ts`, `components/RandomEvent.svelte`). Here for its stem.
  random_event: {
    id: 'random_event',
    label: 'Random Event',
    hint: 'An NPC interrupts the round with a question of their own.',
    host: INNKEEPER,
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
    reveal: ['And off they go.', 'Back on the road with them.', 'Mind the door on your way out.'],
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
    id: 'pixel_hunt',
    label: 'Pixel Hunt',
    hint: 'How fast can you recognize the item?',
    host: 'sherlock',
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
 * Who presents mode `id`, and their lines: the innkeeper's generic ones for a mode this
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
