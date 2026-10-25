/**
 * What's new, newest first: one entry per version `VERSION` has held, a stacked PR's too,
 * dated the day it reached `main`, and 0.0 for the first commit, in words a player follows.
 * A minor gets up to two lines, a patch one; the footer's sheet nests each patch under its minor.
 */

export interface ChangelogEntry {
  version: string
  /** The day the version reached `main`, as an ISO date. */
  date: string
  text: string
}

/** Up to two lines in the sheet on a desktop. */
export const MINOR_MAX = 120
/** One line in the sheet on a desktop. */
export const PATCH_MAX = 60

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
    version: '0.178.1',
    date: '2026-10-25',
    text: 'The top bar names the coming round on its splash.',
  },
  {
    version: '0.178.0',
    date: '2026-10-25',
    text: 'On a shuffled or surprise night, the splash shows who hosted the rounds already played.',
  },
  {
    version: '0.177.0',
    date: '2026-10-25',
    text: 'The round scroll reads more cleanly, unknown rounds show a "?", and the countdown sits by Ready.',
  },
  {
    version: '0.176.0',
    date: '2026-10-25',
    text: 'Ready is now a switch that shows clearly whether you are ready.',
  },
  {
    version: '0.175.0',
    date: '2026-10-25',
    text: 'Hosts now ask each question themselves, in lines that change every time. Random events hand back without a flicker.',
  },
  {
    version: '0.174.0',
    date: '2026-10-25',
    text: 'Hosts and random event NPCs now talk in a dialogue box like the game’s. The timer says what comes next.',
  },
  {
    version: '0.173.0',
    date: '2026-10-25',
    text: 'In the room, every theme now centres the words on its sheet, the lobby code included.',
  },
  {
    version: '0.172.0',
    date: '2026-10-25',
    text: 'In the room, the host and the sheet no longer jump when the answers are revealed.',
  },
  {
    version: '0.171.0',
    date: '2026-10-24',
    text: 'On a computer, the reveal shows who picked each answer, right on the answer.',
  },
  {
    version: '0.170.0',
    date: '2026-10-24',
    text: 'Between rounds the hiscores say who hosts the next round and count down to it.',
  },
  {
    version: '0.169.0',
    date: '2026-10-24',
    text: 'Before each round, a row of tonight’s hosts shows how far the night has come, and a large countdown.',
  },
  {
    version: '0.168.0',
    date: '2026-10-24',
    text: 'The lobby shows the code and invite link large, and a card for each of tonight’s rounds.',
  },
  {
    version: '0.167.0',
    date: '2026-10-24',
    text: 'After each question the table beside the stage shows who picked what, with a count and a bar per answer.',
  },
  {
    version: '0.166.0',
    date: '2026-10-24',
    text: 'On a laptop the question and its answers use the width of the screen, each answer sized to fit.',
  },
  {
    version: '0.165.0',
    date: '2026-10-24',
    text: 'The host now speaks in a bubble above the question, and a random event’s NPC in one on the right.',
  },
  {
    version: '0.164.0',
    date: '2026-10-24',
    text: 'The table beside the stage shows who has answered and who is still thinking, by team in a team game.',
  },
  {
    version: '0.163.0',
    date: '2026-10-24',
    text: "The host's buttons moved from under the question to a Host menu in the top bar.",
  },
  {
    version: '0.162.0',
    date: '2026-10-24',
    text: 'Rooms fill a laptop or desktop screen: the stage on the left, who is at the table on the right.',
  },
  {
    version: '0.161.1',
    date: '2026-10-24',
    text: 'A behind-the-scenes security update.',
  },
  {
    version: '0.161.0',
    date: '2026-10-23',
    text: 'The TV shows the room code and who is at the table, then every splash and the standings, large.',
  },
  {
    version: '0.160.0',
    date: '2026-10-23',
    text: 'The TV shows the question large, with who is still to answer beside it, then the whole reveal.',
  },
  {
    version: '0.159.0',
    date: '2026-10-23',
    text: 'With a TV in the room, phones show only the answers and your points; the question is on the TV.',
  },
  {
    version: '0.158.0',
    date: '2026-10-23',
    text: "Hosts can make a screen the room's TV from its pet in the lobby, and turn it back.",
  },
  {
    version: '0.157.0',
    date: '2026-10-23',
    text: 'The TV now only watches: it never answers, holds up a round or shows in the standings.',
  },
  {
    version: '0.156.0',
    date: '2026-10-23',
    text: 'A room can now have a TV: one screen that shows the questions to everyone and plays no part.',
  },
  {
    version: '0.155.2',
    date: '2026-10-23',
    text: 'Screens now fade into each other instead of flashing.',
  },
  {
    version: '0.155.1',
    date: '2026-10-23',
    text: 'Dropped the screen-reader announcements.',
  },
  {
    version: '0.155.0',
    date: '2026-10-23',
    text: "Who's That NPC? can now show an NPC's full picture: pick it out from its look-alikes. Suggest your own!",
  },
  {
    version: '0.154.1',
    date: '2026-10-23',
    text: 'Removed the screen-reader live regions.',
  },
  {
    version: '0.154.0',
    date: '2026-10-23',
    text: 'Search engines can now find the inn.',
  },
  {
    version: '0.153.0',
    date: '2026-10-23',
    text: 'Questions players find easier or harder than marked can now move tier, random events’ included.',
  },
  {
    version: '0.152.0',
    date: '2026-10-23',
    text: 'The inn now keeps how well players do on each question, so we can tune how hard it is.',
  },
  {
    version: '0.151.3',
    date: '2026-10-23',
    text: 'On a phone, Suggest a question lists one choice per row.',
  },
  {
    version: '0.151.2',
    date: '2026-10-23',
    text: "Hosts' faces stay on their cards on an iPhone.",
  },
  {
    version: '0.151.1',
    date: '2026-10-23',
    text: 'Previews of suggestions with no round show the question.',
  },
  {
    version: '0.151.0',
    date: '2026-10-22',
    text: 'When you suggest a question, say how hard it is: Easy, Medium or Hard.',
  },
  {
    version: '0.150.0',
    date: '2026-10-22',
    text: 'Torches now burn on the Wilderness walls, and sulphur vents glow beside the page in Toktz.',
  },
  {
    version: '0.149.1',
    date: '2026-10-22',
    text: 'Difficulty now changes the questions in every round.',
  },
  {
    version: '0.149.0',
    date: '2026-10-22',
    text: 'Try a question you suggest: answer its preview, then flip to the reveal to see the points it gives.',
  },
  {
    version: '0.148.0',
    date: '2026-10-22',
    text: 'In a team game the final presents the top teams, fifth to first, instead of single players.',
  },
  {
    version: '0.147.2',
    date: '2026-10-22',
    text: 'Drop rates and other estimates now pay near guesses too.',
  },
  {
    version: '0.147.1',
    date: '2026-10-22',
    text: 'Closest number pays exact guesses, and near ones if it says.',
  },
  {
    version: '0.147.0',
    date: '2026-10-22',
    text: 'The question and explanation boxes on Create and Suggest show an example for the round.',
  },
  {
    version: '0.146.0',
    date: '2026-10-22',
    text: "In a team game your screen wears your god's colours: the top bar, the timer and a frame round the window.",
  },
  {
    version: '0.145.0',
    date: '2026-10-22',
    text: 'Create asks how you play: Individuals or Teams.',
  },
  {
    version: '0.144.1',
    date: '2026-10-22',
    text: 'New examines, odd ones out and a question from Reldo.',
  },
  {
    version: '0.144.0',
    date: '2026-10-22',
    text: 'Credits in every footer, a tick for ready players, notices that float, and buttons that wait out a limit.',
  },
  {
    version: '0.143.0',
    date: '2026-10-21',
    text: 'New round: Minigame Madness, hosted by Lanthus. Prizes, points and places from Castle Wars to Tempoross.',
  },
  {
    version: '0.142.0',
    date: '2026-10-21',
    text: 'How to play draws the slider questions as a slider, in one row for prices and numbers.',
  },
  {
    version: '0.141.0',
    date: '2026-10-21',
    text: 'A new theme: Zanaris, the fairy city, with its mushrooms and the Cosmic altar sign.',
  },
  {
    version: '0.140.0',
    date: '2026-10-21',
    text: 'Bananas and monkey nuts lie in the Jungle grass; cacti, camels and waterskins on the Pollnivneach sand.',
  },
  {
    version: '0.139.0',
    date: '2026-10-21',
    text: 'Hosts can pick easy, mixed or hard questions under House rules. Random events still ask anything.',
  },
  {
    version: '0.138.0',
    date: '2026-10-21',
    text: 'The host of a team game can add and remove gods in the lobby, keeping two to six.',
  },
  {
    version: '0.137.0',
    date: '2026-10-21',
    text: 'In a team game, each answer’s reveal shows how every team did: its players’ middle score on that question.',
  },
  {
    version: '0.136.0',
    date: '2026-10-21',
    text: 'Team games rank the gods between rounds and at the end, each team’s players under it. Past games names the winners.',
  },
  {
    version: '0.135.0',
    date: '2026-10-21',
    text: 'In a team game, tap a god in the lobby to join it. The host can move players, and starts once everyone has a team.',
  },
  {
    version: '0.134.0',
    date: '2026-10-21',
    text: 'Create can now make a team game: turn Teams on and tick two to six gods. How to play explains how teams score.',
  },
  {
    version: '0.133.0',
    date: '2026-10-21',
    text: 'Getting ready for team games: each team scores the average of its members, so a silent member counts.',
  },
  {
    version: '0.132.0',
    date: '2026-10-21',
    text: 'Getting ready for team games: there, a right answer is worth the same however long you take.',
  },
  {
    version: '0.131.0',
    date: '2026-10-21',
    text: 'Getting ready for team games: players can join a god in the lobby, and the host can move them.',
  },
  {
    version: '0.130.0',
    date: '2026-10-21',
    text: 'Getting ready for team games: a room can now be made with two to six gods as its teams.',
  },
  {
    version: '0.129.0',
    date: '2026-10-21',
    text: 'The host now answers and scores on the questions they wrote, like everyone else.',
  },
  {
    version: '0.128.0',
    date: '2026-10-21',
    text: 'Getting ready for team games: each of the six gods gets its symbol and colours.',
  },
  {
    version: '0.127.0',
    date: '2026-10-21',
    text: "What's new lists every version, also those released together in one go.",
  },
  {
    version: '0.126.0',
    date: '2026-10-21',
    text: 'Pick all that apply now works like Put in order: drag the right answers into a basket.',
  },
  {
    version: '0.125.0',
    date: '2026-10-21',
    text: 'Write your own Match them up questions on Create, and suggest them for Bestiary, Drop Table and the NPCs.',
  },
  {
    version: '0.124.0',
    date: '2026-10-21',
    text: 'New question type, Match them up: drag the right answer onto each one. Some answers are left over.',
  },
  {
    version: '0.123.0',
    date: '2026-10-21',
    text: 'Broav now greets you on the Suggest page, and stands in wherever an NPC has no picture.',
  },
  {
    version: '0.122.0',
    date: '2026-10-21',
    text: 'Some number questions now use a slider: no typing, and a near guess still scores.',
  },
  {
    version: '0.121.0',
    date: '2026-10-21',
    text: 'Random events clear the scroll before it slides over, and again before handing it back.',
  },
  {
    version: '0.120.1',
    date: '2026-10-21',
    text: 'The answer list no longer scrolls the page.',
  },
  {
    version: '0.120.0',
    date: '2026-10-21',
    text: "The credits open as a popup from Home's footer, instead of a page of their own.",
  },
  {
    version: '0.119.0',
    date: '2026-10-21',
    text: "What's new: this list, opened from the version number in the footer.",
  },
  {
    version: '0.118.0',
    date: '2026-10-21',
    text: 'The Price is Right is answered with a slider: the closer your guess, the more points.',
  },
  {
    version: '0.117.0',
    date: '2026-10-21',
    text: 'Suggest warns when the game already has a question like yours.',
  },
  {
    version: '0.116.0',
    date: '2026-10-21',
    text: 'Not sure where it fits? Suggest a question with no round.',
  },
  {
    version: '0.115.0',
    date: '2026-10-21',
    text: 'Suggest describes what each round asks for.',
  },
  {
    version: '0.114.0',
    date: '2026-10-21',
    text: "Suggest lists a round's questions beside the editor.",
  },
  {
    version: '0.113.0',
    date: '2026-10-21',
    text: 'An NPC can ask a Put in order question on Suggest.',
  },
  {
    version: '0.112.0',
    date: '2026-10-21',
    text: 'Suggest asks what an NPC question is about.',
  },
  {
    version: '0.111.0',
    date: '2026-10-20',
    text: 'A new theme: the Corrupted Gauntlet, with a corrupted boar.',
  },
  {
    version: '0.110.0',
    date: '2026-10-20',
    text: "On a phone, the clue scroll's words wrap around the host.",
  },
  {
    version: '0.109.2',
    date: '2026-10-20',
    text: 'Behind the scenes: stricter messages to and from the server.',
  },
  {
    version: '0.109.1',
    date: '2026-10-20',
    text: 'Behind the scenes: tidier client code.',
  },
  {
    version: '0.109.0',
    date: '2026-10-20',
    text: 'The settings menu fits on a phone.',
  },
  {
    version: '0.108.1',
    date: '2026-10-20',
    text: 'Self-hosters build their own price questions in one command.',
  },
  {
    version: '0.108.0',
    date: '2026-10-20',
    text: "A new round: Who's That NPC?",
  },
  {
    version: '0.107.0',
    date: '2026-10-20',
    text: 'The Toktz theme is calmer.',
  },
  {
    version: '0.106.0',
    date: '2026-10-20',
    text: "The Toktz boar wears a TzHaar's colours.",
  },
  {
    version: '0.105.0',
    date: '2026-10-19',
    text: 'The Prifddinas theme is now called the Gauntlet.',
  },
  {
    version: '0.104.0',
    date: '2026-10-18',
    text: 'Three new themes: Jungle, Prifddinas and Morytania.',
  },
  {
    version: '0.103.0',
    date: '2026-10-18',
    text: 'Every theme has its own sheet and pin.',
  },
  {
    version: '0.102.2',
    date: '2026-10-17',
    text: 'Behind the scenes: the room code is split into parts.',
  },
  {
    version: '0.102.1',
    date: '2026-10-17',
    text: 'Behind the scenes: updated dependencies.',
  },
  {
    version: '0.102.0',
    date: '2026-10-17',
    text: "A random event's reveal leaves out its intro.",
  },
  {
    version: '0.101.0',
    date: '2026-10-17',
    text: 'A gem nobody picked shows no count.',
  },
  {
    version: '0.100.0',
    date: '2026-10-17',
    text: "The lobby counts random events apart from the rounds' questions.",
  },
  {
    version: '0.99.2',
    date: '2026-10-17',
    text: 'Behind the scenes: calmer dependency updates.',
  },
  {
    version: '0.99.1',
    date: '2026-10-17',
    text: 'Behind the scenes: dependencies are scanned for flaws.',
  },
  {
    version: '0.99.0',
    date: '2026-10-17',
    text: 'Items show their icons, and a question can have a picture under its prompt.',
  },
  {
    version: '0.98.0',
    date: '2026-10-17',
    text: 'A pack question can show a picture, open and on its reveal.',
  },
  {
    version: '0.97.2',
    date: '2026-10-17',
    text: 'Behind the scenes: pictures show in development builds.',
  },
  {
    version: '0.97.1',
    date: '2026-10-17',
    text: 'Behind the scenes: notes on how work is tracked.',
  },
  {
    version: '0.97.0',
    date: '2026-10-17',
    text: "A question's picture no longer gives its answer away by its file name.",
  },
  {
    version: '0.96.2',
    date: '2026-10-17',
    text: 'Behind the scenes: notes on the project board.',
  },
  {
    version: '0.96.1',
    date: '2026-10-17',
    text: 'Behind the scenes: tidier notes.',
  },
  {
    version: '0.96.0',
    date: '2026-10-16',
    text: 'The admin view groups pack questions by host or type.',
  },
  {
    version: '0.95.0',
    date: '2026-10-16',
    text: 'How to play, from Home and the lobby.',
  },
  {
    version: '0.94.0',
    date: '2026-10-16',
    text: 'The host can end a round early and go straight to the standings.',
  },
  {
    version: '0.93.0',
    date: '2026-10-16',
    text: 'Grand Exchange prices are dated once, on the splash and in the footer.',
  },
  {
    version: '0.92.0',
    date: '2026-10-16',
    text: 'The Jolly theme hangs two lit lanterns on the wall on wide screens.',
  },
  {
    version: '0.91.0',
    date: '2026-10-16',
    text: 'Themes show item icons as emblems, and TzHaar is now called Toktz.',
  },
  {
    version: '0.90.0',
    date: '2026-10-14',
    text: 'Every random event NPC has questions of their own, and Reldo joins them.',
  },
  {
    version: '0.89.2',
    date: '2026-10-13',
    text: 'A new random event: the Fairy Queen and her fairy rings.',
  },
  {
    version: '0.89.1',
    date: '2026-10-13',
    text: 'Sort It Out gets 33 more questions.',
  },
  {
    version: '0.89.0',
    date: '2026-10-13',
    text: 'A credits page for the question authors, and a thank-you to the OSRS Wiki.',
  },
  {
    version: '0.88.0',
    date: '2026-10-13',
    text: 'Suggest an examine as a Guess the Examine question.',
  },
  {
    version: '0.87.0',
    date: '2026-10-13',
    text: 'Ordering questions are answered by dragging the entries into place.',
  },
  {
    version: '0.86.0',
    date: '2026-10-13',
    text: 'Every reveal shows how the room split and who picked what.',
  },
  {
    version: '0.85.0',
    date: '2026-10-13',
    text: 'When everyone has answered, a second passes before the reveal.',
  },
  {
    version: '0.84.0',
    date: '2026-10-13',
    text: 'Random events hand the stage back one step at a time.',
  },
  {
    version: '0.83.2',
    date: '2026-10-13',
    text: 'Behind the scenes: a test fix.',
  },
  {
    version: '0.83.1',
    date: '2026-10-13',
    text: 'Pack questions keep their answers shuffled.',
  },
  {
    version: '0.83.0',
    date: '2026-10-13',
    text: 'Behind the scenes: a tool that fixes question ids in place.',
  },
  {
    version: '0.82.2',
    date: '2026-10-13',
    text: 'Behind the scenes: generated packs are not hand-edited.',
  },
  {
    version: '0.82.1',
    date: '2026-10-13',
    text: 'Who Said That? and Odd One Out suggestions open on a prompt.',
  },
  {
    version: '0.82.0',
    date: '2026-10-13',
    text: "The admin's suggestion list shows each random event's own NPC.",
  },
  {
    version: '0.81.0',
    date: '2026-10-13',
    text: 'Guess the Examine is multiple choice, with four to six names.',
  },
  {
    version: '0.80.3',
    date: '2026-10-13',
    text: "The admin button moves to Home's Suggest panel.",
  },
  {
    version: '0.80.2',
    date: '2026-10-11',
    text: 'More questions, including some for the Drunken Dwarf.',
  },
  {
    version: '0.80.1',
    date: '2026-10-11',
    text: 'Scrying Pool and Lost in Gielinor show as upcoming rounds.',
  },
  {
    version: '0.80.0',
    date: '2026-10-11',
    text: 'Create and the lobby estimate how many minutes a game takes.',
  },
  {
    version: '0.79.0',
    date: '2026-10-11',
    text: 'The question editor picks who asks from a row of chatheads, and answers wear their gem.',
  },
  {
    version: '0.78.0',
    date: '2026-10-11',
    text: 'Create is rebuilt as steps: rounds, rules and random events.',
  },
  {
    version: '0.77.0',
    date: '2026-10-11',
    text: 'The host sees the room code before creating, and can reroll it.',
  },
  {
    version: '0.76.3',
    date: '2026-10-11',
    text: "The last question's reveal lasts as long as the others.",
  },
  {
    version: '0.76.2',
    date: '2026-10-11',
    text: 'Room codes keep their spelling in your lists and links.',
  },
  {
    version: '0.76.1',
    date: '2026-10-11',
    text: 'Behind the scenes: faster tests.',
  },
  {
    version: '0.76.0',
    date: '2026-10-11',
    text: 'Room codes are spelled as words, and the lobby shows who is away.',
  },
  {
    version: '0.75.0',
    date: '2026-10-11',
    text: 'Pick for me: let Create choose the rounds, or keep them a surprise.',
  },
  {
    version: '0.74.0',
    date: '2026-10-11',
    text: 'The clue scroll moves smoothly from screen to screen.',
  },
  {
    version: '0.73.0',
    date: '2026-10-09',
    text: 'No changes: the hiscores move up to a minor version.',
  },
  {
    version: '0.72.1',
    date: '2026-10-09',
    text: "The standings are the Wise Old Man's hiscores.",
  },
  {
    version: '0.72.0',
    date: '2026-10-09',
    text: 'The lobby is on the stage, with a grid of pets.',
  },
  {
    version: '0.71.0',
    date: '2026-10-09',
    text: 'Every line on the clue scroll is typed out.',
  },
  {
    version: '0.70.0',
    date: '2026-10-09',
    text: 'Answer options are shuffled, so the right one is not always in the same place.',
  },
  {
    version: '0.69.0',
    date: '2026-10-09',
    text: 'A full screen switch in the lobby and on the splash.',
  },
  {
    version: '0.68.0',
    date: '2026-10-09',
    text: "Each question's time depends on its type and the room's pace.",
  },
  {
    version: '0.67.0',
    date: '2026-10-08',
    text: 'Bestiary and Drop Table ask typed answers too.',
  },
  {
    version: '0.66.1',
    date: '2026-10-08',
    text: 'Behind the scenes: a test fix.',
  },
  {
    version: '0.66.0',
    date: '2026-10-08',
    text: 'Write pick-all-that-apply questions for your room or as suggestions.',
  },
  {
    version: '0.65.0',
    date: '2026-10-08',
    text: 'Know Your Content Creator plays closest number and pick all that apply.',
  },
  {
    version: '0.64.0',
    date: '2026-10-08',
    text: 'Bestiary plays pick all that apply.',
  },
  {
    version: '0.63.2',
    date: '2026-10-08',
    text: 'Behind the scenes: a test fix.',
  },
  {
    version: '0.63.1',
    date: '2026-10-08',
    text: '40 more Drop Table questions.',
  },
  {
    version: '0.63.0',
    date: '2026-10-08',
    text: 'Drop Table plays pick all that apply and closest number, with new questions from players.',
  },
  {
    version: '0.62.1',
    date: '2026-10-08',
    text: 'Behind the scenes: a note for self-hosters.',
  },
  {
    version: '0.62.0',
    date: '2026-10-08',
    text: "Home's stage shows the inn's hero, dressed for each theme.",
  },
  {
    version: '0.61.1',
    date: '2026-10-07',
    text: 'Behind the scenes: a smaller data image.',
  },
  {
    version: '0.61.0',
    date: '2026-10-07',
    text: 'A shared link shows a preview card.',
  },
  {
    version: '0.60.0',
    date: '2026-10-07',
    text: 'The sign and tab icon follow the theme.',
  },
  {
    version: '0.59.1',
    date: '2026-10-07',
    text: 'The inn gets its logo.',
  },
  {
    version: '0.59.0',
    date: '2026-10-07',
    text: 'The admin view counts how games end, how long they last and how players join.',
  },
  {
    version: '0.58.3',
    date: '2026-10-07',
    text: 'Your pet stays the same between games.',
  },
  {
    version: '0.58.2',
    date: '2026-10-07',
    text: 'Submit stays on screen for pick all that apply on phones.',
  },
  {
    version: '0.58.1',
    date: '2026-10-06',
    text: 'Behind the scenes: renamed plan notes.',
  },
  {
    version: '0.58.0',
    date: '2026-10-06',
    text: 'The admin can rename and remove popular items.',
  },
  {
    version: '0.57.0',
    date: '2026-10-06',
    text: 'Suggestions for NPC questions can have an intro.',
  },
  {
    version: '0.56.0',
    date: '2026-10-06',
    text: 'A rebalanced Home with icon buttons, dates under room codes and a no-cookies notice.',
  },
  {
    version: '0.55.0',
    date: '2026-10-06',
    text: 'The admin can edit and delete pack questions.',
  },
  {
    version: '0.54.0',
    date: '2026-10-06',
    text: 'Suggestions can quote, and cite sources beyond the wiki.',
  },
  {
    version: '0.53.0',
    date: '2026-10-06',
    text: 'Suggest Release Order questions.',
  },
  {
    version: '0.52.0',
    date: '2026-10-06',
    text: 'Suggest Sort It Out questions.',
  },
  {
    version: '0.51.0',
    date: '2026-10-05',
    text: 'Report a problem with a question.',
  },
  {
    version: '0.50.0',
    date: '2026-10-05',
    text: 'The clue scroll is set in the RuneScape font.',
  },
  {
    version: '0.49.1',
    date: '2026-10-05',
    text: 'Behind the scenes: a steadier test.',
  },
  {
    version: '0.49.0',
    date: '2026-10-05',
    text: 'A new round: Odd One Out.',
  },
  {
    version: '0.48.0',
    date: '2026-10-05',
    text: 'Every round opens with a splash, and reveals last 6 seconds.',
  },
  {
    version: '0.47.3',
    date: '2026-10-05',
    text: 'Create starts with no rounds picked.',
  },
  {
    version: '0.47.2',
    date: '2026-10-05',
    text: 'Behind the scenes: an old note removed.',
  },
  {
    version: '0.47.1',
    date: '2026-10-05',
    text: 'Behind the scenes: a steadier test.',
  },
  {
    version: '0.47.0',
    date: '2026-10-05',
    text: 'Pick a pet as your avatar.',
  },
  {
    version: '0.46.0',
    date: '2026-10-05',
    text: 'Pets arrive, with their chatheads and metamorphoses.',
  },
  {
    version: '0.45.0',
    date: '2026-10-05',
    text: 'Sort It Out gets 22 questions, and Bestiary plays put in order.',
  },
  {
    version: '0.44.0',
    date: '2026-10-05',
    text: 'Two new rounds: Bestiary and Drop Table.',
  },
  {
    version: '0.43.0',
    date: '2026-10-04',
    text: 'Two new rounds: Who Said That? and Know Your Content Creator.',
  },
  {
    version: '0.42.1',
    date: '2026-10-04',
    text: 'Past games are listed five to a page.',
  },
  {
    version: '0.42.0',
    date: '2026-10-04',
    text: 'Rooms you created show roughly when they are cleaned up.',
  },
  {
    version: '0.41.1',
    date: '2026-10-04',
    text: 'Behind the scenes: a dropped task.',
  },
  {
    version: '0.41.0',
    date: '2026-10-04',
    text: 'Past games get a Hi-scores button and can be removed.',
  },
  {
    version: '0.40.0',
    date: '2026-10-04',
    text: 'Create and Home show how many rooms you can still host.',
  },
  {
    version: '0.39.0',
    date: '2026-10-04',
    text: 'A new round: Sort It Out.',
  },
  {
    version: '0.38.0',
    date: '2026-10-04',
    text: 'A new question type: put things in order.',
  },
  {
    version: '0.37.0',
    date: '2026-10-04',
    text: 'Suggest questions, examines and items for the game.',
  },
  {
    version: '0.36.0',
    date: '2026-10-04',
    text: 'The clue scroll keeps room for two lines.',
  },
  {
    version: '0.35.2',
    date: '2026-10-04',
    text: 'The reveal counts right picks in pick all that apply.',
  },
  {
    version: '0.35.1',
    date: '2026-10-04',
    text: 'The reveal counts closest-number guesses by rank.',
  },
  {
    version: '0.35.0',
    date: '2026-10-03',
    text: 'A new question type: pick all that apply.',
  },
  {
    version: '0.34.3',
    date: '2026-10-03',
    text: 'A random event types its intro, pauses, then its question.',
  },
  {
    version: '0.34.2',
    date: '2026-10-03',
    text: 'Behind the scenes: one file for Guess the Examine.',
  },
  {
    version: '0.34.1',
    date: '2026-10-03',
    text: 'Random events open with an intro before their question.',
  },
  {
    version: '0.34.0',
    date: '2026-10-03',
    text: 'A random event plays as an interlude: its NPC walks on and asks the question.',
  },
  {
    version: '0.33.1',
    date: '2026-10-03',
    text: "Create shows each upcoming round's host.",
  },
  {
    version: '0.33.0',
    date: '2026-10-03',
    text: 'A new round: Random Events Only, every question from the event NPCs.',
  },
  {
    version: '0.32.0',
    date: '2026-10-03',
    text: 'The random event NPC stands on the stage.',
  },
  {
    version: '0.31.1',
    date: '2026-10-02',
    text: 'Self-hosters run the data scripts in a container.',
  },
  {
    version: '0.31.0',
    date: '2026-10-02',
    text: 'Self-hosters fetch the NPC and trophy art in one command.',
  },
  {
    version: '0.30.1',
    date: '2026-10-02',
    text: 'Behind the scenes: notes on the question packs.',
  },
  {
    version: '0.30.0',
    date: '2026-10-02',
    text: 'New players pick a name before their first room.',
  },
  {
    version: '0.29.0',
    date: '2026-10-02',
    text: 'Home is laid out for desktop and opens with the Wise Old Man.',
  },
  {
    version: '0.28.0',
    date: '2026-10-02',
    text: 'The host can let players into an invite-only room from the lobby.',
  },
  {
    version: '0.27.0',
    date: '2026-10-02',
    text: 'Random events get their own panel on Create, and the rest folds under Advanced.',
  },
  {
    version: '0.26.0',
    date: '2026-10-02',
    text: "Every screen's text sits on a panel, and the footer on a band.",
  },
  {
    version: '0.25.0',
    date: '2026-10-02',
    text: 'Write your own questions for a room.',
  },
  {
    version: '0.24.1',
    date: '2026-10-02',
    text: 'Behind the scenes: tidier code comments.',
  },
  {
    version: '0.24.0',
    date: '2026-10-02',
    text: 'Public lobbies: list your room on Home for anyone to join.',
  },
  {
    version: '0.23.0',
    date: '2026-10-01',
    text: 'A new theme: TzHaar, an obsidian floor split by glowing lava.',
  },
  {
    version: '0.22.0',
    date: '2026-10-01',
    text: 'A new theme: the Party Room, a checkered floor strewn with balloons.',
  },
  {
    version: '0.21.0',
    date: '2026-10-01',
    text: 'Invite links: an invite-only room lets in only those with the link.',
  },
  {
    version: '0.20.0',
    date: '2026-10-01',
    text: 'Surprise rounds: players learn each round as it starts.',
  },
  {
    version: '0.19.0',
    date: '2026-10-01',
    text: 'An admin view with the live rooms and charts.',
  },
  {
    version: '0.18.0',
    date: '2026-10-01',
    text: 'The game counts rooms, games, rounds and players per day.',
  },
  {
    version: '0.17.0',
    date: '2026-10-01',
    text: 'Finished games are kept on Home with the players.',
  },
  {
    version: '0.16.0',
    date: '2026-10-01',
    text: 'The lobby shows when someone is picking a name; names are fixed once the game starts.',
  },
  {
    version: '0.15.0',
    date: '2026-10-01',
    text: 'A new Create page, with a card per round.',
  },
  {
    version: '0.14.0',
    date: '2026-09-30',
    text: 'One menu in the top bar.',
  },
  {
    version: '0.13.2',
    date: '2026-09-30',
    text: 'Behind the scenes: open tasks moved to GitHub.',
  },
  {
    version: '0.13.1',
    date: '2026-09-30',
    text: 'Behind the scenes: updated notes.',
  },
  {
    version: '0.13.0',
    date: '2026-09-29',
    text: 'Every round has a host from the wiki, with lines of their own.',
  },
  {
    version: '0.12.0',
    date: '2026-09-27',
    text: 'The splash and every question play on the stage, on a clue scroll.',
  },
  {
    version: '0.11.1',
    date: '2026-09-27',
    text: 'Random events hold for 3.5 seconds.',
  },
  {
    version: '0.11.0',
    date: '2026-09-26',
    text: 'A host can run up to five rooms at once.',
  },
  {
    version: '0.10.2',
    date: '2026-09-26',
    text: 'Behind the scenes: a build fix.',
  },
  {
    version: '0.10.1',
    date: '2026-09-26',
    text: 'Behind the scenes: builds run on our own machines.',
  },
  {
    version: '0.10.0',
    date: '2026-09-26',
    text: 'A footer, a GitHub link in the top bar, and branding for self-hosters.',
  },
  {
    version: '0.9.1',
    date: '2026-09-26',
    text: 'The code is open source under AGPL-3.0.',
  },
  {
    version: '0.9.0',
    date: '2026-09-26',
    text: "The game follows the OSRS Wiki's rules for fetching its data.",
  },
  {
    version: '0.8.0',
    date: '2026-09-26',
    text: 'Behind the scenes: at most six answers a question, one per gem.',
  },
  {
    version: '0.7.0',
    date: '2026-09-26',
    text: "Create hosts under your profile's name, without asking for one.",
  },
  {
    version: '0.6.28',
    date: '2026-09-25',
    text: 'Behind the scenes: up-to-date notes.',
  },
  {
    version: '0.6.27',
    date: '2026-09-25',
    text: 'A browser that blocks storage can still join a room.',
  },
  {
    version: '0.6.26',
    date: '2026-09-25',
    text: 'Behind the scenes: tests for every phase of a game.',
  },
  {
    version: '0.6.25',
    date: '2026-09-25',
    text: 'Behind the scenes: faster, stricter tests.',
  },
  {
    version: '0.6.24',
    date: '2026-09-25',
    text: 'Screen readers announce each question and how it went.',
  },
  {
    version: '0.6.23',
    date: '2026-09-25',
    text: 'Kick, Promote and End game ask first.',
  },
  {
    version: '0.6.22',
    date: '2026-09-25',
    text: 'A room lasts its full time from when its game starts.',
  },
  {
    version: '0.6.21',
    date: '2026-09-25',
    text: 'A phone that wakes from sleep reconnects at once.',
  },
  {
    version: '0.6.20',
    date: '2026-09-25',
    text: 'Closest guesses earn 750, 500 or 250 points.',
  },
  {
    version: '0.6.19',
    date: '2026-09-25',
    text: 'Behind the scenes: stricter checks on host questions.',
  },
  {
    version: '0.6.18',
    date: '2026-09-25',
    text: 'Behind the scenes: answer lists load ahead of time.',
  },
  {
    version: '0.6.17',
    date: '2026-09-25',
    text: 'Guess the Examine shows its explanation on the reveal.',
  },
  {
    version: '0.6.16',
    date: '2026-09-25',
    text: 'The reveal counts near misses as partly right.',
  },
  {
    version: '0.6.15',
    date: '2026-09-25',
    text: 'Behind the scenes: one way to check every answer.',
  },
  {
    version: '0.6.14',
    date: '2026-09-25',
    text: 'A round can mix question types.',
  },
  {
    version: '0.6.13',
    date: '2026-09-25',
    text: 'Behind the scenes: safer deploys.',
  },
  {
    version: '0.6.12',
    date: '2026-09-25',
    text: 'Behind the scenes: limits on joins and room lookups.',
  },
  {
    version: '0.6.11',
    date: '2026-09-24',
    text: 'Behind the scenes: questions are named by id.',
  },
  {
    version: '0.6.10',
    date: '2026-09-24',
    text: 'A room closes when the last player it waits on leaves.',
  },
  {
    version: '0.6.9',
    date: '2026-09-24',
    text: 'Answers are timed on arrival; a stuck room restarts itself.',
  },
  {
    version: '0.6.8',
    date: '2026-09-24',
    text: 'Behind the scenes: a steadier test.',
  },
  {
    version: '0.6.7',
    date: '2026-09-24',
    text: 'Names, typed answers and custom questions are checked.',
  },
  {
    version: '0.6.6',
    date: '2026-09-24',
    text: 'Behind the scenes: the server uses less memory.',
  },
  {
    version: '0.6.5',
    date: '2026-09-24',
    text: 'Behind the scenes: limits on connections and messages.',
  },
  {
    version: '0.6.4',
    date: '2026-09-24',
    text: 'Behind the scenes: a code review and ideas for new rounds.',
  },
  {
    version: '0.6.3',
    date: '2026-09-23',
    text: 'Behind the scenes: house rules for tests.',
  },
  {
    version: '0.6.2',
    date: '2026-09-23',
    text: 'Behind the scenes: house rules.',
  },
  {
    version: '0.6.1',
    date: '2026-09-22',
    text: 'Behind the scenes: a list of upcoming rounds.',
  },
  {
    version: '0.6.0',
    date: '2026-09-22',
    text: 'Random events get a face, a theme and questions of their own.',
  },
  {
    version: '0.5.0',
    date: '2026-09-22',
    text: 'New question screens: gem buttons, a points slot and a timer bar.',
  },
  {
    version: '0.4.0',
    date: '2026-09-22',
    text: 'Standings and a podium between rounds.',
  },
  {
    version: '0.3.1',
    date: '2026-09-22',
    text: 'Behind the scenes: reorganised notes.',
  },
  {
    version: '0.3.0',
    date: '2026-09-22',
    text: 'Multiple choice, closest number, typed answers and random events.',
  },
  {
    version: '0.2.0',
    date: '2026-09-21',
    text: 'A new round: Guess the Examine.',
  },
  {
    version: '0.1.0',
    date: '2026-09-21',
    text: 'The first version: host a room, friends join by its code, and play More or Less and The Price is Right for speed.',
  },
  {
    version: '0.0.0',
    date: '2026-09-13',
    text: 'An idea for a quiz night at the inn is brought to life.',
  },
]
