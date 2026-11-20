import type { Mode, SuggestCard } from '../modes'

export const mode: Mode = {
  id: 'mark_the_map',
  label: 'Mark the Map',
  hint: 'Arr, ye a pirate? Show me where the treasure be.',
  host: { id: 'bill_teach', name: 'Bill Teach' },
  greeting: 'Ahoy, landlubber! Fetch me map and a pin.',
  blurb:
    "I need places to plunder, and you know the land. Point me in the right direction and I'll share the loot with ye.",
  ask: [
    'Where be this spot on the chart, matey?',
    'Mark me the next place to plunder!',
    'Drop yer pin here and half the booty is yours.',
    'X marks the spot: where on the map does the X go?',
    'Point me helm toward this place, navigator!',
  ],
  waiting: [
    'Waiting on the rest of the crew to read the compass.',
    'Hurry it up, the Brimhaven pirates will beat us to the plunder!',
    'No peeking at a second world map, ye scurvy dog!',
    'Pouring meself a tot of Karamjan rum while the slowpokes squint.',
  ],
  pace: {
    quick: [
      'Pinned in a heartbeat! Ye must have raided that port yesterday!',
      'Faster than The Adventurous with a gale behind her sails!',
      'Sharp as a cutlass, matey! Born with a sea chart in yer hand.',
      'Instant pin! Ye know these waters better than Cap’n Hand.',
    ],
    middling: [
      'Steady as she goes, pin locked on the chart.',
      'A respectable pace for a landlubber! Now we wait on the crew.',
      'Course plotted! Keep the wheel steady while the others finish.',
    ],
    late: [
      'Dropped anchor just in time! We were about to sail past it.',
      'Got yer pin down on the whistle, like the last boat from Port Sarim!',
      'Close call, ye barnacle! I was already raising the gangplank.',
    ],
    early: [
      'Pinned before I even unrolled the whole chart!',
      'Barely heard the name and yer pin was in the parchment!',
      'So early! Have ye buried treasure there yerself?',
    ],
    later: [
      'Searched every island and peninsula first. A thorough buccaneer.',
      'Took yer time with the sextant. Better than running aground!',
      'Slow on the compass, matey, but at least ye dropped anchor.',
    ],
  },
  reveal: [
    'Where did ye drop anchor?',
    'Where be the real spot?',
    'Roll out the captain’s chart!',
    'X marks this spot:',
  ],
  verdict: {
    right: [
      'Dead on the X! Break out the Braindeath rum, matey!',
      'Bullseye! Ye could steer The Adventurous through a fog bank.',
      'Right on the doubloon! Half the plunder is yours.',
      "Finest navigator from Port Phasmatys to Mos Le'Harmless!",
    ],
    partial: [
      'Close! Within cannon shot of the target, at least.',
      'Not bad, only a short rowboat trip from where ye pinned!',
      'Right coastline, wrong cove! Still worth a share of the grog.',
    ],
    wrong: [
      'Arr, ye ran the ship straight into Karamja! Wrong side of the map!',
      'Way off course! Did ye hold the compass upside down, ye bilge rat?',
      'Wrong ocean entirely! Walk the plank for that one.',
      'Ye’d be digging in empty sand for a month at those coordinates!',
    ],
    missed: [
      'Never even dropped yer pin! Lost at sea without a rudder?',
      'Fell asleep in the crow’s nest! No pin, no share of the loot.',
      'Drifted right off the edge of the chart without marking a thing!',
    ],
  },
  stem: 'text',
}

export const card: SuggestCard = { place: 15, hint: 'A place on the world map for players to pin.' }
