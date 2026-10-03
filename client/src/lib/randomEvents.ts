/**
 * Who interrupts a round, in words: the NPC's name, what it asks about, what it says to
 * your answer, and where its picture will come from.
 *
 * The server knows these NPCs by id and nothing else (`server/app/random_events.py`), and
 * sends the id as `OpenQuestion.random_event`. Everything a player reads about them is
 * copy, and copy is the client's, the same deal `lib/modes.ts` has for modes. The ids here
 * are the roster's, in its order, and `server/tests/test_random_events.py` fails the build
 * when the two lists disagree.
 *
 * One flat array, one entry per NPC, so adding one is an entry here, an id there and a
 * file of questions, with no cleverness anywhere. Each question opens with its own
 * `intro`, so the NPC's lines here are for the reveal, where there is time to read them:
 * `right` or `wrong`, short, in the game's voice, the way its dialogue boxes put it. `theme` is
 * the rule its questions are written to (`ideas/random-events.md`), and the NPC picker
 * shows it next to the name.
 *
 * `asset` is the picture's reference, `npc:<id>`: `lib/npcs.ts` finds the file by that id.
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
  /** What it says in the reveal to anybody whose answer scored. */
  right: string
  /** What it says to anybody whose answer scored nothing, or who gave none. */
  wrong: string
  /** `npc:<id>`: the picture, once there is one. */
  asset: string
}

export const RANDOM_EVENTS: readonly RandomEventNpc[] = [
  {
    id: 'sandwich_lady',
    name: 'Sandwich Lady',
    theme: 'Cooking and food',
    right: 'See? Brain food. Have a baguette, dear.',
    wrong: 'No sandwich for you, then. Not even a chocolate bar.',
    asset: 'npc:sandwich_lady',
  },
  {
    id: 'lumbridge_cook',
    name: 'Lumbridge Cook',
    theme: 'Cooking, and Recipe for Disaster',
    right: 'You remembered! The council might be saved yet!',
    wrong: 'Oh dear, oh dear. The council stays frozen.',
    asset: 'npc:lumbridge_cook',
  },
  {
    id: 'dr_jekyll',
    name: 'Dr Jekyll',
    theme: 'Herblore: potions and their secondaries',
    right: "Yes, yes, that's it! Hyde stays put... for now.",
    wrong: 'No, no, NO! I can feel him coming...',
    asset: 'npc:dr_jekyll',
  },
  {
    id: 'bob',
    name: 'Bob',
    theme: 'Fishing, and cats',
    right: 'Hmph. Not entirely useless, for a two-legs.',
    wrong: 'As expected. Humans.',
    asset: 'npc:bob',
  },
  {
    id: 'survival_expert',
    name: 'Survival Expert',
    theme: 'Woodcutting, Hunter and Firemaking',
    right: "Good. You'd last a night out there.",
    wrong: "You wouldn't last a night out there.",
    asset: 'npc:survival_expert',
  },
  {
    id: 'drunken_dwarf',
    name: 'Drunken Dwarf',
    theme: 'Ales, kebabs, dwarves and pubs',
    right: 'Thatsh my mate! Have a kebab!',
    wrong: 'Ish wrong! Ah, never mind. Have a kebab anyway.',
    asset: 'npc:drunken_dwarf',
  },
  {
    id: 'thurgo',
    name: 'Thurgo',
    theme: 'Mining and Smithing',
    right: "Clever! That's worth a redberry pie, that is.",
    wrong: 'Hmph. Not even worth a redberry pie.',
    asset: 'npc:thurgo',
  },
  {
    id: 'genie',
    name: 'Genie',
    theme: 'Skills and experience',
    right: 'Splendid, master! A lamp may yet find you.',
    wrong: 'Alas, master. No lamp for you today.',
    asset: 'npc:genie',
  },
  {
    id: 'sergeant_damien',
    name: 'Sergeant Damien',
    theme: 'Combat: gear, styles and bosses',
    right: "Not bad, maggot! Don't let it go to your head!",
    wrong: 'Drop and give me fifty, maggot!',
    asset: 'npc:sergeant_damien',
  },
  {
    id: 'wise_old_man',
    name: 'Wise Old Man',
    theme: 'Quests and lore',
    right: 'Well remembered. There is hope for you yet.',
    wrong: 'Hmm. Perhaps read your quest journal next time.',
    asset: 'npc:wise_old_man',
  },
  {
    id: 'krystilia',
    name: 'Krystilia',
    theme: 'Slayer and the Wilderness',
    right: 'Good. You might survive past the ditch.',
    wrong: 'Stay on this side of the ditch for now.',
    asset: 'npc:krystilia',
  },
  {
    id: 'ned',
    name: 'Ned',
    theme: 'Sailing',
    right: "Ha! You've got your sea legs after all!",
    wrong: 'Best stay ashore, I think.',
    asset: 'npc:ned',
  },
  {
    id: 'death',
    name: 'Death',
    theme: 'Death and Prayer',
    right: 'Hm. Another time, then.',
    wrong: "I'll be seeing you soon.",
    asset: 'npc:death',
  },
  {
    id: 'jane',
    name: 'Guildmaster Jane',
    theme: 'Farming',
    right: "Hmph. Maybe you won't faint after all.",
    wrong: 'Off my allotment. Go and read a seed packet.',
    asset: 'npc:jane',
  },
  {
    id: 'baba_yaga',
    name: 'Baba Yaga',
    theme: 'Magic and Runecrafting',
    right: 'Wonderful! My hut does a little dance for you.',
    wrong: 'Tsk. Even my hut knew that one.',
    asset: 'npc:baba_yaga',
  },
]

/** The Mysterious Old Man's id: the face of an NPC this build has no entry or art for. */
export const STRANGER = 'mysterious_old_man'

const BY_ID = new Map(RANDOM_EVENTS.map((npc) => [npc.id, npc]))

/** The card for an id this build has no entry for (§7.4 of ideas/design.md). */
function stranger(id: string): RandomEventNpc {
  return {
    id,
    name: 'Mysterious Old Man',
    theme: 'Anything at all',
    right: 'Very good. I’ll be on my way, then.',
    wrong: 'Oh dear. I’ll be on my way, then.',
    asset: `npc:${STRANGER}`,
  }
}

/** The NPC for `OpenQuestion.random_event`, or the Mysterious Old Man for an id unknown here. */
export function randomEventFor(id: string): RandomEventNpc {
  return BY_ID.get(id) ?? stranger(id)
}
