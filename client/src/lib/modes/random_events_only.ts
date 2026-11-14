import type { Mode } from '../modes'

export const mode: Mode = {
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
}
