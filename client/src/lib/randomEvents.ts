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
 * the rule its questions are written to (`ideas/architecture.md` §5), and the NPC picker
 * lists it in its select and on a face's tooltip.
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
  /**
   * Its questions are an item sketched as Pixel Hunt's Sketch draws it, generated from the
   * roster: it asks nothing else, so nobody can pick it to ask a question of their own.
   */
  sketches?: true
}

export const RANDOM_EVENTS: readonly RandomEventNpc[] = [
  {
    id: 'sandwich_lady',
    name: 'Sandwich Lady',
    theme: 'Cooking and food',
    right: 'Good choice, love! Have a fresh baguette for the road.',
    wrong: "Hey! I didn't say you could have that one! *WHACK*",
    asset: 'npc:sandwich_lady',
  },
  {
    id: 'lumbridge_cook',
    name: 'Lumbridge Cook',
    theme: 'Cooking and Recipe for Disaster',
    right: "Phew! You've saved the Duke's banquet once again!",
    wrong: "Oh dear, oh dear! The Duke's banquet is ruined!",
    asset: 'npc:lumbridge_cook',
  },
  {
    id: 'dr_jekyll',
    name: 'Dr Jekyll',
    theme: 'Herblore: potions and secondaries',
    right: 'Ah, thank you! That should keep Mr Hyde at bay.',
    wrong: "That's the wrong herb! Stand back, I'm turning!",
    asset: 'npc:dr_jekyll',
  },
  {
    id: 'bob',
    name: 'Evil Bob',
    theme: 'Fishing and cats',
    right: 'Meow! Fine, human. You may leave ScapeRune for now.',
    wrong: 'Hiss! Back to the uncooking pot with you, human!',
    asset: 'npc:bob',
  },
  {
    id: 'survival_expert',
    name: 'Survival Expert',
    theme: 'Woodcutting, Hunter and Firemaking',
    right: "Well done! You're ready to leave Tutorial Island.",
    wrong: "You've burnt the shrimps. Try again from the start.",
    asset: 'npc:survival_expert',
  },
  {
    id: 'drunken_dwarf',
    name: 'Drunken Dwarf',
    theme: 'Ales, kebabs, dwarves and pubs',
    right: 'Thatsh my matey! Here, have a kebab and a beer!',
    wrong: 'Oi! Are you insulting me? Catch this rock, matey!',
    asset: 'npc:drunken_dwarf',
  },
  {
    id: 'thurgo',
    name: 'Thurgo',
    theme: 'Mining and Smithing',
    right: 'Mmm! Almost as good as a fresh redberry pie.',
    wrong: '*stares blankly* No redberry pie, no smithing.',
    asset: 'npc:thurgo',
  },
  {
    id: 'genie',
    name: 'Genie',
    theme: 'Skills and experience',
    right: 'Your wish is granted! Put that XP lamp to good use.',
    wrong: "Sorry, master. Even my lamp can't fix that answer.",
    asset: 'npc:genie',
  },
  {
    id: 'sergeant_damien',
    name: 'Sergeant Damien',
    theme: 'Combat: gear, styles and bosses',
    right: 'Outstanding, maggot! Drop and give me twenty anyway!',
    wrong: 'Pathetic! Give me twenty star jumps, on the double!',
    asset: 'npc:sergeant_damien',
  },
  {
    id: 'krystilia',
    name: 'Krystilia',
    theme: 'Slayer and the Wilderness',
    right: 'Not bad. You might survive five minutes past the ditch.',
    wrong: 'Wrong. Enjoy the walk back from Lumbridge.',
    asset: 'npc:krystilia',
  },
  {
    id: 'ned',
    name: 'Ned',
    theme: 'Sailing',
    right: "Aye, she'll hold! All aboard the Lady Lumbridge!",
    wrong: "We've lost the rudder! Did you see that dragon?!",
    asset: 'npc:ned',
  },
  {
    id: 'death',
    name: 'Death',
    theme: 'Death and Prayer',
    right: 'Your time has not yet come, mortal. Back you go.',
    wrong: 'Welcome to my office. That will be 100,000 coins.',
    asset: 'npc:death',
  },
  {
    id: 'jane',
    name: 'Guildmaster Jane',
    theme: 'Farming',
    right: 'Lovely work! Ready to open your next seed pack?',
    wrong: 'Diseased again? Did you forget to pay the gardener?',
    asset: 'npc:jane',
  },
  {
    id: 'baba_yaga',
    name: 'Baba Yaga',
    theme: 'Magic and Runecrafting',
    right: 'Hee hee! Even my chicken-legged house approves.',
    wrong: "Wrong rune, dearie! Mind the house doesn't kick you.",
    asset: 'npc:baba_yaga',
  },
  {
    id: 'fairy_queen',
    name: 'Fairy Queen',
    theme: 'Fairy rings and Zanaris',
    right: 'Well done, human. The fairy rings are yours to use.',
    wrong: 'Careful, human. You nearly dialled the Gorak plane.',
    asset: 'npc:fairy_queen',
  },
  {
    id: 'reldo',
    name: 'Reldo',
    theme: 'Names, spelling and history',
    right: 'Ah, someone who actually reads the palace library!',
    wrong: 'Check the third bookcase on the left and try again.',
    asset: 'npc:reldo',
  },
  {
    id: 'certer',
    name: 'Certer',
    theme: 'Items from their outline',
    right: "Spot on! Just checking you're not a macro, mate.",
    wrong: 'Not quite, mate. Niles and Miles will laugh at that.',
    asset: 'npc:certer',
    sketches: true,
  },
]

/** The NPCs a host or a player may name to ask a question of their own. */
export const ASKERS: readonly RandomEventNpc[] = RANDOM_EVENTS.filter((npc) => !npc.sketches)

/** The Mysterious Old Man's id: the face of an NPC this build has no entry or art for. */
export const STRANGER = 'mysterious_old_man'

const BY_ID = new Map(RANDOM_EVENTS.map((npc) => [npc.id, npc]))

/** The card for an id this build has no entry for (§7.4 of ideas/design.md). */
function stranger(id: string): RandomEventNpc {
  return {
    id,
    name: 'Mysterious Old Man',
    theme: 'Anything at all',
    right: 'Well done! Here is a strange box for your trouble.',
    wrong: 'Wrong answer! Now your strange box is multiplying.',
    asset: `npc:${STRANGER}`,
  }
}

/** The NPC for `OpenQuestion.random_event`, or the Mysterious Old Man for an id unknown here. */
export function randomEventFor(id: string): RandomEventNpc {
  return BY_ID.get(id) ?? stranger(id)
}
