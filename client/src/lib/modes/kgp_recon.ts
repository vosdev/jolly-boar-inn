import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'

export const mode: Mode = {
  id: 'kgp_recon',
  label: 'KGP Recon',
  hint: 'Somewhere in Gielinor, a penguin took a photo. Pin the spot on the map.',
  host: { id: 'kgp_agent', name: 'KGP Agent' },
  greeting: 'Psst. Over here, by the crates. You were not followed?',
  blurb:
    'Our agents have photographed every corner of Gielinor. Look at each recon photo and pin where it was taken; the closer your pin, the more points you earn.',
  ask: [
    'A fresh photo from the field. Where was it taken?',
    'Our agent snapped this behind enemy lines.',
    'This came in by gull. Pin it before the humans do.',
    'Study the photo, then tell Command where it is.',
    'Our agent risked a flipper for this. Where is it?',
  ],
  waiting: [
    'Waiting on the rest of the cell to finish their reports.',
    'Keep your voice down. The zookeeper has ears everywhere.',
    'No asking the humans for directions, comrade.',
    'I will polish my binoculars while the slow ones squint.',
  ],
  pace: {
    quick: [
      'Pinned at once! You must have stood there yourself.',
      'Faster than a penguin down an icy slope. Command is pleased.',
      'Instant. Are you sure you are not one of ours?',
    ],
    middling: [
      'Report filed. A steady agent is a living agent.',
      'Pinned in good time. Now we wait for the others.',
      'Noted, comrade. Your pin goes in the dossier.',
    ],
    late: [
      'Filed just before the courier left. Close!',
      'Pinned on the whistle. The humans nearly caught you.',
      'Cutting it fine, comrade. Command does not like fine.',
    ],
    early: [
      'Pinned before the photo had dried!',
      'You barely looked. Bold, or reckless?',
      'So quick! Were you the one holding the camera?',
    ],
    later: [
      'You searched every map square first. Thorough. Good.',
      'Slow, but a careful agent lives to file another report.',
      'Took your time. The photo was not going anywhere.',
    ],
  },
  reveal: [
    'Here is where our agent stood:',
    'The dossier says:',
    'Declassified:',
    'The photo was taken here:',
  ],
  verdict: {
    right: [
      'Exactly there! You will make a fine field agent.',
      'Right on the spot. Command will hear of this.',
      'Perfect intelligence, comrade. Have a fish.',
      'Pinned it! The invasion maps will be accurate.',
    ],
    partial: [
      'Close. Our agent could have waddled there by tea time.',
      'Near enough to see it with good binoculars.',
      'Right area, wrong street. Still useful intelligence.',
    ],
    wrong: [
      'That is the wrong side of Gielinor, comrade!',
      'If our agents followed your pin, they would be lost for weeks.',
      'Bad intelligence. This report goes in the bin.',
      'Not even close. Were you looking at the photo upside down?',
    ],
    missed: [
      'No pin at all? An agent who files nothing is no agent.',
      'You left the report blank. Command is disappointed.',
      'Did the zookeeper catch you? Nothing came through.',
    ],
  },
  stem: 'photo',
}

export const hints: FieldHints = {
  prompt: 'Where was this photo taken?',
  explanation: 'The fountain and the Blue Moon Inn sign give it away.',
}

export const card: SuggestCard = {
  place: 17,
  hint: 'Your own screenshot from somewhere on the map, for players to pin.',
}
