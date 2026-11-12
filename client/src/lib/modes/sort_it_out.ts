import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
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
}

export const hints: FieldHints = {
  prompt: 'Sort these bosses by release date, from oldest to newest.',
  explanation:
    'Zulrah came out on 8 January 2015, Vorkath on 4 January 2018 and Nex on 5 January 2022.',
}

export const sample: Sample = {
  mode: 'sort_it_out',
  type: 'ordering',
  view: {
    prompt: 'Which three of these fish heal the most, best first?',
    ends: ['Heals most', 'Heals least'],
    picks: 3,
    entries: [
      { text: 'Lobster' },
      { text: 'Shrimps' },
      { text: 'Shark' },
      { text: 'Trout' },
      { text: 'Swordfish' },
    ],
  },
  reveal: [
    { rank: 3, detail: 'Heals 12' },
    { rank: 5, detail: 'Heals 3' },
    { rank: 1, detail: 'Heals 20' },
    { rank: 4, detail: 'Heals 7' },
    { rank: 2, detail: 'Heals 14' },
  ],
}

export const card: SuggestCard = { place: 16, hint: 'Something worth putting in order.' }
