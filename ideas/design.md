# Design

What the app looks like and why. The architecture under it is `ideas/architecture.md`, which this
file links to rather than repeats. Sections describe the built app, and name the open issue
where one will change it. No screen-reader-specific work is done, and it is not a review
criterion.

## 1. Themes

A theme is a palette the player picks, kept in `localStorage["jbi:theme"]`, never on the server.

| id | Name | Mood | Base | Accent |
|---|---|---|---|---|
| `jolly` | Jolly Boar Inn | Default. Oak, candlelight, spilled ale. | Warm mid-brown, cream panels | Ale amber / hearth orange |
| `pollnivneach` | Pollnivneach | Bright desert noon. | Sandstone, off-white panels | Terracotta, indigo shade |
| `jungle` | Jungle | Karamja and Ape Atoll at noon. | Sunlit grass, bark-cloth panels with bamboo trim | Palm green |
| `party_room` | Party Room | Loud. A drop party, as in game. | Two-blue checks, balloons, white panels | Tablecloth blue |
| `tzhaar` | Toktz | Hot. The volcano's cracked obsidian floor. | Brown-black, ember seams, near-black panels | Lava orange |
| `wilderness` | Wilderness | Dark. Cold ash and ember. | Near-black slate | Ember red, bone white |
| `gauntlet` | Gauntlet | The crystal dungeon under Prifddinas. | Navy tiled floor, rock-grey panels with a cyan top edge | Crystal cyan |
| `corrupted_gauntlet` | Corrupted Gauntlet | The Gauntlet gone red. | Its floor with a maroon grid, a red top edge | Corrupted red |
| `morytania` | Morytania | Mort Myre's swamp. | Murky teal water and banks, dark stone panels | Moonlit lilac |
| `zanaris` | Zanaris | The fairy city. | Teal ground with red and blue mushrooms, ice-blue panels on rainbow strata | Mushroom red |

- `jolly` is the default unless a selfhoster sets `PUBLIC_DEFAULT_THEME` (§14). There is no `auto`
  theme and nothing reads `prefers-color-scheme`: a phone in dark mode should still meet the inn.
- Variety between rounds comes from the round's host (§8), never from the palette. A palette that
  shifts under a question changes what the buttons mean.
- Themes draw on the page behind the panels. `party_room` strews balloons and partyhats,
  `jungle` fruit, `pollnivneach` desert finds, afresh each visit (`Floor.svelte`). A wall light hangs either
  side, level with Broav, the right one mirrored (`WallLights.svelte`): `jolly` a flickering candle
  lantern, `wilderness` the game's wall torch turned to face the page, `tzhaar` a sulphur vent whose
  small red glow rises only from its lava, both Gauntlets the dungeon's door logo, glowing steady cyan or red. Only from 800px wide, shrinking
  as the room beside the sheet narrows, so never on a phone. `zanaris` lays a fairy ring there instead,
  at its own size and unlit, and keeps the left one in a phone's bottom corner.

## 2. Colour: the token contract

Tokens come in eight layers in `client/src/app.css`. A theme may freely change layers 1, 2, 5, 6
and 7. Layers 3, 4 and 8 are a contract that `scripts/check_contrast.py` enforces in CI.

| Layer | Tokens | Theme may change? |
|---|---|---|
| 1. Surface | `--bg` `--panel` `--panel-raised` `--line` `--ink` `--muted` | Freely |
| 2. Brand | `--accent` `--accent-ink` `--accent-hover` | Freely |
| 3. Verdict | `--ok` `--ok-ink` `--bad` `--bad-ink` `--warn` `--warn-ink` | Must pass contrast + hue check |
| 4. Semantic | `--more` `--less` | Must pass; must differ from layer 3 by hue or shape cue |
| 5. Gems | `--gem-sapphire` `--gem-emerald` `--gem-ruby` `--gem-red-topaz` `--gem-dragonstone` `--gem-zenyte` `--gem-ink` | Freely, within the gem checks |
| 6. Shape | `--radius` `--border-width` `--shadow` `--font-display` `--font-body` `--font-numeric` | Freely |
| 7. Texture | `--texture-panel` `--texture-bg` (a local `url()` or `none`) | Freely |
| 8. Sheet | `--scroll-paper` `--scroll-edge` `--scroll-ink` `--scroll-muted` `--silhouette` | Must pass contrast |

No text sits on the bare page: each screen opens with its heading and tagline on a panel, and the
`--bg-ink` page inks are only a fallback. `--more` and `--less` are not right and wrong, so they
never borrow layer 3's colours. Layer 6 is
what makes a theme a different place: `wilderness` has a 2px radius and a hard border. A recolour
(`corrupted_gauntlet`) is the same place, so it keeps its original's shape.

The script asserts, per `[data-theme]` block:

- `--ink` at 7:1 against `--bg` and `--panel`; `--muted`, `--ok` and `--bad` at 4.5:1 against
  `--panel`.
- `--ok` and `--bad` at least 60° apart in hue. About 8% of players will not see green and red,
  which is also why the points slot's verdict is a number as well as a colour.
