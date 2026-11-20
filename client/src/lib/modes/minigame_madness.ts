import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'minigame_madness',
  label: 'Minigame Madness',
  hint: 'Every lobby in Gielinor, from Castle Wars to Tempoross.',
  host: { id: 'lanthus', name: 'Lanthus' },
  greeting:
    "Are you team Castle Wars, Barbarian Assault or Pest Control? It doesn't matter tonight. Everyone's on the quiz team!",
  blurb:
    "I've watched every minigame lobby in Gielinor fill up. Rewards, points, and strategies — let's see what you know.",
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
    "Please don't leave on Wave 9 while we wait.",
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
      'Slipped through the portal right before the game started!',
      'Got the flag home right on the whistle!',
      'Repaired the barricade with a tick to spare! Close call.',
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
      'Clean win! The Void Knight lived with full hitpoints.',
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
}

export const hints: FieldHints = {
  prompt: 'Which minigame gives the Ash covered tome?',
  explanation: 'Volcanic Mine: Petrified Pete sells it for 40,000 points.',
}

export const sample: Sample = {
  mode: 'minigame_madness',
  type: 'multiple_choice',
  view: {
    prompt: 'Which minigame rewards the Fire cape?',
    options: ['Pest Control', 'The Fight Caves', 'Barbarian Assault', 'Castle Wars'],
  },
  answer: 1,
}

export const card: SuggestCard = { place: 6 }
