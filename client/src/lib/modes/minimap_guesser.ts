import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'

export const mode: Mode = {
  id: 'minimap_guesser',
  label: 'Minimap Guesser',
  hint: 'Where in the name of Gielinor is that?',
  host: { id: 'captain_errdo', name: 'Captain Errdo' },
  greeting: 'Strap in, passenger! We fly by minimap today.',
  blurb:
    'My glider charts are blown overboard, and all I have left is the minimap. Look at each one and pin where we are; the closer your pin, the more points you earn.',
  ask: [
    'This is what I see below. Where are we?',
    'Quick, which landing field is this?',
    'The fog lifts for a moment. Pin us on the map!',
    'Below us now. Where do I set her down?',
    'I spy rooftops. Whose rooftops?',
  ],
  waiting: [
    'Holding a steady glide while the others look.',
    'Mind the propeller. It is not a propeller, but mind it anyway.',
    'Feel that updraft? Lovely. Take your time.',
    'I could circle all day. The passengers would rather I did not.',
  ],
  pace: {
    quick: [
      'Pinned before I banked! You have flown this route before.',
      'A natural navigator. Gnome blood, perhaps?',
      'Fast as a glider off the Grand Tree.',
    ],
    middling: [
      'Course plotted. Smooth flying.',
      'A steady hand on the chart. I like it.',
      'Noted. We will be on the ground in no time.',
    ],
    late: [
      'Pinned just before we ran out of sky!',
      'Close one. I could see the treetops.',
      'Plotted on the last gust. Hold on tight.',
    ],
    early: [
      'Pinned before the minimap finished drawing!',
      'A quick glance and done. Brave, or lucky?',
      'So fast! Did you peek out of the window?',
    ],
    later: [
      'You studied every pixel. A careful passenger.',
      'Slow and sure. Good for landings.',
      'Took the scenic route, did we?',
    ],
  },
  reveal: ['We were flying over:', 'Down below was:', 'Landing at:', 'The chart says:'],
  verdict: {
    right: [
      'Spot on! I would land there blindfolded.',
      'Exactly where we were. Have a co-pilot badge.',
      'Perfect navigation. The Grand Tree salutes you.',
    ],
    partial: [
      'Close. I could glide there from your pin.',
      'Right region, a few gusts off.',
      'Near enough to wave at it.',
    ],
    wrong: [
      'We would have landed in the sea!',
      'That is the wrong side of the world, passenger.',
      'If I flew to your pin, we would still be lost.',
    ],
    missed: [
      'No pin? Then where do I land?',
      'You left the chart blank. I will circle again.',
      'Asleep in the back seat, were we?',
    ],
  },
  stem: 'minimap',
}

export const hints: FieldHints = {
  prompt: 'Where is this?',
  explanation: 'The fountain in the middle of Varrock Square.',
}

export const card: SuggestCard = {
  place: 20,
  hint: 'Pick a spot on the map and turn its minimap, for players to find.',
}