- `--gem-ink` at 4.5:1 on every gem, lit and faded. Faded is the gem mixed 25% into `--panel`.
- Every gem at least 20 apart (CIE76 ΔE) from its own faded self, because lit against faded is the
  whole reveal. That is why there is no diamond or onyx: white and black wash into a panel of their
  own lightness.
- Layer 8: `--scroll-ink` at 7:1 and `--scroll-muted` at 4.5:1 on `--scroll-paper`, and the
  paper at least 10 ΔE from `--bg` and `--panel`, so the sheet stands off the page. `--silhouette`
  at 3:1 on the paper.

## 3. Gems and the reveal

Answer buttons are gems, in a fixed order by position: **sapphire, emerald, ruby, red topaz,
dragonstone, zenyte**. Position 1 is always sapphire, however many options there are. A player
learns the position, which is worth more than variety.

- **On reveal, no button changes colour.** A green or red fill would make an emerald button lie
  for the half-second before anyone reads it. The correct button stays lit and every other one
  fades. Nothing is added to it: no ring, no ✓.
- A pick before the reveal works the same way: yours stays lit, the others fade. The reveal also
  moves the answer, so hue is never the only signal. The correct button goes large
  across the top; the others go small beneath it, in position order. In the DOM they stay one to
  six. While a pick waits, nothing moves.
- Your own pick carries a small "you", right or wrong. The verdict is the points slot (§10), not
  the button. The reveal adds one more thing: how many picked it, in the corner, with a bar along
  the bottom for its share of who answered. It names nobody, so it shows whatever the setting.
