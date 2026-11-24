import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'

export const mode: Mode = {
  id: 'minimap_guesser',
  label: 'Minimap Guesser',
  hint: 'Where in the name of Gielinor is that?',
  host: { id: 'captain_errdo', name: 'Captain Errdo' },
  greeting: "Climb aboard! Don't worry, I've only crashed once. Well, twice.",
  blurb:
    "My flight charts blew right out of the glider, so all we've got left is the minimap. Pin where you think we are; the closer your pin, the more points you score.",
  ask: [
    'Look down! Where in Gielinor are we?',
    'I think the wind spun my compass. Where is this?',
    'Recognize that patch of ground? Pin it on the map!',
    'Quick, where are we before I try to land?',
    "Next stop! Any idea what we're flying over?",
  ],
  waiting: [
    "I'll circle up here while the rest of you work it out.",
    'Take your time, this updraft will keep us aloft for a bit.',
    "Anyone got a toad crunchie? Looks like we're circling for a minute.",
    'If King Narnode asks, this extra lap was completely planned.',
  ],
  pace: {
    quick: [
      "Pinned before I could bank! You've flown this route before.",
      'Faster than dropping off the top of the Grand Tree!',
      "Didn't even need to turn the map right side up, eh?",
    ],
    middling: [
      'Got your pin. Nice and steady, just how I like my landings.',
      "Course locked in. Let's see where the others think we are.",
      "Fair enough, I'll hold this heading while the rest catch up.",
    ],
    late: [
      'Just in time! I was already bracing for another Karamja landing.',
      'Cut that a bit fine! I can practically touch the treetops.',
      'Got it in on the last updraft! Hold onto your hat.',
    ],
    early: [
      'Barely cleared the clouds and you already pinned it!',
      'That was instant! Have you walked every tile of Gielinor?',
      'Quick off the mark! Hope you actually checked which way north was.',
    ],
    later: [
      'Nothing wrong with taking a second look before we touch down.',
      'Checked every tree and river bend first, huh? Fair enough.',
      "Took the scenic route on that one, didn't you?",
    ],
  },
  reveal: ['We were flying over:', 'Right below us:', 'Touchdown at:', 'Turns out we were over:'],
  verdict: {
    right: [
      'Right on the mark! Smoother landing than I usually manage.',
      'Dead on! You should be flying out of Ta Quir Priw instead of me.',
      'Bang on! Next time you can take the stick.',
      'Exactly there! You know Gielinor from the air better than I do.',
    ],
    partial: [
      'Close enough! I can glide the rest of the way from there.',
      'Right neighbourhood, just got blown a few tiles off course.',
      "Not bad! We'll only have to walk a bit from where we land.",
    ],
    wrong: [
      "If I follow that pin, we're ending up in the Karamja shipyard again.",
      'Nowhere near! Were you holding the compass upside down?',
      "Wrong corner of Gielinor! Good thing I didn't start descending.",
      "Way off! Even a terrorbird with a blindfold would've got closer.",
    ],
    missed: [
      "No pin? Don't make me pick the landing spot, you won't like it.",
      "Nothing? Guess I'm circling until the wind dies down.",
      'Did you drop your map over the side? Not a single pin!',
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
