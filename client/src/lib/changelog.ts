/**
 * What's new, newest first: one entry per version `VERSION` has held, a stacked PR's too,
 * dated the day it reached `main`, and 0.0.0 for the first commit, in crisp, verb-first,
 * player-facing language. The footer's sheet nests each patch under its minor.
 */

export interface ChangelogEntry {
  version: string
  /** The day the version reached `main`, as an ISO date. */
  date: string
  text: string
}

/** Max characters for a minor release entry. */
export const MINOR_MAX = 150
/** Max characters for a patch release entry. */
export const PATCH_MAX = 100

export interface ChangelogGroup {
  /** `0.6` for 0.6.0 and its patches. */
  key: string
  /** The minor's entry; null when only its patches are listed. */
  minor: ChangelogEntry | null
  patches: ChangelogEntry[]
}

/** True for a patch release, `0.6.1`; false for a minor, `0.6.0`. */
export function isPatch(version: string): boolean {
  return !version.endsWith('.0')
}

/** The entries as the sheet shows them: a group per minor, its patches newest first. */
export function groupByMinor(entries: ChangelogEntry[]): ChangelogGroup[] {
  const groups = new Map<string, ChangelogGroup>()
  for (const entry of entries) {
    const key = entry.version.split('.').slice(0, 2).join('.')
    const group = groups.get(key) ?? { key, minor: null, patches: [] }
    if (isPatch(entry.version)) group.patches.push(entry)
    else group.minor = entry
    groups.set(key, group)
  }
  return [...groups.values()]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.284.0',
    date: '2026-11-25',
    text: 'Write place names on the map as the game does, in KGP Recon and on every map reveal.',
  },
  {
    version: '0.283.0',
    date: '2026-11-25',
    text: 'Show banks, shops and quest icons on the map in KGP Recon and Minimap Guesser, and on every map reveal.',
  },
  {
    version: '0.282.2',
    date: '2026-11-25',
    text: 'Open each question right when the reveal countdown ends, even on a slow server.',
  },
  {
    version: '0.282.1',
    date: '2026-11-25',
    text: "Rebuild each theme's sheet on its own, so new themes come sooner; the stage looks the same.",
  },
  {
    version: '0.282.0',
    date: '2026-11-24',
    text: 'Replace both Gauntlet themes with Prifddinas: crystal-lit meadow, white walls under emerald roofs, and a random elven clan on the banners.',
  },
  {
    version: '0.281.2',
    date: '2026-11-24',
    text: 'Stop the Suggest page logging an error for rounds with no questions yet.',
  },
  {
    version: '0.281.1',
    date: '2026-11-24',
    text: 'Give each page its own tab title and link preview, and list the Daily and game modes for search.',
  },
  {
    version: '0.281.0',
    date: '2026-11-24',
    text: 'Move on in the Daily from the Next tab under the top bar, or press Enter, so tall questions like maps never hide it.',
  },
  {
    version: '0.280.0',
    date: '2026-11-24',
    text: 'See who has answered on the TV, with their emotes, under those still thinking.',
  },
  {
    version: '0.279.0',
    date: '2026-11-24',
    text: 'Copy the top 3 or the full results with their own buttons on the final standings.',
  },
  {
    version: '0.278.0',
    date: '2026-11-24',
    text: 'Emote while you wait, even on the hiscores: pick one from the emote tab and your pet says it overhead for everyone.',
  },
  {
    version: '0.277.0',
    date: '2026-11-24',
    text: 'Play Lost in Gielinor: Hans describes where he wandered off to, and you pin the spot. Suggest your own places for him.',
  },
  {
    version: '0.276.0',
    date: '2026-11-23',
    text: 'Play Minimap Guesser: pin where a minimap was drawn, and suggest your own spots. KGP Recon’s photo gets its own card on the map again.',
  },
  {
    version: '0.275.0',
    date: '2026-11-23',
    text: 'Pick the photo you mean when reporting a question from a photo round, and see the photos already in the game when you suggest one.',
  },
  {
    version: '0.274.0',
    date: '2026-11-23',
    text: 'Show the answer’s name under its picture when a Sphinx riddle is solved, clear of the clues.',
  },
  {
    version: '0.273.0',
    date: '2026-11-20',
    text: 'Fit matching questions on screen: on a computer the answers to drag sit beside the slots, so nothing scrolls.',
  },
  {
    version: '0.272.0',
    date: '2026-11-20',
    text: 'Even out the sheets: every theme frames the question alike. New Zanaris stone; the Wilderness skull hides behind the words.',
  },
  {
    version: '0.271.0',
    date: '2026-11-20',
    text: 'Play KGP Recon: pin where a recon photo was taken. Send your own screenshots for it on /suggest.',
  },
  {
    version: '0.270.1',
    date: '2026-11-20',
    text: 'Show the real time a room stays open on the room panel and in How to play.',
  },
  {
    version: '0.270.0',
    date: '2026-11-20',
    text: 'Rename the coming Hide and Seek round to KGP Recon, hosted by a KGP Agent. Keep the room readable in short windows: it scrolls instead of shrinking.',
  },
  {
    version: '0.269.3',
    date: '2026-11-20',
    text: 'Fold Release Order into Sort It Out. Stop suggestion previews jumping straight to the reveal.',
  },
  {
    version: '0.269.2',
    date: '2026-11-20',
    text: "Show Diary Dash, Entrana Customs, Hide and Seek and What's That Noise? as coming soon.",
  },
  {
    version: '0.269.1',
    date: '2026-11-20',
    text: 'Footer pop-ups open at the top, with a close X.',
  },
  {
    version: '0.269.0',
    date: '2026-11-20',
    text: 'Copy a party game’s result from the final hiscores: the top 3 or everyone, or the gods with or without their players.',
  },
  {
    version: '0.268.4',
    date: '2026-11-20',
    text: 'Stop small test rooms from failing the load check over one slow answer.',
  },
  {
    version: '0.268.3',
    date: '2026-11-20',
    text: 'Add 40 Slayer Master, 30 Bestiary and 30 Know Your Content Creator questions.',
  },
  {
    version: '0.268.2',
    date: '2026-11-20',
    text: 'Add 40 new Guess the Examine questions spanning items, bosses, pets and NPCs.',
  },
  {
    version: '0.268.1',
    date: '2026-11-19',
    text: 'Hold CI on draft changes until they are marked ready.',
  },
  {
    version: '0.268.0',
    date: '2026-11-19',
    text: 'Keep the room at its own size on big screens. Shrink the Sphinx’s clues so the answer list and reveal fit.',
  },
  {
    version: '0.267.2',
    date: '2026-11-19',
    text: 'Hide the title and GitHub link on phones so the title bar shows your name.',
  },
  {
    version: '0.267.1',
    date: '2026-11-19',
    text: 'Treat names like Straße and STRASSE the same way when asking to join and when joining.',
  },
  {
    version: '0.267.0',
    date: '2026-11-19',
    text: 'Give each Riddles of the Sphinx clue 10 seconds, drop the points column and show the answer’s name and picture under the clues.',
  },
  {
    version: '0.266.7',
    date: '2026-11-19',
    text: 'Lock out addresses that keep guessing the admin token, and cap the database memory.',
  },
  {
    version: '0.266.6',
    date: '2026-11-19',
    text: 'Turn away floods of room, question and daily requests, so one address cannot slow every game.',
  },
  {
    version: '0.266.5',
    date: '2026-11-19',
    text: 'Keep games smooth when many rooms sit empty or many suggestions wait for review.',
  },
  {
    version: '0.266.4',
    date: '2026-11-19',
    text: 'Stop the Phoenix necklace paying twice when the host ends a round early.',
  },
  {
    version: '0.266.3',
    date: '2026-11-19',
    text: "Turn away connection floods sooner, so one address can't crowd other players out of the inn.",
  },
  {
    version: '0.266.2',
    date: '2026-11-19',
    text: "Make screenshot uploads on Suggest sturdier, so a huge or broken picture can't stall the inn.",
  },
  {
    version: '0.266.1',
    date: '2026-11-19',
    text: 'Add 60 Riddles of the Sphinx questions across iconic items, NPCs, bosses and places.',
  },
  {
    version: '0.266.0',
    date: '2026-11-19',
    text: 'Add Riddles of the Sphinx: name the NPC, item or place from five clues, vaguest first. Answer early for more points.',
  },
  {
    version: '0.265.0',
    date: '2026-11-19',
    text: 'Suggest Prop Hunt questions on your own screenshot: mark the spot or cells players must tap.',
  },
  {
    version: '0.264.0',
    date: '2026-11-19',
    text: 'Hold updates back while a game or a filled lobby is running, so a new version no longer drops you mid-game.',
  },
  {
    version: '0.263.0',
    date: '2026-11-18',
    text: "Seat a new host as a cat until they pick a pet, and stop counting Certer's sketches twice in the footer's question count.",
  },
  {
    version: '0.262.0',
    date: '2026-11-18',
    text: 'Add the Ring of wealth to Mystery Boxes, which removes wrong options on multiple choice questions for its wearer.',
  },
  {
    version: '0.261.0',
    date: '2026-11-18',
    text: 'Let players use items during a question: Kebab, Ring of Charos (a), XP lamp, and Book of Knowledge.',
  },
  {
    version: '0.260.0',
    date: '2026-11-18',
    text: 'Show Mystery Boxes between rounds, giving random items to the bottom half of the hiscores for the next round.',
  },
  {
    version: '0.259.0',
    date: '2026-11-18',
    text: 'Add Super restore, Ring of Life, and Phoenix necklace item effects on the server.',
  },
  {
    version: '0.258.0',
    date: '2026-11-18',
    text: 'Add Mystery Box item drops between rounds on the server.',
  },
  {
    version: '0.257.0',
    date: '2026-11-18',
    text: 'Rewrite changelog entries in a crisp, verb-first style and raise entry length limits.',
  },
  {
    version: '0.256.2',
    date: '2026-11-18',
    text: 'Show which version the live site runs on the project page.',
  },
  {
    version: '0.256.1',
    date: '2026-11-17',
    text: 'Make background checks more reliable (no gameplay changes).',
  },
  {
    version: '0.256.0',
    date: '2026-11-17',
    text: 'Explain why speed still pays in Pixel Hunt team games, and require at least three bins when sorting.',
  },
  {
    version: '0.255.0',
    date: '2026-11-17',
    text: 'Prepare full speed scoring for built answers such as orderings.',
  },
  {
    version: '0.254.0',
    date: '2026-11-17',
    text: 'Score slider questions purely on accuracy, ignoring answer speed.',
  },
  {
    version: '0.253.0',
    date: '2026-11-17',
    text: 'Record anonymous answer timings to help balance scoring.',
  },
  {
    version: '0.252.0',
    date: '2026-11-17',
    text: 'Score Put in Order by how close your order is, not all-or-nothing.',
  },
  {
    version: '0.251.2',
    date: '2026-11-17',
    text: 'Speed up background checks.',
  },
  {
    version: '0.251.1',
    date: '2026-11-17',
    text: 'Block ticking every box in Pick All That Apply.',
  },
  {
    version: '0.251.0',
    date: '2026-11-15',
    text: 'Add screenshot-tap question type (rounds using it coming soon).',
  },
  {
    version: '0.250.0',
    date: '2026-11-15',
    text: 'Add group-sorting questions (e.g. items by god). Make or suggest your own.',
  },
  {
    version: '0.249.2',
    date: '2026-11-14',
    text: "Simplify the stage's sheet internals to prepare for new themes.",
  },
  {
    version: '0.249.1',
    date: '2026-11-14',
    text: 'Offer a retry button when a page fails to load.',
  },
  {
    version: '0.249.0',
    date: '2026-11-14',
    text: 'Match scrollbars to your theme colours and make panel scrollbars slimmer.',
  },
  {
    version: '0.248.20',
    date: '2026-11-14',
    text: 'Keep players on shared wifi connected when one device floods it.',
  },
  {
    version: '0.248.19',
    date: '2026-11-14',
    text: 'Run a stronger load test in CI.',
  },
  {
    version: '0.248.18',
    date: '2026-11-14',
    text: 'Tidy tests behind the scenes (no gameplay changes).',
  },
  {
    version: '0.248.17',
    date: '2026-11-14',
    text: 'Add type checking for server code.',
  },
  {
    version: '0.248.16',
    date: '2026-11-14',
    text: 'Tidy how games move between screens.',
  },
  {
    version: '0.248.15',
    date: '2026-11-14',
    text: 'Read How to play timings directly from the game rules.',
  },
  {
    version: '0.248.14',
    date: '2026-11-14',
    text: 'Keep big game nights joinable when the server is busy.',
  },
  {
    version: '0.248.13',
    date: '2026-11-14',
    text: "Allow editing Uri's Unravelling questions along with their quotes.",
  },
  {
    version: '0.248.12',
    date: '2026-11-14',
    text: 'Keep rooms responsive when many players reconnect at once.',
  },
  {
    version: '0.248.11',
    date: '2026-11-14',
    text: 'Tidy up round internals.',
  },
  {
    version: '0.248.10',
    date: '2026-11-14',
    text: 'Speed up reconnects in rooms with many players.',
  },
  {
    version: '0.248.9',
    date: '2026-11-14',
    text: 'Tidy up how rounds are configured.',
  },
  {
    version: '0.248.8',
    date: '2026-11-14',
    text: 'Fix the load test to run a full game cleanly again.',
  },
  {
    version: '0.248.7',
    date: '2026-11-14',
    text: 'Scan every change in CI for leaked passwords and keys.',
  },
  {
    version: '0.248.6',
    date: '2026-11-14',
    text: 'Tidy up lobby code behind the scenes.',
  },
  {
    version: '0.248.5',
    date: '2026-11-14',
    text: 'Let shared-wifi players rejoin after one device spams.',
  },
  {
    version: '0.248.4',
    date: '2026-11-14',
    text: 'Tidy up suggestion forms behind the scenes.',
  },
  {
    version: '0.248.3',
    date: '2026-11-14',
    text: 'Open links in admin queues only when they are safe.',
  },
  {
    version: '0.248.2',
    date: '2026-11-14',
    text: 'Tidy up question editors behind the scenes.',
  },
  {
    version: '0.248.1',
    date: '2026-11-14',
    text: 'Speed up initial page load, especially on phones.',
  },
  {
    version: '0.248.0',
    date: '2026-11-14',
    text: 'Reveal Daily pictures consistently for everyone, and show team averages on answer-screen team rows.',
  },
  {
    version: '0.247.1',
    date: '2026-11-14',
    text: 'Update standings immediately on kicks, and include typing time in game durations.',
  },
  {
    version: '0.247.0',
    date: '2026-11-05',
    text: 'Add 37 questions across several game modes.',
  },
  {
    version: '0.246.8',
    date: '2026-11-05',
    text: 'Update open tabs to new versions without a hard reload.',
  },
  {
    version: '0.246.7',
    date: '2026-11-04',
    text: 'Stop pets and item icons from flashing at their old size.',
  },
  {
    version: '0.246.6',
    date: '2026-11-04',
    text: 'Retry flaky connections more gently and stop hanging.',
  },
  {
    version: '0.246.5',
    date: '2026-11-04',
    text: "Skip any Who's That NPC? question that is missing its picture.",
  },
  {
    version: '0.246.4',
    date: '2026-11-04',
    text: 'Stop one address from filling all join requests in a room.',
  },
  {
    version: '0.246.3',
    date: '2026-11-04',
    text: 'Update answer counts when someone drops or returns.',
  },
  {
    version: '0.246.2',
    date: '2026-11-04',
    text: 'Reconnect immediately after a mid-game server hiccup.',
  },
  {
    version: '0.246.1',
    date: '2026-11-04',
    text: 'Fix moving suggested questions between rounds.',
  },
  {
    version: '0.246.0',
    date: '2026-11-04',
    text: 'Add a lock-in button right above map pins, and keep host audio audible while pinning on phones.',
  },
  {
    version: '0.245.4',
    date: '2026-11-04',
    text: 'Show the rosette over answers again in every theme.',
  },
  {
    version: '0.245.3',
    date: '2026-11-04',
    text: 'Stop rooms named after an item from tripping safety checks.',
  },
  {
    version: '0.245.2',
    date: '2026-11-04',
    text: 'Speed up automated checks so fixes ship sooner.',
  },
  {
    version: '0.245.1',
    date: '2026-11-04',
    text: 'Allow rendering the world map on a smaller server.',
  },
  {
    version: '0.245.0',
    date: '2026-11-04',
    text: 'Replace AI-generated wording with more natural human-written text.',
  },
  {
    version: '0.244.0',
    date: '2026-11-03',
    text: 'Let hosts take the same table back to the lobby after a game for a fresh round with new questions.',
  },
  {
    version: '0.243.0',
    date: '2026-11-03',
    text: 'Add Certer to random events: name his sketched item faster for more points.',
  },
  {
    version: '0.242.0',
    date: '2026-11-03',
    text: 'Count every question in the footer; click it to see totals per round and random event.',
  },
  {
    version: '0.241.1',
    date: '2026-11-03',
    text: 'Fit suggest forms onto phone screens.',
  },
  {
    version: '0.241.0',
    date: '2026-11-03',
    text: 'Show a rosette in every theme when you answer well.',
  },
  {
    version: '0.240.0',
    date: '2026-11-03',
    text: 'Keep the map open across reveals and next questions, fading old pins as it glides.',
  },
  {
    version: '0.239.0',
    date: '2026-11-03',
    text: 'Add Mark the Map round: Bill Teach names a place and you pin it on the world map.',
  },
  {
    version: '0.238.0',
    date: '2026-11-02',
    text: 'Let players suggest places for Mark the Map by drawing a target box and tolerance.',
  },
  {
    version: '0.237.0',
    date: '2026-11-02',
    text: 'Add engine support for map questions.',
  },
  {
    version: '0.236.0',
    date: '2026-11-02',
    text: 'Host our own copy of the world map for upcoming map rounds.',
  },
  {
    version: '0.235.1',
    date: '2026-11-02',
    text: "Keep today's Daily attempt available if you leave it unfinished.",
  },
  {
    version: '0.235.0',
    date: '2026-11-02',
    text: 'Add Slayer Master round: Konar quo Maten tests monster weaknesses, tasks, and bosses.',
  },
  {
    version: '0.234.0',
    date: '2026-11-01',
    text: "Add Uri's Unravelling round: anagrams, ciphers, and cryptics with no blinking yellow arrow.",
  },
  {
    version: '0.233.0',
    date: '2026-11-01',
    text: 'Let players suggest verses for The Forgetful Bard, pick an item, and preview it.',
  },
  {
    version: '0.232.2',
    date: '2026-11-01',
    text: 'Add 34 new questions to Tales of Gielinor.',
  },
  {
    version: '0.232.1',
    date: '2026-11-01',
    text: 'Keep the Daily closed until its launch day.',
  },
  {
    version: '0.232.0',
    date: '2026-11-01',
    text: 'Add Tales of Gielinor round with the Wise Old Man (retiring him from random events).',
  },
  {
    version: '0.231.0',
    date: '2026-11-01',
    text: 'Let players suggest ScapeRune questions with one answer and four questions.',
  },
  {
    version: '0.230.0',
    date: '2026-11-01',
    text: 'Add ScapeRune round: Mr. Mordaut writes the answer and you pick its matching question.',
  },
  {
    version: '0.229.0',
    date: '2026-11-01',
    text: 'Add The Forgetful Bard round: Falo sings a verse and you name the item from the list.',
  },
  {
    version: '0.228.0',
    date: '2026-11-01',
    text: 'Shuffle game mode order on Create for every room so none always sits first.',
  },
  {
    version: '0.227.0',
    date: '2026-11-01',
    text: 'Give Daily Challenge its own stage with a Next button and a 1-to-10 counter.',
  },
  {
    version: '0.226.0',
    date: '2026-10-31',
    text: 'Add a Daily Challenge panel on Home showing your scores from every daily played.',
  },
  {
    version: '0.225.1',
    date: '2026-10-31',
    text: 'Stop More or Less from asking old, out-of-date prices.',
  },
  {
    version: '0.225.0',
    date: '2026-10-31',
    text: 'Show your Daily score at the end with a spoiler-free summary to copy and share.',
  },
  {
    version: '0.224.0',
    date: '2026-10-31',
    text: 'Add Daily Challenge: ten shared questions a day, played solo at /daily.',
  },
  {
    version: '0.223.0',
    date: '2026-10-31',
    text: 'Prepare backend groundwork for the Daily Challenge.',
  },
  {
    version: '0.222.0',
    date: '2026-10-31',
    text: 'Open Create straight into your lobby so you can pick rounds privately or with friends watching.',
  },
  {
    version: '0.221.0',
    date: '2026-10-30',
    text: "Let players try every mode in How to play, adding Price is Right, Sort It Out, Who's That NPC?, and Pixel Hunt.",
  },
  {
    version: '0.220.0',
    date: '2026-10-30',
    text: 'Show the three ways to play in How to play and walk players from first room to first answer.',
  },
  {
    version: '0.219.2',
    date: '2026-10-29',
    text: 'Keep wall lights fixed on the wall as you scroll.',
  },
  {
    version: '0.219.1',
    date: '2026-10-29',
    text: 'Add hundreds of room names plus more Pixel Hunt items and NPCs.',
  },
  {
    version: '0.219.0',
    date: '2026-10-29',
    text: 'Save custom questions in your browser so you can reuse and toggle them per room.',
  },
  {
    version: '0.218.1',
    date: '2026-10-29',
    text: 'Allow suggested popular items to become Pixel Hunt questions.',
  },
  {
    version: '0.218.0',
    date: '2026-10-29',
    text: 'Restore knotted swags of small flags on the Party Room bunting at any stage width.',
  },
  {
    version: '0.217.0',
    date: '2026-10-29',
    text: 'Show just the room code in the lobby with a Copy invite link button in the corner.',
  },
  {
    version: '0.216.1',
    date: '2026-10-29',
    text: 'Fix a flaky test.',
  },
  {
    version: '0.216.0',
    date: '2026-10-29',
    text: 'Have Reldo greet players on Home with a Give feedback button, and link Discord in the footer.',
  },
  {
    version: '0.215.0',
    date: '2026-10-29',
    text: 'Return a proper 404 error for missing images and files instead of a blank page.',
  },
  {
    version: '0.214.0',
    date: '2026-10-29',
    text: 'Add sound effects; play audio only on the TV when present unless enabled on your device.',
  },
  {
    version: '0.213.0',
    date: '2026-10-28',
    text: 'Compare games, players, completion rates, and returning players to the prior period in Admin.',
  },
  {
    version: '0.212.0',
    date: '2026-10-28',
    text: 'Report browser errors and slow pages automatically so issues get fixed sooner.',
  },
  {
    version: '0.211.0',
    date: '2026-10-28',
    text: 'Animate Pixel Hunt image reveals, light the stage with the lantern, and arrange tiles in a grid.',
  },
  {
    version: '0.210.2',
    date: '2026-10-28',
    text: 'Give new items a Pixel Hunt question and pictures automatically.',
  },
  {
    version: '0.210.1',
    date: '2026-10-28',
    text: 'Add 129 new questions and items across rounds.',
  },
  {
    version: '0.210.0',
    date: '2026-10-28',
    text: "Widen Zanaris's stone sign and align it with panels so text clears its crystal edges.",
  },
  {
    version: '0.209.0',
    date: '2026-10-28',
    text: 'Add two Pixel Hunt reveals: a wandering lantern in the dark and a sketch-before-colour pen.',
  },
  {
    version: '0.208.0',
    date: '2026-10-28',
    text: 'Add two Pixel Hunt reveals: lifting tiles one by one and a self-solving clue puzzle box.',
  },
  {
    version: '0.207.0',
    date: '2026-10-28',
    text: 'Add Pixel Hunt round: name the item as its picture zooms out or sharpens; faster scores more.',
  },
  {
    version: '0.206.1',
    date: '2026-10-28',
    text: 'Crop item pictures to fill their frame cleanly.',
  },
  {
    version: '0.206.0',
    date: '2026-10-28',
    text: 'Widen the profile menu: name, theme, and sound on the left, all pets on the right.',
  },
  {
    version: '0.205.1',
    date: '2026-10-28',
    text: 'Exempt admins from suggestion rate limits.',
  },
  {
    version: '0.205.0',
    date: '2026-10-28',
    text: "Show all fields for Who's That NPC? and Odd One Out in the admin suggestion queue.",
  },
  {
    version: '0.204.0',
    date: '2026-10-28',
    text: 'Monitor server lag automatically so slowdowns are spotted sooner.',
  },
  {
    version: '0.203.3',
    date: '2026-10-28',
    text: 'Update dependencies.',
  },
  {
    version: '0.203.2',
    date: '2026-10-28',
    text: 'Add 23 new Know Your Content Creator questions.',
  },
  {
    version: '0.203.1',
    date: '2026-10-28',
    text: 'Add 44 new quotes to Who Said That?.',
  },
  {
    version: '0.203.0',
    date: '2026-10-28',
    text: 'Add performance monitoring to keep the inn running smoothly.',
  },
  {
    version: '0.202.3',
    date: '2026-10-28',
    text: 'Allow every option to be right in Pick All That Apply.',
  },
  {
    version: '0.202.2',
    date: '2026-10-28',
    text: 'Leave difficulty unselected by default when suggesting a question.',
  },
  {
    version: '0.202.1',
    date: '2026-10-28',
    text: 'Place How to play above the game mode slideshow.',
  },
  {
    version: '0.202.0',
    date: '2026-10-28',
    text: 'Add the Mysterious Old Man to the Home showcase to explain random events.',
  },
  {
    version: '0.201.1',
    date: '2026-10-28',
    text: 'Move How to play above the game mode slideshow.',
  },
  {
    version: '0.201.0',
    date: '2026-10-28',
    text: 'Let players try a sample question in How to play and see what it would score.',
  },
  {
    version: '0.200.0',
    date: '2026-10-27',
    text: 'Route question suggestions to Reldo and send problem reports straight to us.',
  },
  {
    version: '0.199.1',
    date: '2026-10-27',
    text: 'Give How to play and each game mode a shareable link.',
  },
  {
    version: '0.199.0',
    date: '2026-10-27',
    text: 'Add a How to play tab on Home covering a night at the inn, every mode, teams, and TV mode.',
  },
  {
    version: '0.198.0',
    date: '2026-10-27',
    text: 'Showcase each game mode and host on Home; click any host portrait to jump to it.',
  },
  {
    version: '0.197.0',
    date: '2026-10-27',
    text: 'Redesign Home: join or create a room from one main scroll while Reldo takes suggestions.',
  },
  {
    version: '0.196.0',
    date: '2026-10-26',
    text: 'Collect server health metrics to keep the inn running smoothly.',
  },
  {
    version: '0.195.0',
    date: '2026-10-26',
    text: "Remove the tag beside random event NPCs' names.",
  },
  {
    version: '0.194.3',
    date: '2026-10-26',
    text: 'Stop the NPC shadow from growing once you answer.',
  },
  {
    version: '0.194.2',
    date: '2026-10-26',
    text: "Show a placeholder preview for Who's That NPC? suggestions.",
  },
  {
    version: '0.194.1',
    date: '2026-10-26',
    text: 'Scroll the stage when dragging rows and keep countdowns quiet.',
  },
  {
    version: '0.194.0',
    date: '2026-10-26',
    text: 'Guide question and item suggestions through numbered steps with checkmarks and progress.',
  },
  {
    version: '0.193.0',
    date: '2026-10-26',
    text: 'Open past games to the full end-of-game screen with the Wise Old Man and final hiscores.',
  },
  {
    version: '0.192.2',
    date: '2026-10-26',
    text: 'Fit Sort It Out onto short laptop screens.',
  },
  {
    version: '0.192.1',
    date: '2026-10-26',
    text: 'Apply the latest security fixes to the server image.',
  },
  {
    version: '0.192.0',
    date: '2026-10-25',
    text: 'Have the Wise Old Man hold up each trophy in his dialogue box when announcing winners.',
  },
  {
    version: '0.191.0',
    date: '2026-10-25',
    text: "Cap Who's That NPC? pictures at their native size and reserve space for five answer names.",
  },
  {
    version: '0.190.0',
    date: '2026-10-25',
    text: 'Avoid labelling you twice on answer reveals when your pet chathead is already shown.',
  },
  {
    version: '0.189.0',
    date: '2026-10-25',
    text: 'Clean up Ready and Full screen toggles in the lobby.',
  },
  {
    version: '0.188.0',
    date: '2026-10-25',
    text: 'Make the Next up panel between rounds more compact with the countdown timer underneath.',
  },
  {
    version: '0.187.0',
    date: '2026-10-25',
    text: 'Show chatheads on the table again, three per row, and wrap long names instead of cutting them.',
  },
  {
    version: '0.186.0',
    date: '2026-10-25',
    text: 'Raise name limit to 12 characters like OSRS and show full names two per row on the table.',
  },
  {
    version: '0.185.0',
    date: '2026-10-25',
    text: 'Keep the lobby room code on one line, fold long round lists, and offer full screen on laptops.',
  },
  {
    version: '0.184.1',
    date: '2026-10-25',
    text: 'Stop Sort It Out from jumping back to the top when moving a row.',
  },
  {
    version: '0.184.0',
    date: '2026-10-25',
    text: "Scale Who's That NPC? images to fit available screen space on laptops and large monitors.",
  },
  {
    version: '0.183.0',
    date: '2026-10-25',
    text: 'Scale down the game view slightly on smaller laptops so questions fit without scrolling.',
  },
  {
    version: '0.182.0',
    date: '2026-10-25',
    text: 'Have hosts react to how quickly you lock in your answer.',
  },
  {
    version: '0.181.0',
    date: '2026-10-25',
    text: "Show your earned points inside the host's dialogue box alongside their reaction.",
  },
  {
    version: '0.180.0',
    date: '2026-10-25',
    text: 'Clean up question scrolls by removing headings already announced by the host.',
  },
  {
    version: '0.179.0',
    date: '2026-10-25',
    text: 'Show "Moving on in" between rounds instead of "Starts in" since rounds open on their splash.',
  },
  {
    version: '0.178.1',
    date: '2026-10-25',
    text: 'Show the upcoming round name in the top bar during its splash.',
  },
  {
    version: '0.178.0',
    date: '2026-10-25',
    text: 'Show hosts of already-played rounds on the splash during shuffled or surprise nights.',
  },
  {
    version: '0.177.0',
    date: '2026-10-25',
    text: 'Clean up the round scroll, mark unknown rounds with "?", and place the countdown beside Ready.',
  },
  {
    version: '0.176.0',
    date: '2026-10-25',
    text: 'Turn Ready into a switch that clearly shows your ready state.',
  },
  {
    version: '0.175.0',
    date: '2026-10-25',
    text: 'Give hosts voice lines for each question and smooth transitions back from random events.',
  },
  {
    version: '0.174.0',
    date: '2026-10-25',
    text: 'Display host and random event speech in classic OSRS dialogue boxes and label the timer.',
  },
  {
    version: '0.173.0',
    date: '2026-10-25',
    text: 'Centre clue scroll text across every theme, including the lobby room code.',
  },
  {
    version: '0.172.0',
    date: '2026-10-25',
    text: 'Stop the host and sheet from jumping in the room when answers are revealed.',
  },
  {
    version: '0.171.0',
    date: '2026-10-24',
    text: 'Show who picked each option directly on answer buttons during desktop reveals.',
  },
  {
    version: '0.170.0',
    date: '2026-10-24',
    text: 'Show the next round host and countdown on the hiscores screen between rounds.',
  },
  {
    version: '0.169.0',
    date: '2026-10-24',
    text: 'Show a row of host portraits with your game progress and a countdown before each round.',
  },
  {
    version: '0.168.0',
    date: '2026-10-24',
    text: 'Enlarge the lobby code and invite link and show a card for each round tonight.',
  },
  {
    version: '0.167.0',
    date: '2026-10-24',
    text: 'Show who picked what with counts and bars in the side table after each question.',
  },
  {
    version: '0.166.0',
    date: '2026-10-24',
    text: 'Use full screen width for questions and answers on laptops, sizing each answer to fit.',
  },
  {
    version: '0.165.0',
    date: '2026-10-24',
    text: 'Place host speech in a bubble above the clue scroll and random event NPCs on the right.',
  },
  {
    version: '0.164.0',
    date: '2026-10-24',
    text: 'Show who has answered and who is still thinking in the side table, grouped by team.',
  },
  {
    version: '0.163.0',
    date: '2026-10-24',
    text: 'Move host controls from under the question into a Host menu in the top bar.',
  },
  {
    version: '0.162.0',
    date: '2026-10-24',
    text: 'Add widescreen layout for desktops and laptops with stage on the left and players on the right.',
  },
  {
    version: '0.161.1',
    date: '2026-10-24',
    text: 'Apply a security update.',
  },
  {
    version: '0.161.0',
    date: '2026-10-23',
    text: 'Show lobby room code, player list, round splashes, and hiscores in a large TV mode layout.',
  },
  {
    version: '0.160.0',
    date: '2026-10-23',
    text: 'Show each question, pending players, and full reveals on the big screen in TV mode.',
  },
  {
    version: '0.159.0',
    date: '2026-10-23',
    text: 'Show only answer buttons and your score on phones when a room has a TV.',
  },
  {
    version: '0.158.0',
    date: '2026-10-23',
    text: "Let hosts click any player in the lobby to switch their screen into or out of the room's TV.",
  },
  {
    version: '0.157.0',
    date: '2026-10-23',
    text: 'Make the TV screen display-only so it never answers, stalls rounds, or joins hiscores.',
  },
  {
    version: '0.156.0',
    date: '2026-10-23',
    text: 'Add TV mode: show questions on one shared screen while everyone answers on their phones.',
  },
  {
    version: '0.155.2',
    date: '2026-10-23',
    text: 'Fade smoothly between screens instead of flashing.',
  },
  {
    version: '0.155.1',
    date: '2026-10-23',
    text: 'Drop screen-reader live announcements.',
  },
  {
    version: '0.155.0',
    date: '2026-10-23',
    text: "Allow full NPC pictures in Who's That NPC? to pick out from look-alikes. Suggest your own!",
  },
  {
    version: '0.154.1',
    date: '2026-10-23',
    text: 'Remove screen-reader live regions.',
  },
  {
    version: '0.154.0',
    date: '2026-10-23',
    text: 'Allow search engines to index the inn.',
  },
  {
    version: '0.153.0',
    date: '2026-10-23',
    text: 'Allow adjusting difficulty ratings for questions that play easier or harder than rated.',
  },
  {
    version: '0.152.0',
    date: '2026-10-23',
    text: 'Track how often each question is answered right to help balance difficulty.',
  },
  {
    version: '0.151.3',
    date: '2026-10-23',
    text: 'List one choice per row in Suggest a question on phones.',
  },
  {
    version: '0.151.2',
    date: '2026-10-23',
    text: 'Keep host faces visible on cards on iPhone.',
  },
  {
    version: '0.151.1',
    date: '2026-10-23',
    text: 'Show the question in previews for roundless suggestions.',
  },
  {
    version: '0.151.0',
    date: '2026-10-22',
    text: 'Let players pick Easy, Medium, or Hard difficulty when suggesting a question.',
  },
  {
    version: '0.150.0',
    date: '2026-10-22',
    text: 'Light torches on Wilderness walls and add glowing sulphur vents beside Toktz pages.',
  },
  {
    version: '0.149.1',
    date: '2026-10-22',
    text: 'Apply difficulty selection to questions in every round.',
  },
  {
    version: '0.149.0',
    date: '2026-10-22',
    text: 'Let players test-answer suggested questions in preview and flip to see the points awarded.',
  },
  {
    version: '0.148.0',
    date: '2026-10-22',
    text: 'Present top teams fifth-to-first at the end of team games instead of individual players.',
  },
  {
    version: '0.147.2',
    date: '2026-10-22',
    text: 'Award points for near guesses in drop-rate and estimate questions.',
  },
  {
    version: '0.147.1',
    date: '2026-10-22',
    text: 'Allow closest-number questions to award exact or near guesses.',
  },
  {
    version: '0.147.0',
    date: '2026-10-22',
    text: 'Show an example for the selected round in Create and Suggest question boxes.',
  },
  {
    version: '0.146.0',
    date: '2026-10-22',
    text: "Colour your screen with your god's colours in team games: top bar, timer, and window frame.",
  },
  {
    version: '0.145.0',
    date: '2026-10-22',
    text: 'Ask on Create how you want to play: Individuals or Teams.',
  },
  {
    version: '0.144.1',
    date: '2026-10-22',
    text: 'Add new examines, odd-one-out questions, and a Reldo question.',
  },
  {
    version: '0.144.0',
    date: '2026-10-22',
    text: 'Add footer credits, ready ticks, floating notices, and rate-limit cooldown buttons.',
  },
  {
    version: '0.143.0',
    date: '2026-10-21',
    text: 'Add Minigame Madness round hosted by Lanthus: prizes, points, and places from Castle Wars to Tempoross.',
  },
  {
    version: '0.142.0',
    date: '2026-10-21',
    text: 'Display slider questions as sliders in How to play, with prices and numbers in one row.',
  },
  {
    version: '0.141.0',
    date: '2026-10-21',
    text: 'Add Zanaris theme with mushrooms and the Cosmic altar sign.',
  },
  {
    version: '0.140.0',
    date: '2026-10-21',
    text: 'Decorate Jungle with bananas and monkey nuts, and Pollnivneach with cacti, camels, and waterskins.',
  },
  {
    version: '0.139.0',
    date: '2026-10-21',
    text: 'Let hosts choose Easy, Mixed, or Hard questions under House rules (random events stay mixed).',
  },
  {
    version: '0.138.0',
    date: '2026-10-21',
    text: 'Let team-game hosts add and remove gods in the lobby, keeping two to six.',
  },
  {
    version: '0.137.0',
    date: '2026-10-21',
    text: "Show each team's average score on every reveal in team games.",
  },
  {
    version: '0.136.0',
    date: '2026-10-21',
    text: "Rank gods between rounds and at the end of team games, listing each team's players underneath.",
  },
  {
    version: '0.135.0',
    date: '2026-10-21',
    text: 'Let players tap a god in the lobby to join it and let hosts move players before starting.',
  },
  {
    version: '0.134.0',
    date: '2026-10-21',
    text: 'Let hosts create team games by switching to Teams on Create and picking two to six gods.',
  },
  {
    version: '0.133.0',
    date: '2026-10-21',
    text: 'Score teams by averaging all members (including silent ones) in preparation for team games.',
  },
  {
    version: '0.132.0',
    date: '2026-10-21',
    text: 'Award full points for right answers regardless of speed in preparation for team games.',
  },
  {
    version: '0.131.0',
    date: '2026-10-21',
    text: 'Allow players to pick a god and hosts to reassign them in preparation for team games.',
  },
  {
    version: '0.130.0',
    date: '2026-10-21',
    text: 'Support creating rooms with two to six god teams in preparation for team games.',
  },
  {
    version: '0.129.0',
    date: '2026-10-21',
    text: 'Let hosts answer and score on their own custom questions just like everyone else.',
  },
  {
    version: '0.128.0',
    date: '2026-10-21',
    text: 'Give each of the six gods its own symbol and colours in preparation for team games.',
  },
  {
    version: '0.127.0',
    date: '2026-10-21',
    text: "List every release version in What's new, including updates shipped together.",
  },
  {
    version: '0.126.0',
    date: '2026-10-21',
    text: 'Let players drag or tap right answers into a basket before submitting in Pick All That Apply.',
  },
  {
    version: '0.125.0',
    date: '2026-10-21',
    text: 'Let players write Match Them Up questions on Create and suggest them for Bestiary, Drop Table, and NPCs.',
  },
  {
    version: '0.124.0',
    date: '2026-10-21',
    text: 'Add Match Them Up question type: drag the right answer onto each prompt (some are decoys).',
  },
  {
    version: '0.123.0',
    date: '2026-10-21',
    text: 'Greet players with Broav on Suggest and use Broav whenever an NPC lacks a picture.',
  },
  {
    version: '0.122.0',
    date: '2026-10-21',
    text: 'Use a slider on some number questions so no typing is needed and near guesses still score.',
  },
  {
    version: '0.121.0',
    date: '2026-10-21',
    text: 'Smooth transitions when a random event takes over the clue scroll and hands it back.',
  },
  {
    version: '0.120.1',
    date: '2026-10-21',
    text: 'Stop the answer list from scrolling the whole page.',
  },
  {
    version: '0.120.0',
    date: '2026-10-21',
    text: "Open credits as a popup from Home's footer instead of a separate page.",
  },
  {
    version: '0.119.0',
    date: '2026-10-21',
    text: "Add What's new sheet, opened from the version number in the footer.",
  },
  {
    version: '0.118.0',
    date: '2026-10-21',
    text: 'Switch The Price is Right to a slider: closer guesses earn more points.',
  },
  {
    version: '0.117.0',
    date: '2026-10-21',
    text: 'Warn in Suggest when the game already has a similar question.',
  },
  {
    version: '0.116.0',
    date: '2026-10-21',
    text: 'Allow suggesting a question without picking a round.',
  },
  {
    version: '0.115.0',
    date: '2026-10-21',
    text: 'Describe what each round asks for on Suggest.',
  },
  {
    version: '0.114.0',
    date: '2026-10-21',
    text: "List a round's existing questions beside the editor on Suggest.",
  },
  {
    version: '0.113.0',
    date: '2026-10-21',
    text: 'Allow NPCs to ask Put in Order questions on Suggest.',
  },
  {
    version: '0.112.0',
    date: '2026-10-21',
    text: 'Ask what an NPC question is about on Suggest.',
  },
  {
    version: '0.111.0',
    date: '2026-10-20',
    text: 'Add Corrupted Gauntlet theme with a corrupted boar.',
  },
  {
    version: '0.110.0',
    date: '2026-10-20',
    text: 'Wrap clue scroll text around the host on phones.',
  },
  {
    version: '0.109.2',
    date: '2026-10-20',
    text: 'Enforce stricter client-server message validation.',
  },
  {
    version: '0.109.1',
    date: '2026-10-20',
    text: 'Tidy up client code behind the scenes.',
  },
  {
    version: '0.109.0',
    date: '2026-10-20',
    text: 'Fit the settings menu onto phone screens.',
  },
  {
    version: '0.108.1',
    date: '2026-10-20',
    text: 'Let self-hosters build price questions in one command.',
  },
  {
    version: '0.108.0',
    date: '2026-10-20',
    text: "Add Who's That NPC? round.",
  },
  {
    version: '0.107.0',
    date: '2026-10-20',
    text: 'Tone down the Toktz theme colours.',
  },
  {
    version: '0.106.0',
    date: '2026-10-20',
    text: 'Give the Toktz boar TzHaar colours.',
  },
  {
    version: '0.105.0',
    date: '2026-10-19',
    text: 'Rename the Prifddinas theme to Gauntlet.',
  },
  {
    version: '0.104.0',
    date: '2026-10-18',
    text: 'Add three new themes: Jungle, Prifddinas, and Morytania.',
  },
  {
    version: '0.103.0',
    date: '2026-10-18',
    text: 'Give every theme its own sheet and pin.',
  },
  {
    version: '0.102.2',
    date: '2026-10-17',
    text: 'Split room code into smaller parts behind the scenes.',
  },
  {
    version: '0.102.1',
    date: '2026-10-17',
    text: 'Update dependencies.',
  },
  {
    version: '0.102.0',
    date: '2026-10-17',
    text: 'Omit the intro text on random event reveals.',
  },
  {
    version: '0.101.0',
    date: '2026-10-17',
    text: 'Hide the count on gems that nobody picked.',
  },
  {
    version: '0.100.0',
    date: '2026-10-17',
    text: 'Show random event counts separately from round questions in the lobby.',
  },
  {
    version: '0.99.2',
    date: '2026-10-17',
    text: 'Schedule dependency updates less noisily.',
  },
  {
    version: '0.99.1',
    date: '2026-10-17',
    text: 'Scan dependencies for security flaws.',
  },
  {
    version: '0.99.0',
    date: '2026-10-17',
    text: 'Show item icons and allow questions to display a picture under the prompt.',
  },
  {
    version: '0.98.0',
    date: '2026-10-17',
    text: 'Allow questions to show an image both while open and on the reveal.',
  },
  {
    version: '0.97.2',
    date: '2026-10-17',
    text: 'Show question pictures in development builds.',
  },
  {
    version: '0.97.1',
    date: '2026-10-17',
    text: 'Update project tracking notes.',
  },
  {
    version: '0.97.0',
    date: '2026-10-17',
    text: 'Stop question picture filenames from giving away the answer.',
  },
  {
    version: '0.96.2',
    date: '2026-10-17',
    text: 'Update project board notes.',
  },
  {
    version: '0.96.1',
    date: '2026-10-17',
    text: 'Tidy up project notes.',
  },
  {
    version: '0.96.0',
    date: '2026-10-16',
    text: 'Group pack questions by host or type in the admin view.',
  },
  {
    version: '0.95.0',
    date: '2026-10-16',
    text: 'Add How to play links from Home and the lobby.',
  },
  {
    version: '0.94.0',
    date: '2026-10-16',
    text: 'Let the host end a round early and jump straight to the standings.',
  },
  {
    version: '0.93.0',
    date: '2026-10-16',
    text: 'Show the Grand Exchange price date once on the splash and in the footer.',
  },
  {
    version: '0.92.0',
    date: '2026-10-16',
    text: 'Hang two lit lanterns on the wall on wide screens in the Jolly theme.',
  },
  {
    version: '0.91.0',
    date: '2026-10-16',
    text: 'Show item icons as theme emblems and rename TzHaar to Toktz.',
  },
  {
    version: '0.90.0',
    date: '2026-10-14',
    text: 'Give every random event NPC their own questions and add Reldo.',
  },
  {
    version: '0.89.2',
    date: '2026-10-13',
    text: 'Add the Fairy Queen and her fairy rings as a random event.',
  },
  {
    version: '0.89.1',
    date: '2026-10-13',
    text: 'Add 33 more questions to Sort It Out.',
  },
  {
    version: '0.89.0',
    date: '2026-10-13',
    text: 'Add a credits page for question authors and thank the OSRS Wiki.',
  },
  {
    version: '0.88.0',
    date: '2026-10-13',
    text: 'Allow suggesting an examine as a Guess the Examine question.',
  },
  {
    version: '0.87.0',
    date: '2026-10-13',
    text: 'Let players answer ordering questions by dragging entries into place.',
  },
  {
    version: '0.86.0',
    date: '2026-10-13',
    text: 'Show how the room split and who picked what on every reveal.',
  },
  {
    version: '0.85.0',
    date: '2026-10-13',
    text: 'Pause one second before revealing once everyone has answered.',
  },
  {
    version: '0.84.0',
    date: '2026-10-13',
    text: 'Hand the stage back from random events one step at a time.',
  },
  {
    version: '0.83.2',
    date: '2026-10-13',
    text: 'Fix a failing test.',
  },
  {
    version: '0.83.1',
    date: '2026-10-13',
    text: 'Keep pack question answers shuffled.',
  },
  {
    version: '0.83.0',
    date: '2026-10-13',
    text: 'Add an internal tool to rehash question IDs in place.',
  },
  {
    version: '0.82.2',
    date: '2026-10-13',
    text: 'Prevent hand-editing of generated question packs.',
  },
  {
    version: '0.82.1',
    date: '2026-10-13',
    text: 'Open Who Said That? and Odd One Out suggestions directly on a prompt.',
  },
  {
    version: '0.82.0',
    date: '2026-10-13',
    text: "Show each random event's own NPC in the admin suggestion list.",
  },
  {
    version: '0.81.0',
    date: '2026-10-13',
    text: 'Make Guess the Examine multiple choice with four to six items to pick from.',
  },
  {
    version: '0.80.3',
    date: '2026-10-13',
    text: "Move the admin button into Home's Suggest panel.",
  },
  {
    version: '0.80.2',
    date: '2026-10-11',
    text: 'Add more questions, including ones for the Drunken Dwarf.',
  },
  {
    version: '0.80.1',
    date: '2026-10-11',
    text: 'List Scrying Pool and Lost in Gielinor as upcoming rounds.',
  },
  {
    version: '0.80.0',
    date: '2026-10-11',
    text: 'Estimate game duration in minutes on Create and in the lobby.',
  },
  {
    version: '0.79.0',
    date: '2026-10-11',
    text: 'Pick question askers from a row of chatheads and display gems beside answers.',
  },
  {
    version: '0.78.0',
    date: '2026-10-11',
    text: 'Rebuild Create into steps: rounds, rules, and random events.',
  },
  {
    version: '0.77.0',
    date: '2026-10-11',
    text: 'Preview the room code before creating and let the host reroll it.',
  },
  {
    version: '0.76.3',
    date: '2026-10-11',
    text: 'Keep the final question reveal open for the full duration.',
  },
  {
    version: '0.76.2',
    date: '2026-10-11',
    text: 'Preserve room code capitalisation in lists and links.',
  },
  {
    version: '0.76.1',
    date: '2026-10-11',
    text: 'Speed up automated tests.',
  },
  {
    version: '0.76.0',
    date: '2026-10-11',
    text: 'Use word-based room codes and show who is away in the lobby.',
  },
  {
    version: '0.75.0',
    date: '2026-10-11',
    text: 'Add Pick for me on Create to auto-pick rounds or keep them a surprise.',
  },
  {
    version: '0.74.0',
    date: '2026-10-11',
    text: 'Animate the clue scroll smoothly between screens.',
  },
  {
    version: '0.73.0',
    date: '2026-10-09',
    text: "Bump version for the Wise Old Man's hiscores update.",
  },
  {
    version: '0.72.1',
    date: '2026-10-09',
    text: "Style the standings as the Wise Old Man's hiscores.",
  },
  {
    version: '0.72.0',
    date: '2026-10-09',
    text: 'Move the lobby onto the stage with a grid of pets.',
  },
  {
    version: '0.71.0',
    date: '2026-10-09',
    text: 'Type out every line on the clue scroll.',
  },
  {
    version: '0.70.0',
    date: '2026-10-09',
    text: 'Shuffle answer options so the right one is not always in the same spot.',
  },
  {
    version: '0.69.0',
    date: '2026-10-09',
    text: 'Add a full-screen switch in the lobby and on the splash.',
  },
  {
    version: '0.68.0',
    date: '2026-10-09',
    text: 'Adjust question timers automatically based on question type and room pace.',
  },
  {
    version: '0.67.0',
    date: '2026-10-08',
    text: 'Add typed-answer questions to Bestiary and Drop Table.',
  },
  {
    version: '0.66.1',
    date: '2026-10-08',
    text: 'Fix a failing test.',
  },
  {
    version: '0.66.0',
    date: '2026-10-08',
    text: 'Let players write Pick All That Apply questions for rooms or suggestions.',
  },
  {
    version: '0.65.0',
    date: '2026-10-08',
    text: 'Add closest-number and pick-all-that-apply questions to Know Your Content Creator.',
  },
  {
    version: '0.64.0',
    date: '2026-10-08',
    text: 'Add pick-all-that-apply questions to Bestiary.',
  },
  {
    version: '0.63.2',
    date: '2026-10-08',
    text: 'Fix a failing test.',
  },
  {
    version: '0.63.1',
    date: '2026-10-08',
    text: 'Add 40 more Drop Table questions.',
  },
  {
    version: '0.63.0',
    date: '2026-10-08',
    text: 'Add pick-all-that-apply, closest-number, and player-submitted questions to Drop Table.',
  },
  {
    version: '0.62.1',
    date: '2026-10-08',
    text: 'Add setup notes for self-hosters.',
  },
  {
    version: '0.62.0',
    date: '2026-10-08',
    text: "Show the inn's hero on Home's stage, dressed for each theme.",
  },
  {
    version: '0.61.1',
    date: '2026-10-07',
    text: 'Shrink the data container image.',
  },
  {
    version: '0.61.0',
    date: '2026-10-07',
    text: 'Show a preview card when sharing links.',
  },
  {
    version: '0.60.0',
    date: '2026-10-07',
    text: 'Match the sign and tab icon to the active theme.',
  },
  {
    version: '0.59.1',
    date: '2026-10-07',
    text: 'Add the inn logo.',
  },
  {
    version: '0.59.0',
    date: '2026-10-07',
    text: 'Track how games end, how long they last, and how players join in Admin.',
  },
  {
    version: '0.58.3',
    date: '2026-10-07',
    text: 'Keep your chosen pet across games.',
  },
  {
    version: '0.58.2',
    date: '2026-10-07',
    text: 'Keep the Submit button visible on phones for Pick All That Apply.',
  },
  {
    version: '0.58.1',
    date: '2026-10-06',
    text: 'Rename internal plan notes.',
  },
  {
    version: '0.58.0',
    date: '2026-10-06',
    text: 'Allow admins to rename and remove popular items.',
  },
  {
    version: '0.57.0',
    date: '2026-10-06',
    text: 'Allow adding an intro to suggested NPC questions.',
  },
  {
    version: '0.56.0',
    date: '2026-10-06',
    text: 'Rebalance Home with icon buttons, dates under room codes, and a no-cookies notice.',
  },
  {
    version: '0.55.0',
    date: '2026-10-06',
    text: 'Allow admins to edit and delete pack questions.',
  },
  {
    version: '0.54.0',
    date: '2026-10-06',
    text: 'Allow suggestions to include quotes and cite sources beyond the wiki.',
  },
  {
    version: '0.53.0',
    date: '2026-10-06',
    text: 'Allow suggesting Release Order questions.',
  },
  {
    version: '0.52.0',
    date: '2026-10-06',
    text: 'Allow suggesting Sort It Out questions.',
  },
  {
    version: '0.51.0',
    date: '2026-10-05',
    text: 'Allow reporting problems with questions.',
  },
  {
    version: '0.50.0',
    date: '2026-10-05',
    text: 'Set the clue scroll text in the RuneScape font.',
  },
  {
    version: '0.49.1',
    date: '2026-10-05',
    text: 'Make an automated test more reliable.',
  },
  {
    version: '0.49.0',
    date: '2026-10-05',
    text: 'Add Odd One Out round.',
  },
  {
    version: '0.48.0',
    date: '2026-10-05',
    text: 'Open every round with a splash screen and keep reveals up for 6 seconds.',
  },
  {
    version: '0.47.3',
    date: '2026-10-05',
    text: 'Start Create with no rounds pre-selected.',
  },
  {
    version: '0.47.2',
    date: '2026-10-05',
    text: 'Remove an outdated internal note.',
  },
  {
    version: '0.47.1',
    date: '2026-10-05',
    text: 'Make an automated test more reliable.',
  },
  {
    version: '0.47.0',
    date: '2026-10-05',
    text: 'Let players pick a pet as their avatar.',
  },
  {
    version: '0.46.0',
    date: '2026-10-05',
    text: 'Add pets with chatheads and metamorphoses.',
  },
  {
    version: '0.45.0',
    date: '2026-10-05',
    text: 'Add 22 new Sort It Out questions plus ordering questions in Bestiary.',
  },
  {
    version: '0.44.0',
    date: '2026-10-05',
    text: 'Add Bestiary and Drop Table rounds.',
  },
  {
    version: '0.43.0',
    date: '2026-10-04',
    text: 'Add Who Said That? and Know Your Content Creator rounds.',
  },
  {
    version: '0.42.1',
    date: '2026-10-04',
    text: 'Paginate past games five per page.',
  },
  {
    version: '0.42.0',
    date: '2026-10-04',
    text: 'Show roughly when rooms you created will be cleaned up.',
  },
  {
    version: '0.41.1',
    date: '2026-10-04',
    text: 'Drop a stale internal task.',
  },
  {
    version: '0.41.0',
    date: '2026-10-04',
    text: 'Add a Hi-scores button to past games and allow removing them.',
  },
  {
    version: '0.40.0',
    date: '2026-10-04',
    text: 'Show how many more rooms you can host on Create and Home.',
  },
  {
    version: '0.39.0',
    date: '2026-10-04',
    text: 'Add Sort It Out round.',
  },
  {
    version: '0.38.0',
    date: '2026-10-04',
    text: 'Add Put in Order question type.',
  },
  {
    version: '0.37.0',
    date: '2026-10-04',
    text: 'Let players suggest questions, examines, and items for the game.',
  },
  {
    version: '0.36.0',
    date: '2026-10-04',
    text: 'Reserve room for two lines on the clue scroll.',
  },
  {
    version: '0.35.2',
    date: '2026-10-04',
    text: 'Count right picks on reveals in Pick All That Apply.',
  },
  {
    version: '0.35.1',
    date: '2026-10-04',
    text: 'Rank closest-number guesses on reveals.',
  },
  {
    version: '0.35.0',
    date: '2026-10-03',
    text: 'Add Pick All That Apply question type.',
  },
  {
    version: '0.34.3',
    date: '2026-10-03',
    text: 'Type out random event intros, pause, then type the question.',
  },
  {
    version: '0.34.2',
    date: '2026-10-03',
    text: 'Consolidate Guess the Examine into one file.',
  },
  {
    version: '0.34.1',
    date: '2026-10-03',
    text: 'Open random events with an intro before their question.',
  },
  {
    version: '0.34.0',
    date: '2026-10-03',
    text: 'Play random events as interludes where the NPC walks on and asks the question.',
  },
  {
    version: '0.33.1',
    date: '2026-10-03',
    text: 'Show each upcoming round host on Create.',
  },
  {
    version: '0.33.0',
    date: '2026-10-03',
    text: 'Add Random Events Only round with questions from event NPCs.',
  },
  {
    version: '0.32.0',
    date: '2026-10-03',
    text: 'Show the random event NPC standing on the stage.',
  },
  {
    version: '0.31.1',
    date: '2026-10-02',
    text: 'Run self-hoster data scripts in a container.',
  },
  {
    version: '0.31.0',
    date: '2026-10-02',
    text: 'Let self-hosters fetch NPC and trophy art in one command.',
  },
  {
    version: '0.30.1',
    date: '2026-10-02',
    text: 'Add notes on the question packs.',
  },
  {
    version: '0.30.0',
    date: '2026-10-02',
    text: 'Ask new players to pick a name before their first room.',
  },
  {
    version: '0.29.0',
    date: '2026-10-02',
    text: 'Add desktop layout for Home featuring the Wise Old Man.',
  },
  {
    version: '0.28.0',
    date: '2026-10-02',
    text: 'Let hosts admit players to invite-only rooms from the lobby.',
  },
  {
    version: '0.27.0',
    date: '2026-10-02',
    text: 'Give random events their own panel on Create and tuck extra options under Advanced.',
  },
  {
    version: '0.26.0',
    date: '2026-10-02',
    text: 'Place screen text on panels and the footer on its own band.',
  },
  {
    version: '0.25.0',
    date: '2026-10-02',
    text: 'Let hosts write custom questions for a room.',
  },
  {
    version: '0.24.1',
    date: '2026-10-02',
    text: 'Tidy up code comments.',
  },
  {
    version: '0.24.0',
    date: '2026-10-02',
    text: 'Add public lobbies: list your room on Home for anyone to join.',
  },
  {
    version: '0.23.0',
    date: '2026-10-01',
    text: 'Add TzHaar theme with an obsidian floor split by glowing lava.',
  },
  {
    version: '0.22.0',
    date: '2026-10-01',
    text: 'Add Party Room theme with a checkered floor strewn with balloons.',
  },
  {
    version: '0.21.0',
    date: '2026-10-01',
    text: 'Add invite links so invite-only rooms admit anyone with the link.',
  },
  {
    version: '0.20.0',
    date: '2026-10-01',
    text: 'Add surprise rounds so players learn each round only as it starts.',
  },
  {
    version: '0.19.0',
    date: '2026-10-01',
    text: 'Add an admin view with live rooms and charts.',
  },
  {
    version: '0.18.0',
    date: '2026-10-01',
    text: 'Count rooms, games, rounds, and players per day.',
  },
  {
    version: '0.17.0',
    date: '2026-10-01',
    text: 'Keep finished games listed on Home with their players.',
  },
  {
    version: '0.16.0',
    date: '2026-10-01',
    text: 'Show in the lobby when someone is picking a name and lock names once the game starts.',
  },
  {
    version: '0.15.0',
    date: '2026-10-01',
    text: 'Redesign Create with a card per round.',
  },
  {
    version: '0.14.0',
    date: '2026-09-30',
    text: 'Consolidate top bar controls into one menu.',
  },
  {
    version: '0.13.2',
    date: '2026-09-30',
    text: 'Move open tasks to GitHub issues.',
  },
  {
    version: '0.13.1',
    date: '2026-09-30',
    text: 'Update internal notes.',
  },
  {
    version: '0.13.0',
    date: '2026-09-29',
    text: 'Give every round a wiki host with their own voice lines.',
  },
  {
    version: '0.12.0',
    date: '2026-09-27',
    text: 'Play round splashes and every question on a clue scroll on the stage.',
  },
  {
    version: '0.11.1',
    date: '2026-09-27',
    text: 'Hold random events on screen for 3.5 seconds.',
  },
  {
    version: '0.11.0',
    date: '2026-09-26',
    text: 'Allow a host to run up to five rooms at once.',
  },
  {
    version: '0.10.2',
    date: '2026-09-26',
    text: 'Fix a build issue.',
  },
  {
    version: '0.10.1',
    date: '2026-09-26',
    text: 'Run CI builds on self-hosted machines.',
  },
  {
    version: '0.10.0',
    date: '2026-09-26',
    text: 'Add a footer, a GitHub link in the top bar, and branding options for self-hosters.',
  },
  {
    version: '0.9.1',
    date: '2026-09-26',
    text: 'Release the codebase as open source under AGPL-3.0.',
  },
  {
    version: '0.9.0',
    date: '2026-09-26',
    text: "Follow the OSRS Wiki's rate-limit rules when fetching data.",
  },
  {
    version: '0.8.0',
    date: '2026-09-26',
    text: 'Cap questions at six answers, one per gem.',
  },
  {
    version: '0.7.0',
    date: '2026-09-26',
    text: 'Use your profile name automatically when creating a room without asking again.',
  },
  {
    version: '0.6.28',
    date: '2026-09-25',
    text: 'Keep internal notes up to date.',
  },
  {
    version: '0.6.27',
    date: '2026-09-25',
    text: 'Let browsers that block storage still join a room.',
  },
  {
    version: '0.6.26',
    date: '2026-09-25',
    text: 'Add tests covering every phase of a game.',
  },
  {
    version: '0.6.25',
    date: '2026-09-25',
    text: 'Speed up and tighten automated tests.',
  },
  {
    version: '0.6.24',
    date: '2026-09-25',
    text: 'Announce each question and outcome for screen readers.',
  },
  {
    version: '0.6.23',
    date: '2026-09-25',
    text: 'Ask for confirmation before Kick, Promote, and End game.',
  },
  {
    version: '0.6.22',
    date: '2026-09-25',
    text: 'Count room lifetime from when the game starts.',
  },
  {
    version: '0.6.21',
    date: '2026-09-25',
    text: 'Reconnect phones immediately when waking from sleep.',
  },
  {
    version: '0.6.20',
    date: '2026-09-25',
    text: 'Award 750, 500, or 250 points for closest guesses.',
  },
  {
    version: '0.6.19',
    date: '2026-09-25',
    text: 'Tighten validation on custom host questions.',
  },
  {
    version: '0.6.18',
    date: '2026-09-25',
    text: 'Preload answer lists ahead of time.',
  },
  {
    version: '0.6.17',
    date: '2026-09-25',
    text: 'Show the explanation on reveals in Guess the Examine.',
  },
  {
    version: '0.6.16',
    date: '2026-09-25',
    text: 'Count near misses as partly right on reveals.',
  },
  {
    version: '0.6.15',
    date: '2026-09-25',
    text: 'Unify answer checking across question types.',
  },
  {
    version: '0.6.14',
    date: '2026-09-25',
    text: 'Allow rounds to mix question types.',
  },
  {
    version: '0.6.13',
    date: '2026-09-25',
    text: 'Make deployments safer.',
  },
  {
    version: '0.6.12',
    date: '2026-09-25',
    text: 'Rate-limit room joins and lookups.',
  },
  {
    version: '0.6.11',
    date: '2026-09-24',
    text: 'Identify questions by stable IDs.',
  },
  {
    version: '0.6.10',
    date: '2026-09-24',
    text: 'Close rooms automatically when the last player leaves.',
  },
  {
    version: '0.6.9',
    date: '2026-09-24',
    text: 'Time answers on server arrival and restart stuck rooms automatically.',
  },
  {
    version: '0.6.8',
    date: '2026-09-24',
    text: 'Make an automated test more reliable.',
  },
  {
    version: '0.6.7',
    date: '2026-09-24',
    text: 'Validate player names, typed answers, and custom questions.',
  },
  {
    version: '0.6.6',
    date: '2026-09-24',
    text: 'Reduce server memory usage.',
  },
  {
    version: '0.6.5',
    date: '2026-09-24',
    text: 'Limit concurrent connections and message rates.',
  },
  {
    version: '0.6.4',
    date: '2026-09-24',
    text: 'Review code and jot down ideas for new rounds.',
  },
  {
    version: '0.6.3',
    date: '2026-09-23',
    text: 'Document rules for writing tests.',
  },
  {
    version: '0.6.2',
    date: '2026-09-23',
    text: 'Document project house rules.',
  },
  {
    version: '0.6.1',
    date: '2026-09-22',
    text: 'Draft a list of upcoming rounds.',
  },
  {
    version: '0.6.0',
    date: '2026-09-22',
    text: 'Give random events a face, a theme, and their own questions.',
  },
  {
    version: '0.5.0',
    date: '2026-09-22',
    text: 'Redesign question screens with gem buttons, a points slot, and a timer bar.',
  },
  {
    version: '0.4.0',
    date: '2026-09-22',
    text: 'Add standings and a podium between rounds.',
  },
  {
    version: '0.3.1',
    date: '2026-09-22',
    text: 'Reorganise internal notes.',
  },
  {
    version: '0.3.0',
    date: '2026-09-22',
    text: 'Add multiple choice, closest number, typed answers, and random events.',
  },
  {
    version: '0.2.0',
    date: '2026-09-21',
    text: 'Add Guess the Examine round.',
  },
  {
    version: '0.1.0',
    date: '2026-09-21',
    text: 'Launch initial version: host rooms, join by code, and play More or Less and The Price is Right.',
  },
  {
    version: '0.0.0',
    date: '2026-09-13',
    text: 'Start building the Jolly Boar Inn quiz night project.',
  },
]