- Every reveal's results take the table panel (§9): "22 of 41 got it right", then a row per
  group, the right one first, labelled with the answer, then the wrong ones: the option (with its
  gem's chip), the typed answer (three, then "Something else"), the list entry, the closest-number
  rank ("Further off" last, every name with its guess), right picks, entries in place, or fields
  right. Each row has its count, a bar for its share of everyone who could answer, and its names:
  eight, you first, then "and N more". "No answer" comes last, muted: it is not wrong. The right
  row always names its players; with `name_wrong_answers` off the others keep only their counts.
  The TV keeps its tally under its answers, as a line per wrong group.
- Six gems means no question offers more than six options.
- `pick_all_that_apply` drags the right gems from a tray into a basket, as `ordering` does, nothing
  fading until Submit. Without `picks` the basket grows, unnumbered; with it, that many empty places.
  A basket that would be valid goes 1 s before `ends_at`. Every right gem goes across the top at
  normal size.
- `ordering` is answered by dragging the entries into order, each keeping its gem: a mouse takes
  the whole row, a finger or the keyboard its handle. They start as shown, unnumbered, so Submit
  works at once. With `picks`, that many numbered places start empty above "the rest". Rewind,
  beside Submit, starts over. An unsent order goes 1 s before `ends_at`, empty places filled from the
  top of the rest. The reveal lists the right order, ties sharing a number, with each `detail`; a
  misplaced entry fades and says where you had it. With `picks` it lists only the top ones.
- `matching` drags an option onto each field, labelled by name or picture ("Picture N" to a screen
  reader), from a tray of gems in two columns; decoys stay in the tray. The drag and keyboard are
  ordering's, with no tap-to-place. A drop on a filled field swaps, a placed option's × sends it
  back, and an unsent answer fills empty fields from the top of the tray. The reveal sets the right
  option on each field with its `detail`, fades a wrong one with "you: …" under it, and lists the
  decoys as "Left over".
- Gems are for `multiple_choice`, `pick_all_that_apply`, `ordering` and `matching`; `price_is_right` is a slider. `more_less` keeps `--more` and
  `--less`, because its buttons carry item pictures, which a gem fill would drown.
  `pick_from_list` has a list of hundreds, answered through a combobox, with no gems.

## 4. Typography

- **Display** (`--font-display`): headings, the wordmark, round names, room codes, the timer and
  points. Things you glance at.
- **Body** (`--font-body`, `system-ui`): every sentence a player has to read, prompts and answers
  included. Pixel faces are hard to read at 16px, and hardest for the players already struggling.
- **Numbers** (`--font-numeric`): the display face with `tabular-nums`, so points and the countdown
  never jitter.
- The clue scroll alone is set in RuneScape Quill 8, the in-game dialogue font, by redefining `--font-display`
  and `--font-numeric` on its paper. Everything else, the top bar and the standings included, stays in system fonts.

## 5. The top bar

```
┌──────────────────────────────────────────────────────────────┐
│ [sign] The Jolly Boar Inn      [Host ⌄]  [⌥]  [pet Name emblem]  │  56px, sticky
└──────────────────────────────────────────────────────────────┘
```

- **Left:** the sign, a plain `href="/"` link home, then the wordmark. Both are configurable (§14).
  The version is in the footer.
- **Host ⌄**, outlined, comes first for an admin while a room plays (not in the lobby or the final
  hiscores), on a phone too. Its menu holds the phase's actions: "Start the round now", "Close this
  question now", the reveal's skip (next question, standings, next round or final standings), "Start
  the next round now", "End the round", "End the game"; the last two ask first. Kick, promote and
  Make TV stay on the pets.
- **Right:** GitHub (`--muted`, the one control not about the game), then one control: the pet,
  the name and the current theme's **emblem**. One thumb target, not three. The name is the bar's
  priority: it shows at every width and is the one item that shrinks, ellipsising.
- **Under 26rem** the wordmark and GitHub hide. At 320px the name keeps about 155px.
- **Width:** the bar and the footer are as wide as the screen under them: 42rem, or 64rem on Home,
  Create and Admin, where Home puts Join, Host and Suggest beside the room lists from 50rem. In a
  room the bar runs the window's width, and from 1024px its middle says where the night is:
  "Round 1 of 3: **More or Less**", "Lobby", "Hiscores after round 2 of 3", "Final hiscores". On a phone Suggest comes last. A browser holding the admin token gets *Admin (n)* in Suggest, n the pending suggestions.
- **No room code.** Codes are words like `ThermonuclearSmokeDevil`, which either truncate to nothing
  or push the controls off a phone. The lobby and Join show the code instead.
- **A team game** frames the screen in the player's god from the moment they join a team until
  they leave the room: the bar in the god's colour with its symbol for the sign, a 6px edge round
  the window, the timer and its tabs in the god's shades, and a badge (symbol and name) centred
  under the timer, or under the bar where there is none. The theme stays the player's.

The control opens one panel: **You** (name and pet; the local profile outside a room, the live
player via `set_profile` inside one), **Sound** (§7) and **Theme**, a grid of emblems four abreast,
the chosen one ringed and named under it. Picking a theme repaints at once and the panel stays open. Escape, a
tap outside or tabbing out closes it, and focus returns to the control unless the tap gave it
elsewhere. An emblem is an item icon of the theme's place (§14), 32px in the bar; unfetched, a flat
mark in the theme's `--accent` stands in.

## 6. Names and pets

The profile, `localStorage["jbi:profile"]`, holds this browser's name and pet permanently. A
player is per room and temporary. There are no accounts.

- **Join and Create** ask once. A browser with no profile gets a modal before its first room (on
  Create, when the button is pressed, before a phone's room code sheet): a generated name and pet,
  pre-filled so one tap on *Join*, *Create room* or *Continue* is an answer. Nothing dismisses it, the room is joined or made only on that tap,
  and the answer becomes the profile. A browser with a profile is never asked.
- **Renaming** is `set_profile`. Most players take the pre-filled name, so every generated name
  must be one you are happy to see win.

Generated names come from `data/player-names.json`: invented usernames in the register of a 2007
friends list (`ScapeRune77`, `AFKFisher`). Never NPC names, or somebody is called Hans while
wearing a goblin's face, and never real players. Base names are at most 21 characters so the suffix
fits. A duplicate is a 409, and the client re-rolls the suffix up to three times. A name matching
the room code is skipped: not a bug, but it reads like one.

Pets must reach other players, so the server stores them. `players.avatar` is a pet id, and a player
who sends none is given one by the server, so every client draws the same pet for good.

- A pet is pickable when `data/assets.json` has both its chathead and its inventory icon, 204 of
  236 today. The chathead is drawn large, the icon small. The pet's id is the contract, not its
  position in `pets.json`.
- **The picker** is in the name prompt and the You panel. It shows the pet as its chathead with its
  name, a Random button for those who cannot decide, and Change pet, a search box over a scrolling
  A-to-Z grid of icons: a native radio group, so arrows, one tab stop and screen readers work.
  Like names, pets are fixed once the game starts.
- A pet with no file is drawn as the boar.

## 7. Sound (#102)

| Switch | Covers | Safe to mute? |
|---|---|---|
| **Music & effects** | Splash stings, the countdown tick, the reveal chime, lobby music, a random event's entrance | Yes. Decorative. |
| **Question audio** | Audio that is the question (Name that spell, a music round) | **No.** Those rounds become unplayable. |

- One mute button could not warn anyone, so there are two, in the bar menu's Sound section (§5).
  Muting question audio says: *"Some rounds are audio-only. You will not be able to answer those."*
- The CSP has no `media-src` yet, so audio is blocked until #102 adds `media-src 'self'`.
- Browsers block audio until a gesture. The ready tap (§9) unlocks it. A player who never sees a
  splash (a reload mid-game) unlocks it with their first answer tap. An
  audio-only question that cannot play says so rather than sitting silent.
- `prefers-reduced-motion` is the sibling setting: anything that moves has a static fallback.

## 8. The stage: a host and a sheet

Every round is presented by an NPC, the **host**, who stands above the theme's **sheet**
(`lib/sheet.ts`) and speaks in a bubble beside its chathead. In `jolly` and `pollnivneach` it is a **clue scroll** drawn after the game's
quest reward scroll: upright rolls with knobs, a sheet torn top and bottom. `wilderness` nails up a
sooty bounty poster under the game's skull, `party_room` hangs a cream card in a checked border
under bunting, `tzhaar` carves an obsidian slab glowing at its edge, since paper would burn,
`jungle` lashes bark cloth into a bamboo frame, both Gauntlets show its dark board in a glowing
crystal or red rim, `morytania` raises a gravestone, which a long sheet makes a pillar, and `zanaris` the Cosmic
altar's sign.
The sheet carries the round on the splash and then every question, and nothing else; the
answers sit under it.
Create shows each mode on a card with its host's chathead. The stage was agreed in
`client/prototypes/clue-scroll.html`, on the real tokens; under `make dev` it is at
`/prototypes/clue-scroll.html`.

```
   ▄▄    ╭──────────────────────────────╮
  (••)   │ Ali Morrisane                │   the speaker's name, then its line
 ▟████▙ <│ Patience, my friend.         │   in Quill, on --panel-raised
         ╰──────────────────────────────╯
        ╥────────────────────────────────╥
        ║ Which costs more on the GE?    ║   the question, and nothing else
        ╨──────────────────────✿──+850───╨   the pin and the points
```

- **The room's frame** (`lib/roomFit.ts`): the stage on the left, the table column on the right,
  300px (380px in a reveal), 28px apart, padded 30/40/28px. It is laid out at 1600×920 under the
  bar: larger windows scale it up as a whole, as the TV (§16), never wider than 16:9 of the
  window's height, the floor beside it with the wall lights (§1) measured from its edge, none
  where it fills the window; from 1280×640 it fills the window at its
  own size; smaller, it lays out at 1280×640 and scales down. The stage's parts stand centred in
  its height. Under 1024px wide the stage and table stack. The TV has no frame.
- **Two sizes.** On the desktop frame a stage whose host speaks above it takes the stage column, up
  to 960px, its sheet's words at 1.5 (`--scroll-text`) and rolls and pin at 1.25 (`--scroll-scale`);
  every other stage, and every stage on a phone, is at most 30rem. The answers take the stage's
  width. A stage under 26rem, a phone, sets 0.8 and 0.9.
- **The host** stands above the sheet at its left, its chathead 92px (56px on a phone), and speaks
  in a **bubble** beside it: the theme's `--panel-raised` with its `--line` edge and a tail at the
  speaker, in Quill, the speaker's name then the line. An event's NPC stands at the right, its
  bubble pointing right (§12). A hidden bubble keeps its room, so the sheet never moves when the
  host speaks, and a bubble is from the first frame as tall as the most its screen will say.
- **Elsewhere the host stands beside the sheet**: the standings and hiscores
  (§11, at a long sheet's top-left), Home and the TV. There it stands at the scroll's bottom-left,
  over its left roll, 78px wide overlapping 30px (68px and 32px on a phone); under 448px of screen,
  and on the TV, it stands on the sheet and the words wrap around it.
- **Under 448px of screen** the sheet runs edge to edge and the rolls sit half off the screen's
  edges.
- **The sheet** is at least four prompt lines tall, so a one-line question still makes a scroll,
  and faint facets crease it. An examine line sits centred in the height the prompt leaves.
- **One scroll, always open**, from the lobby to the final hiscores. Between screens the words
  fade off (150 ms), the scroll moves to the next screen's size and place (250 ms), and the new
  words fade up, in the bubble as on the sheet, the bubble holding its size while they fade.
  When somebody else is to stand there (the lobby's hero, the Wise Old Man, an event NPC still
  standing, or the host stepping up above the sheet), the host and its bubble leave with the words
  (200 ms) and the next walks on before them (200 ms). An open question's reveal, a hidden page and reduced motion cut instead. An
  event clears the words before its own entrance and return (§12).
- **Between routes** (Create to the lobby, Home to Join), Create's tabs and Suggest's list and editor the old screen fades out (150 ms) and the new
  one in (200 ms); reduced motion cuts. A room's first frame waits behind a "Connecting…" popup that
  only appears after 400 ms.
  After the first screen loads, the browser fetches the NPCs, emblems, team logos and pet chatheads
  (`lib/preload.ts`), so those do not pop in mid-fade.
- **Every line types in** at 50 letters a second: on the splash the bubble's greeting and blurb
  once the stage is in place, and a question's stem on the sheet from 400 ms in the server's hold
  before `answerable_at`, the answers waiting under the line. The host says nothing then; once you
  answer, its waiting line shows in the bubble, dimmed to 60%. Names show whole. Otherwise as §12.
- **Any answer that scores** pins the theme's pin on the sheet's bottom edge, 65% across: right,
  partial credit or a graded guess alike. `jolly` and `party_room` pin a red rosette ribbon,
  `pollnivneach` a super kebab, `tzhaar` Tokkul, `jungle` a Monkey Madness monkey, both Gauntlets a
  crystal shard, `morytania` a pointed snelm, `zanaris` a cosmic rune, and `wilderness` the Bounty Hunter skull for the
  points: bronze under 200, then iron, green and blue, red from 800. A game sprite is drawn at
  twice its pixels, centred on the edge. Full credit alone adds a burst of confetti (900 ms) in
  the theme's gem colours. `+0` gets nothing.
- **The sheet** is an original inline SVG and CSS component in layer 8's tokens. An `<img>` could
  not read the theme's custom properties (§13). The knobs are fixed pieces; a roll stretches only
  along its length. Every theme has its own paper.
- **Below the scroll** are the answers on a panel; gems never sit on parchment, so every gem
  check still measures against `--panel`. **At the table** (`AtTable`): the table panel (§9), with
  the lobby's and splash's buttons at its foot.
- **The host's voice** is the mode's copy: splash line, blurb, waiting line, reveal line, in
  `lib/modes.ts`, all in the bubble. The reveal's bubble adds the question's explanation and
  "Next question in 6 seconds" (the standings, the next round or the final standings after a
  round's or the game's last). The sheet's foot keeps one line for the points. Question
  prompts stay plain: a prompt is parsed against the clock, and a joke around it is a second thing
  to read. Random events are the exception, already written in their NPC's voice.
- **The art** is the wiki's chathead, or the head of its render, mirrored to face the
  sheet. A mode with no host, or a host with no art, gets the generic boar.
- **Home** opens with the same stage and the site's challenge on the sheet, in place of a panel,
  and the lobby (§9) with the room on it. Home's sheet in `jolly` is a note tacked to a notice
  board, so the inn's front door differs from its games. Their host is the selfhoster's hero for the theme (§14): 240px beside the scroll with 600px of
  stage, else 120px in the host's place, partly off a phone's edge. Without one, the Wise Old Man.

## 9. The table panel, the splash and the ready check

The table panel (`TablePanel`) is who is at the table, on the theme's panel beside the stage. It
has two halves, each with its count: the lobby's and splash's "Ready" over "Not ready yet", a
question's "Answered" over "Still thinking". A pet moves up as
its player readies or answers. Pets sit four abreast, the name under each, yours first in your
half and in bold, the rest below in join order and above in the order they arrived. An away pet
fades to grey, says "away" and stays below, since the server only knows who is still to answer
among the connected. A team game splits each half by team in god order, the teamless last. The
TV sits apart under "TV" at the foot. A question nobody answers lists everyone under "At the table".
On a phone a question's panel is a strip at the foot, "2 of 9 answered" and the first four faces,
answered first; in a reveal "5 of 9 got it right" and the faces of who did. It opens the panel
as a sheet, the reveal's as "Results", and a new question closes it. A reveal's panel is its
results (§3), 380px wide. The lobby and splash
keep the whole panel under the stage, since it holds their buttons. The threshold, countdowns and
take-back rule are architecture §7.

- **Lobby.** The hero, else the Wise Old Man, says the lobby line in the bubble. The scroll holds
  "Your friends join with this code", the code, which copies the invite link, and the link with
  "Copy invite link"; an invite-only room says so instead of printing a link that carries its key
  (an error and the link to copy by hand where the clipboard refuses). Under it, a panel: the
  night's line, a card per round A–Z (its host's chathead, name and question count; a hidden
  round is "A surprise" with the boar), "How to play" and "Quicker and correct answers score
  more." At the table: join requests first, for the host, then a team game's gods, the halves,
  I'm ready, and Start (plain at the threshold, "Start anyway" below it, which asks first) or
  "Waiting for the host to start…". The host taps a pet to kick or promote.
- **TV row:** the host's pet menu makes another player or admin the TV ("Make TV", never the
  last admin) and back ("Not the TV"), at once. Its pet wears a screen. The TV gets no ready,
  and its settings no name or pet.
- **Full screen:** on touch devices a "Full screen" switch sits beside "I'm ready" in both, and
  follows the browser's state. It is absent where the browser lacks the API (iPhone, #319).
- **Splash.** The host's greeting and blurb in the bubble. The scroll: "Round 4 of 10", the mode's
  name, "5 questions · " and its Create hint, and a price round's date. Under it, "Tonight": a
  host per round, past ones faded, the current one large and named, the rest numbered; a host
  shows only where the client knows it, so shuffled or hidden rounds are numbered blanks but for
  the current one. Ten fit a row; past 12 it shows the nearest 12, on a phone the nearest 5, with
  "+N" for the rest. Beside it "Starting in 4", large, once the countdown runs, and before that
  "Waiting for 2 more to be ready", never by name. The panel keeps the ready check.
- **How to play:** a link on the Lobby's rounds and on Home's opens a sheet, a row per way of
  answering: a small drawing of the control and one plain sentence, with every Submit named in
  bold, since players overlooked it. The Lobby shows its rounds' types, or all of them when
  random events, host's questions or hidden rounds could bring any. It ends "Quicker and correct
  answers score more."

## 10. The question screen and the reveal

- The timer is a thin bar under the top bar, with the seconds in a tab at the stage's right edge
  and the question's number (`2/3`) in one at its left. In a reveal it counts to what follows,
  the tab saying "Next in 6s" and the fill in `--muted`, never turning urgent.
- **The answers take the size the question needs**, laid out by the stage's width, so a preview
  matches the room. Choices are two abreast and 56px tall on a phone, an odd last one across the
  row: thumb targets at a pub table. On a wide stage they are at least 84px tall, three abreast,
  two and four two abreast, five's last two centred. More or Less's two items are cards of the
  item's size, at most 16rem wide, with "or" between. Ordering, matching and pick-all put the list
  on the left and the instruction, Start over and Submit in a 230px column on its right; a phone
  stacks them. The combobox, number and slider keep their controls at the board's width.
- The stem (prompt, item picture, examine line, More or Less's question) is on the scroll in
  `--scroll-ink`, the answers and combobox under it, who has answered at the table. The
  question's heading is for a screen reader only.
- A pack question's picture, the wiki's detail render, is centred under the prompt in a box 5rem
  tall (4rem on a phone) from the first frame, through the reveal. A smaller render keeps its size.
  Who's That NPC? gives it 12rem and its shadow, which fades into the render (700 ms) with the name
  under it on the reveal. One flat colour, no glow or gradient, so a see-through part shows lighter
  in every theme: the scroll ink, Toktz's lava orange and the Gauntlet's crystal cyan.
  An item's inventory icon, in a 72px box at whole pixels, sits under The Price is Right's question
  and above each More or Less name. Without a file, the name stands alone.
- The `pick_from_list` combobox (behaviour in architecture §4) is full width, 56px tall, in the body
  face, with a 56px Submit under it. Its list floats over the page, so opening it never scrolls: below the field, and on a phone
  *above* it, clear of the keyboard. Typed text reads as a search; only a selection lights Submit.
- Answered and waiting shows your answer held and dimmed, with "Answer in" and its band under it.
- **With a TV connected** a phone draws no stage: no host, scroll, stem, picture or event NPC.
  The answers, the band line and the table's strip take the screen, and the reveal puts your points on their
  plaque above your marked answers, with no tally, counts, others' guesses or explanation. A
  TV that drops gives phones the whole question back.

On reveal everything recedes except the correct answer and your points. Buttons fade (§3); a typed,
picked or numeric answer fades beside the correct value. Your points go at the foot of the
scroll, in a foot held from the start so nothing under the sheet moves, the same in every mode,
in display tabular numerals and the scroll's ink:

| Outcome | Slot shows |
|---|---|
| Right | `+850` |
| Wrong | `+0` |
| No answer | `No answer · +0`, muted |
| Graded (closest guess) | `+340`, the number carries the verdict |

- A timeout is not a wrong answer, and the slot says so. The number is the verdict: `--ok` and
  `--bad` do not reach 4.5:1 on parchment. A random event's card keeps them, on a plaque (#106).
- Only what you earned: the total waits for the standings. The slot never explains a number; a
  speed bonus explained mid-reveal is a second thing to read.
- No standings under a reveal: a board every question makes the game a spreadsheet. A team game
  ends the tally with a row per team, logo, name and its members' median points on the question
  (silent is 0), in god order, not ranked.
- A suggested question whose player asked to be named ends the tally with "Question by Name",
  muted and off the scroll, so the reveal reads the same without it.

## 11. Standings

Standings appear between rounds and at the end, never between questions, in the `standings` phase
(architecture §7). A single-round game shows only the final ones. Both are the Wise Old Man's
hiscores on the stage (§8), for wiseoldman.net, where OSRS players track their gains. The sheet
runs long, so he stands at its top-left beside his line, and the table takes the sheet's width
below him. Agreed in `client/prototypes/standings.html`.

The table is the OSRS hiscores: `#`, pet, name, right-aligned tabular points. Each row is two
lines, the places moved (▲2, ▼1) under the rank and the round's gain (+1,240) under the total, so
a 24-letter name keeps the middle at 350px. "(you)" never splits from itself. The first round has
no moves. Your row is highlighted, and between rounds pinned to the screen's foot when below it.

**Between rounds** he says "Round 2 done. Let's see who truly knows Gielinor best." The rows start
where they stood before the round, with the totals then; once his line has typed the gains count
up, a second later the rows move to their places, and then your row pins. About three seconds.

**The final** opens on "The final scores are in!", then presents fifth place to first: his line
("In fifth place…", "Tied for second…", "And top of the hiscores…"), then the place's pets (three,
then `+N`), names, points and tier, its Quest Speedrunning trophy (Bronze to Diamond) standing
beside the scroll on the right, opposite him. First holds longest, with confetti. Ranks are
dense, so tied players share a place; nobody on 0 points gets one, and a room where nobody scored
has no ceremony. The place then fades, the sheet unrolls to the full table with the rows arriving
top to bottom, and he says "Gz, Name! Here are the full hiscores." A Skip button jumps there.

The ceremony plays only for a client that watched the game end. A reload, a late arrival and a
past game from history show the table at once, as does reduced motion; a past game shows only the
totals, without moves or gains. Trophies are art, not tokens.

**A team game** ranks its teams instead, with the same moves, gains and timing: rank, logo, name
and points, the god's colour on the team's edge, and under each its members with their own
totals, best first, so the weak link shows. The ceremony presents teams, fifth to first, each with
its logo, name, average points and the god's colour, and no trophy; the final line names the winning team ("Saradomin wins!", "Saradomin and Zamorak win!"), and Past games names it
on the game's entry.

## 12. Random events: the interlude (#106)

A random event is a question from an NPC who has nothing to do with the round. How often and who
asks what are architecture §5 and `ideas/random-events.md`. This is how it looks.

**The event NPC stands on the right**, above the sheet, its bubble pointing right, and a "Random
event" tag heads the sheet. The host always stands left, so position says "this is not the round's
question" before a word is read.

Everything happens inside the server's hold before `answerable_at`, timed to the text (§8), so the
wait costs nobody points and the server times nothing:

```
  0 ms   the round's words fade off the sheet and out of the bubble          ≤ 150 ms
150 ms   the host and its empty bubble fade out                              ≤ 300 ms
375 ms   the NPC fades in on the right, its bubble holding only its name     ≤ 375 ms
900 ms   the NPC's `intro` "types" in, in the bubble, at 50 letters a second
then     a pause of 0.5–1 s, and the plain question types in on the sheet
then     once it has typed, the bubble dims to 60%
−200 ms  settled, 200 ms before answerable_at: nothing moves until the answers appear
answerable_at: the answers fade in under the line (200 ms) and the timer bar starts
```

- The intro is the character; the question on the sheet is all a hurried player needs. A question
  with no intro types its prompt alone, the bubble saying only the NPC's name.
- The pause is what reading the intro still needs once typed, at 25 letters a second: 0.5–1 s.
  Spare time waits at the end, settled. Text too long for the hold starts sooner, never before
  600 ms, then pauses less, then types faster. Under 800 ms of hold the NPC is simply there.
- The typing is a mask, not a mutation: the whole text is in the DOM from the first frame.
- In the reveal the bubble comes back undimmed with the NPC's `right` or `wrong` line, the
  `explanation` and the countdown (§8), and your points go on the sheet's foot. The bubble keeps
  room for all of it, two lines of explanation among it, from the first frame.
- The return takes the reveal's last 900 ms, off `next_at`: the NPC, its bubble and the words fade
  out (225 ms), then the host and its bubble fade in (300 ms) once the sheet's 375 ms move would
  have played. A skipped reveal hands the stage back as §8.
- A reconnect lands on the settled stage, the bubble dimmed. The TV keeps its stage without a
  bubble: the NPC stands on the sheet's right, its words all on the sheet, the scroll sliding over.
- With reduced motion the NPC replaces the host in one frame and the text shows whole. The
  answers still wait, because that is a rule of the game, not an animation.
- An NPC this build does not know is drawn as the Mysterious Old Man.
- The panel holding the answers exists, with the buttons faded out.

## 13. What the build constrains

All from the CSP in `server/app/http/headers.py`:

1. **`style-src 'self'`, no `'unsafe-inline'`.** No inline `style=` and no Svelte `style:`
   directive for anything themed. Themes switch by setting `document.documentElement.dataset.theme`
   over palettes written statically in `app.css`. SVG art that must follow the theme is an inline
   component with classes, because an SVG loaded by `<img>` or `url()` cannot see custom
   properties.
2. **`font-src 'self'`.** Self-hosted fonts only. No Google Fonts, no CDN.
3. **No `media-src`**, so audio is blocked until #102.
4. **`img-src 'self' data:`** covers local art and Vite's inlined assets.

The theme must be set before first paint, and `script-src 'self'` forbids an inline script. So
`main.ts` sets `data-theme` first, and `color-scheme` on `:root` covers the one-frame gap.

## 14. Assets, branding and the footer

| Art | Source | In the repo? |
|---|---|---|
| Question pictures | Wiki detail renders, `make fetch-assets` | No, fetched; without one the prompt stands alone |
| Item icons | Wiki inventory icons, `make fetch-assets` | No, fetched; without one the name stands alone |
| Speedrunning trophies | Game renders, `make fetch-assets` | No, fetched; placeholders ship |
| Clue scroll font | RuneStar/fonts, Quill 8 | **Yes**, 21 KB, with a note beside it |
| Pins, the poster's skull | Wiki sprites, as SVGs pixel for pixel | **Yes**, `assets/sprites/`, with a note beside it |
| Hosts and event NPCs | Wiki chatheads (§8), `make fetch-assets` | No, fetched; the boar is committed |
| Pet art | Wiki chatheads and inventory icons, `make fetch-assets` | No, fetched; a pet with no file shows the boar |
| Theme emblems | Wiki item icons, `make fetch-assets` | No, fetched; inline placeholder marks |
| Team logos | Wiki god symbols, `make fetch-assets` | No, fetched; inline shields in the god's colours |
| Clue scroll, logo, palettes, icons | Original | **Yes** |

- Fetching keeps the checkout small. Fetch scripts refuse to run without the operator's own
  User-Agent, per the wiki's terms.
- Every art slot takes a file with no code change: the sign, the trophies, the pets, the NPCs, the
  emblems (`client/src/assets/themes/<theme>.<ext>`), the team logos (`assets/teams/<god>.<ext>`).
  The display face and the logo are the owner's, and no D task waits on them.

**Footer.** A full-width `--panel` band under every screen but a room's, which has it under the
lobby only, edged like the bar, in the flow and never fixed: *RuneScape and RuneScape Old School are the trademarks of Jagex Limited.* Under
it, *We count games and rounds per day. No cookies, no personal data.* Beside it: GitHub, the licence, the OSRS Wiki (CC BY-NC-SA), Credits and the version, linked to its release. Its sheet ranks the named question authors by count, ties sharing a rank, with a way to `/suggest`, and thanks the wiki. The
AGPL wants a source link reachable from the service, and this is it. GitHub is also a muted icon in
the bar (§5). Every link opens a new tab, so a room is never
left.

**Selfhoster branding.** Three build-time env vars, which compose passes as build args:
`PUBLIC_SITE_NAME` (default *The Jolly Boar Inn*; also the tab title), `PUBLIC_SITE_LOGO` (an image
in `branding/`, also the tab icon; missing or unloadable, the bundled sign; a `logo-<theme>` beside it
overrides it per theme, an `og-card.png` is a shared link's picture, a `hero` and `hero-<theme>` stand
on Home's stage) and `PUBLIC_DEFAULT_THEME`
(a theme id for browsers that never chose; unknown, `jolly`). The GitHub link is not configurable:
a fork's footer should still point upstream.

A host cannot pin a room's theme, even as a suggestion: the theme is the one thing purely the
player's.

## 15. Admin

`/admin` is the operator's, at the 64rem width (§5). One panel heads it: the title, Refresh on
Overview alone, and a row of tabs, each a link to its own path, so a reload or a new tab lands on
it. The current tab is underlined in `--accent`; Suggestions and Reports carry an `--accent` badge
with what waits in them (pending, open), none at zero.

- **Overview** (`/admin`): live rooms and the history, refreshed every 10 seconds while on screen.
- **Suggestions**, **Reports**: the queues, each with its own status tabs.
- **Questions**: pending changes first, each opening to before and after with Discard, then
  Download and, once downloaded, Mark as applied. Under them a round picker and a search over the
  hand-written packs; a question opens read-only with Edit and Delete, and a chip says Edited or
  To delete. Edit opens its type's form in place: Create's with an intro and a picture for choice,
  typed, number and pick-all questions, `/suggest`'s for ordering, a line and a name from the list for an
  examine, and the payload as JSON for a type no form writes yet. Links and credit sit under
  every form. A List/Stats toggle swaps the list for a table of each question's answers, scored
  share against its tier's band, no-answer share and suggested tier, whose Set queues a tier edit.

## 16. The TV

A room's TV (§9) shows the room every screen; the phones hold the answers (§10). It must read
from a sofa across the room on a 1080p screen, in every theme.

- **One scale.** The stage is the phone's, scaled as a whole to 80% of the window's width or
  height, whichever it reaches first, and centred; the floor shows around it. It is at least the
  window's shape, so it fills that 80% both ways and keeps one size from question to reveal. The
  timer bar's tabs hang at its edges, at its scale. No wall lights: the stage is in their place.
- **The sheet** has its words at about 56px on a 1080p screen, set smaller down to 44px where
  they would not fit (past that the stage grows taller, and smaller), the question centred in
  the height above the foot. Its host or event NPC, 140px, stands on the sheet's foot as on a
  phone (§8), and the words wrap around it.
- **The panel** stands beside the scroll, one height with it, under it on a screen taller than
  wide (at least 16rem tall there), and one size throughout: what does not fit in it shrinks,
  never the stage. Open, it says
  "3 of 5 answered", then shows the pet and name of everyone still to answer, each leaving as
  they answer, or drop. No answers and no admin controls. The host says its waiting line.
- **The reveal** fades into the panel (200 ms): the answers with their counts, the explanation,
  the tally and names, team rows and "Question by" (§10–11). The foot has the host's reveal line
  or the event's explanation; the TV scored nothing, so no points, pin, confetti or NPC reaction.
  It fades off 200 ms before the next screen, or an event's return.
- **Wide screens.** The lobby, splash and standings have no panel: the sheet takes the stage's
  width, and narrows (400 ms) for the panel when the question opens. Nothing on them is offered.
- **Lobby:** "Join on your phone", the code large and the link, the night's count and "Waiting for
  2 more to be ready." (then the host's wait); "At the table" and the pets on the right, by team.
- **Splash:** the round's count, the pets and "Waiting for…" or the countdown at the sheet's foot.
- **Standings:** no row is yours. Past 12 rows the table scrolls slowly to its foot, holds, and
  starts again. The final's ceremony plays whole, without Skip.
- **No footer**, and the top bar stays out of sight until the pointer nears the window's top.

## 17. Open tasks

The open design tasks are GitHub issues labelled
[`design`](https://github.com/vosdev/jolly-boar-inn/issues?q=is%3Aopen+label%3Adesign), with their
dependencies, on the [project board](https://github.com/users/vosdev/projects/3).

## NPC Hosts

**Who hosts each mode.** The owner picks, in each new mode's issue. A host must not also be on the random-event roster, or the face that means
"interruption" would sometimes mean "the round".

| Mode | Host | |
|---|---|---|
| `price_is_right` | Grand Exchange Clerk
| `know_your_content_creator` | Gnome Child
| `more_less` | Ali Morrisane
| `pixel_hunt` | Sherlock
| `guess_examine` | The Examiner, from the Dig Site 
| `whos_that_npc` | Postie Pete
| `random_events_only` | The crowned frog from Kiss the Frog
| `custom` | The Jolly Boar Inn's bartender, since it is the host's inn 
| `release_order` | Gypsy Aris
| `sort_it_out` | Historian Minas, Varrock Museum 
| `drop_table` | Nieve 
| `bestiary` | Ardougne Zoo keeper 
| `who_said_that` | Cracked Jenny's Tea Cup, the parrot in Brimhaven
| `odd_one_out` | Dunce
| `minigame_madness` | Lanthus, who runs Castle Wars
| `name_that_spell` | Aubury
| `minimap_guesser` | Captain Errdo |
