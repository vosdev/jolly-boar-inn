import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'

export const mode: Mode = {
  id: 'lost_in_gielinor',
  label: 'Lost in Gielinor',
  hint: 'Hans has wandered off. Follow his clues and find him.',
  host: { id: 'hans', name: 'Hans' },
  greeting: 'Hello? Is someone there? This is not the castle courtyard.',
  blurb:
    "I only meant to walk round the castle once more, and now I've no idea where I am. I'll tell you what I can see; pin where you think I am, and the closer your pin, the more points you score.",
  ask: [
    'Where am I? This is not Lumbridge.',
    'I took a wrong turn. Where could I be?',
    'Help! Pin me on the map, please.',
    'The Duke will be furious. Where am I?',
    'I followed a chicken. Where did it take me?',
  ],
  waiting: [
    "I'll just sit on this rock until everyone finds me.",
    'No rush. I have walked in circles for ages anyway.',
    'If you see the Duke, tell him I am on a long lunch.',
    'Is that a goblin? No, a bush. Probably a bush.',
  ],
  pace: {
    quick: [
      'Found me already! Have you been following me?',
      'That was fast! You know Gielinor better than I do.',
      'Pinned in a flash! I barely finished my sentence.',
      'Quick as a cart horse! Well, quicker than me.',
    ],
    middling: [
      'Got me! Now we wait for the rest of the search party.',
      'A steady pace. Much steadier than my walking.',
      'Pin placed! I will try not to wander off again.',
    ],
    late: [
      'Just in time! I was about to wander somewhere else.',
      'Phew! I thought nobody was coming.',
      'Right on the bell! I had started talking to a tree.',
    ],
    early: [
      'Found me before I finished describing it!',
      'You knew where I was before I did!',
      'Already? Have you been here before?',
    ],
    later: [
      'You took the scenic route. So did I.',
      'Thorough! You checked everywhere I am not.',
      'Slow and careful. I like that in a search party.',
    ],
  },
  reveal: [
    'So that is where I was!',
    'Here I am, all this time:',
    'Ah, it all makes sense now:',
    'Found him! I mean, me:',
  ],
  verdict: {
    right: [
      'You found me! I could hug you. I will not, but I could.',
      'Right where I was standing! What a tracker.',
      'Spot on! Now, which way is Lumbridge?',
      'Found me! The Duke owes you a medal.',
    ],
    partial: [
      'Close! I could almost hear you calling my name.',
      'Nearly! Just a short walk away. Even I could manage it.',
      'Warm, very warm! Just over the next hill.',
    ],
    wrong: [
      'Not there! I would never walk that far. Would I?',
      'Way off! You are as lost as I am.',
      'Wrong side of the map! We are both lost now.',
      'Nope! I have never even heard of that place.',
    ],
    missed: [
      'No pin? Did you get lost too?',
      'You never looked for me! I am wounded.',
      'No pin at all. I will just stay here, then. Alone.',
    ],
  },
  stem: 'text',
}

export const hints: FieldHints = {
  prompt: 'Big white walls, knights in white armour, and moles in the park. Nice castle. Not mine.',
  explanation: 'The White Knights guard Falador, and the Giant Mole digs under Falador Park.',
}

export const card: SuggestCard = {
  place: 21,
  hint: 'A place on the world map that Hans describes without naming it.',
}
