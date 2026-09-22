/**
 * Who interrupts a round, in words: the NPC's name, what it asks about, the line it opens
 * with, and where its picture will come from.
 *
 * The server knows these NPCs by id and nothing else (`server/app/random_events.py`), and
 * sends the id as `OpenQuestion.random_event`. Everything a player reads about them is
 * copy, and copy is the client's, the same deal `lib/modes.ts` has for modes. The ids here
 * are the roster's, in its order, and `server/tests/test_random_events.py` fails the build
 * when the two lists disagree.
 *
 * One flat array, one entry per NPC, so adding one is an entry here, an id there and a
 * file of questions, with no cleverness anywhere. The line is the NPC speaking, before
 * the question: short, in the game's voice, the way its dialogue boxes put it. `theme` is
 * the rule its questions are written to (`ideas/random-events.md`), and T30's NPC picker
 * shows it next to the name.
 *
 * `asset` is the picture's reference. The drawings are design D15, and until they land the
 * card leaves the picture's slot empty rather than drawing a stand-in.
 *
 * An id this build has no entry for gets the Mysterious Old Man (`randomEventFor`): the NPC
 * who, in the game, turns up to take you away to a random event, and here stands in for
 * any NPC from a newer server. That is the same honest fallback `viewFor` makes for a mode
 * it cannot draw, and like that one it says nothing alarming about it.
 */

export interface RandomEventNpc {
  id: string
  /** As the card prints it. */
  name: string
  /** What it asks about, in a few words. */
  theme: string
  /** What it says before the question. */
  line: string
  /** `npc:<id>`: the picture, once there is one (D15). */
  asset: string
}

export const RANDOM_EVENTS: readonly RandomEventNpc[] = [
  {
    id: 'sandwich_lady',
    name: 'Sandwich Lady',
    theme: 'Cooking and food',
    line: 'You look hungry to me. I tell you what - answer me this, and the next one is on me.',
    asset: 'npc:sandwich_lady',
  },
  {
    id: 'lumbridge_cook',
    name: 'Lumbridge Cook',
    theme: 'Cooking, and Recipe for Disaster',
    line: "What am I to do? The council is frozen solid and I can't remember a thing!",
    asset: 'npc:lumbridge_cook',
  },
  {
    id: 'dr_jekyll',
    name: 'Dr Jekyll',
    theme: 'Herblore: potions and their secondaries',
    line: 'Quickly, before he wakes! Help me with my... medicines.',
    asset: 'npc:dr_jekyll',
  },
  {
    id: 'bob',
    name: 'Bob',
    theme: 'Fishing, and cats',
    line: "Meow. Oh, it's you. Fine, I'll speak slowly, human.",
    asset: 'npc:bob',
  },
  {
    id: 'tree_spirit',
    name: 'Tree Spirit',
    theme: 'Woodcutting, Hunter and Firemaking',
    line: 'You dare take an axe to my forest? Prove you know it first!',
    asset: 'npc:tree_spirit',
  },
  {
    id: 'drunken_dwarf',
    name: 'Drunken Dwarf',
    theme: 'Ales, kebabs, dwarves and pubs',
    line: "'Ere, ish you! Me besht mate! Anshwer me thish one...",
    asset: 'npc:drunken_dwarf',
  },
  {
    id: 'alfred',
    name: 'Alfred Grimhand',
    theme: 'Ales and pubs',
    line: "Finished the barcrawl, have you? Let's see if you remember a single pint of it.",
    asset: 'npc:alfred',
  },
  {
    id: 'thurgo',
    name: 'Thurgo',
    theme: 'Mining and Smithing',
    line: "Oh, a visitor! You haven't got a redberry pie on you, have you?",
    asset: 'npc:thurgo',
  },
  {
    id: 'genie',
    name: 'Genie',
    theme: 'Skills and experience',
    line: 'Greetings, master! Answer well, and perhaps a lamp will find its way to you.',
    asset: 'npc:genie',
  },
  {
    id: 'sergeant_damien',
    name: 'Sergeant Damien',
    theme: 'Combat: gear, styles and bosses',
    line: 'Private! On your feet! Answer me this, maggot!',
    asset: 'npc:sergeant_damien',
  },
  {
    id: 'wise_old_man',
    name: 'Wise Old Man',
    theme: 'Quests and lore',
    line: 'Ah, a young adventurer. Let us see what all that questing has taught you.',
    asset: 'npc:wise_old_man',
  },
  {
    id: 'krystilia',
    name: 'Krystilia',
    theme: 'Slayer and the Wilderness',
    line: 'Heading over the ditch? Answer me this first. It might save your life.',
    asset: 'npc:krystilia',
  },
  {
    id: 'ned',
    name: 'Ned',
    theme: 'Sailing',
    line: 'Why, hello there! Before we set sail, tell me what you know of the sea.',
    asset: 'npc:ned',
  },
  {
    id: 'death',
    name: 'Death',
    theme: 'Death and Prayer',
    line: "Ah. You again. Sit down, mortal - this won't take long.",
    asset: 'npc:death',
  },
  {
    id: 'jane',
    name: 'Guildmaster Jane',
    theme: 'Farming',
    line: "Don't just stand there on my allotment. Answer me this!",
    asset: 'npc:jane',
  },
  {
    id: 'baba_yaga',
    name: 'Baba Yaga',
    theme: 'Magic and Runecrafting',
    line: 'Come in, come in! My hut is in a good mood today. Let us talk runes.',
    asset: 'npc:baba_yaga',
  },
]

const BY_ID = new Map(RANDOM_EVENTS.map((npc) => [npc.id, npc]))

/** The card for an id this build has no entry for (design D15, §7.4 of ideas/design.md). */
function stranger(id: string): RandomEventNpc {
  return {
    id,
    name: 'Mysterious Old Man',
    theme: 'Anything at all',
    line: 'Oh, hello there. You don’t mind if I ask you something?',
    asset: 'npc:mysterious_old_man',
  }
}

/** The NPC for `OpenQuestion.random_event`, or the Mysterious Old Man for an id unknown here. */
export function randomEventFor(id: string): RandomEventNpc {
  return BY_ID.get(id) ?? stranger(id)
}
