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
| 1. Surface | `--bg` `--panel` `--panel-raised` `--line` `--ink` `--muted` `--speaker` | Freely, `--speaker` within its check |
| 2. Brand | `--accent` `--accent-ink` `--accent-hover` | Freely |
| 3. Verdict | `--ok` `--ok-ink` `--bad` `--bad-ink` `--warn` `--warn-ink` | Must pass contrast + hue check |
| 4. Semantic | `--more` `--less` | Must pass; must differ from layer 3 by hue or shape cue |
| 5. Gems | `--gem-sapphire` `--gem-emerald` `--gem-ruby` `--gem-red-topaz` `--gem-dragonstone` `--gem-zenyte` `--gem-ink` | Freely, within the gem checks |
| 6. Shape | `--radius` `--border-width` `--shadow` `--font-display` `--font-body` `--font-numeric` | Freely |
| 7. Texture | `--texture-panel` `--texture-bg` (a local `url()` or `none`) | Freely |
| 8. Sheet | `--scroll-paper` `--scroll-edge` `--scroll-ink` `--scroll-muted` `--silhouette`; Pixel Hunt's `--tile` `--tile-light` `--tile-dark` `--tile-seam` | Must pass contrast; tiles freely |

No text sits on the bare page: each screen opens with its heading and tagline on a panel, and the
`--bg-ink` page inks are only a fallback. `--more` and `--less` are not right and wrong, so they
never borrow layer 3's colours. Layer 6 is
what makes a theme a different place: `wilderness` has a 2px radius and a hard border. A recolour
(`corrupted_gauntlet`) is the same place, so it keeps its original's shape.

The script asserts, per `[data-theme]` block:

- `--ink` at 7:1 against `--bg` and `--panel`; `--muted`, `--ok` and `--bad` at 4.5:1 against
  `--panel`; `--speaker`, the dialogue box's name, at 4.5:1 on `--panel-raised`: the game's dark
  red on a light panel, a light red on a dark one.
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
- Your own pick carries a small "you", right or wrong, unless the button names its pickers
  (below), where you are already listed as "you". The verdict is the points slot (§10), not
  the button. The reveal adds one more thing: how many picked it, in the corner, with a bar along
  the bottom for its share of who answered, whatever the setting.
- **Who picked what**, in the desktop room only: a `multiple_choice` gem and a `more_less` card
  list their pickers under the label, pet and name, you first as "you", then A–Z: five on the
  answer, four on a wrong one, then "and N more". With `name_wrong_answers` off a wrong option
  keeps only its count. A phone (the results sheet names them) and the TV show none, nor do the
  other types.
- Options Ring of wealth took off are faded, struck through and out of reach in their place, open
  and revealed, on the wearer's screen only; the TV and everyone else see the whole question.
- Every reveal's results take the table panel (§9): "22 of 41 got it right", then a row per
  group, the right one first, labelled with the answer, then the wrong ones: the option (with its
  gem's chip), the typed answer (three, then "Something else"), the list entry, the closest-number
  rank ("Further off" last, every name with its guess), right picks, entries in place, or fields
  right. Each row has its count, a bar for its share of everyone who could answer, and its names:
  eight, you first, then "and N more". "No answer" comes last, muted: it is not wrong. The right
  row always names its players; with `name_wrong_answers` off the others keep only their counts.
  The TV keeps its tally under its answers, as a line per wrong group. Then "Items", everywhere: a
  row per item that paid on the close, you first, its icon, wearer, name (a potion as before the
  dose) and points: a charmed miss as `−540`, a Book answer with the answer's points.
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
  reader), from a tray of gems two abreast, beside the fields on the desktop stage so five pairs
  fit its height, under them on a phone; decoys stay in the tray. The drag and keyboard are
  ordering's, with no tap-to-place. A drop on a filled field swaps, a placed option's × sends it
  back, and an unsent answer fills empty fields from the top of the tray. The reveal sets the right
  option on each field with its `detail`, fades a wrong one with "you: …" under it, and lists the
  decoys as "Left over".
- `matching` with `bins` stands its bins as gem columns, two abreast on a phone when there are
  four, over a pool of entry chips. Tap a chip, then its bin; or drag its handle, the arrow keys
  stepping it through the pool and the bins. A bin takes any number; Submit waits for every chip,
  and an unsent answer puts the rest in the first bin. The reveal, the TV's too, lists each bin
  with its `detail` and its entries, ours put elsewhere faded with "you: …", an empty one "None".
  The open TV shows the columns over every entry. It says "Sort" where matching says "Match".
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
- **Under 37.5rem** the wordmark and GitHub hide. At 320px the name keeps about 155px.
- **Width:** the bar and the footer are as wide as the screen under them: 42rem, or 64rem on Home, Daily,
  Create and Admin; Home's own column is 960px inside it, so the floor and its lights show. In a
  room the bar runs the window's width, and from 1024px its middle says where the night is:
  "Round 1 of 3: **More or Less**", "Lobby", "Hiscores after round 2 of 3", "Final hiscores".
- **No room code.** Codes are words like `ThermonuclearSmokeDevil`, which either truncate to nothing
  or push the controls off a phone. The lobby and Join show the code instead. A past game is the
  exception: "**FireCape**, finished Sun 25 Oct at 21:14", on a phone "**FireCape**, 25 Oct", the code
  ellipsising before the date or the name.
- **A team game** frames the screen in the player's god from the moment they join a team until
  they leave the room: the bar in the god's colour with its symbol for the sign, a 6px edge round
  the window, the timer and its tabs in the god's shades, and a badge (symbol and name) centred
  under the timer, or under the bar where there is none. The theme stays the player's.

The control, with a ⌄ that turns over while open, drops a sheet from the bar over the dimmed page,
64rem or the window less 2rem: **You** (name and pet; the local profile outside a room, the live
player via `set_profile` inside one), **Theme**, each emblem on its own theme's panel, and
**Sound** (§7). From 46rem it is two halves: name, Theme (five abreast, every name written) and
Sound on the left, the pet search and grid always open on the right, level with the name. Narrower
it stacks You, Sound and Theme (four abreast, the chosen one named), the pets behind "Change pet".
The TV gets Theme and Sound. A browser with no profile sees the pet its first save will give it.
Picking a theme repaints at once and the sheet stays open. Escape, a tap outside or tabbing out
closes it, and focus returns to the control unless the tap gave it elsewhere. An emblem is an item icon of the theme's place (§14), 32px in the bar; unfetched, a flat
mark in the theme's `--accent` stands in.

## 6. Names and pets

The profile, `localStorage["jbi:profile"]`, holds this browser's name and pet permanently. A
player is per room and temporary. There are no accounts.

- **Join and Create** ask once. A browser with no profile gets a modal before its first room (on
  Create, when Open the doors is pressed): a generated name and pet,
  pre-filled so one tap on *Join* or *Open the doors* is an answer. Nothing dismisses it, the room is joined or made only on that tap,
  and the answer becomes the profile. A browser with a profile is never asked.
- **Renaming** is `set_profile`. Most players take the pre-filled name, so every generated name
  must be one you are happy to see win.

A name is 1–12 characters, as in OSRS. A stored profile name over 12, from before, opens the
prompt once with its first 12. Generated names come from `data/player-names.json`: invented
usernames in the register of a 2007 friends list (`ScapeRune77`, `AFKFisher`), at most 12 and
handed out bare. Never NPC names, or somebody is called Hans while wearing a goblin's face, and
never real players. A duplicate is a 409: the client adds a 1–3 digit suffix, cutting the base's
end to fit 12, and re-rolls up to three times. A name matching the room code is skipped: not a
bug, but it reads like one.

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

- One mute button could not warn anyone, so there are two, in the bar menu's Sound section (§5),
  both on by default (`lib/audio.ts`). Muting question audio says: *"Some rounds are audio-only.
  You will not be able to answer those."*
- **A TV room has one loudspeaker.** While a TV is connected, a phone's switches turn off for that
  room ("The TV plays the sound in this room."); a player may turn one back on, say to follow a
  stream, until they leave. The TV's are fixed on.
- Browsers block audio until a gesture: the first tap or key press anywhere unlocks it. A TV not
  touched since loading shows a "Tap for sound" chip. An audio-only question that cannot play says
  so rather than sitting silent.
- `prefers-reduced-motion` is the sibling setting: anything that moves has a static fallback.

## 8. The stage: a host and a sheet

Every round is presented by an NPC, the **host**, who stands above the theme's **sheet**
(`lib/sheet.ts`) and speaks in the game's dialogue box. In `jolly` and `pollnivneach` it is a **clue scroll** drawn after the game's
quest reward scroll: upright rolls with knobs, a sheet torn top and bottom. `wilderness` nails up a
sooty bounty poster, the game's skull faint behind its words, `party_room` hangs a cream card in a
checked border with bunting along its top, `tzhaar` carves an obsidian slab glowing at its edge, since paper would burn,
`jungle` lashes bark cloth into a bamboo frame, both Gauntlets show its dark board in a glowing
crystal or red rim, `morytania` raises a low-arched gravestone, which a long sheet makes a pillar, and `zanaris` a teal
stone with the Cosmic altar sign's crystal at its corners and mushrooms at its foot.
Every sheet sets its words in by the scroll's rolls and margins, 34px top, 40px a side and 32px
bottom at scale 1, and draws only inside its box but for the pin, so the same words make the
same sheet in every theme.
The sheet carries the round on the splash and then every question, and nothing else; the
answers sit under it. Every sheet centres its text, in every theme; only the dialogue box's line
reads from the left.
Create shows each mode on a card with its host's chathead. The stage was agreed in
`client/prototypes/clue-scroll.html`, on the real tokens; under `make dev` it is at
`/prototypes/clue-scroll.html`.

```
╭────────────────────────────────────────╮
│  ▄▄            Ali Morrisane      +850 │   the name centred in --speaker, your points
│ (••)   A shrewd eye, my friend!        │   at its right on the reveal; the line from
│▟████▙                                  │   the left, in Quill, on --panel-raised
╰────────────────────────────────────────╯
        ╥────────────────────────────────╥
        ║ Which costs more on the GE?    ║   the question, and nothing else
        ╨──────────────────────✿─────────╨   the pin
```

- **The room's frame** (`lib/roomFit.ts`): the stage on the left, the table column on the right,
  380px wide always (the table is 300px until a reveal, so the stage never changes width), 28px apart,
  centred together, padded 30/40/28px; the extra width is floor, with the wall lights (§1) measured
  from the room's edge. It is never drawn above 1 nor laid out taller than 920px: a bigger window
  gets more floor. Under 920px of layout height it is compact: padding 16/32/16px, the chathead 72px
  with room for two lines. From 1280 wide and `FIT_HEIGHT` (760px) high it lays out at the window's
  size; a smaller window draws it at the largest of 1, ⅞ and ¾ that leaves both; under ¾ it scrolls.
  760 is measured: Who Said That?'s three-line quote needs 744, a pick-all event 756; Sort It Out's six
  rows, 36px tall with 3px between instead of 56 and 8, need 657 open and 754 revealed, and the fairy rings'
  nine (the tray two abreast) 707 open. The stage starts at the top of its
  height and keeps its place from question to reveal; only the answers grow, downward. Under 1024px wide the stage and table stack. The TV has no frame.
- **Two sizes.** On the desktop frame a stage whose host speaks above it takes the stage column, up
  to 960px, its sheet's words at 1.5 (`--scroll-text`) and rolls and pin at 1.25 (`--scroll-scale`);
  every other stage, and every stage on a phone, is at most 30rem. The answers take the stage's
  width. A stage under 26rem, a phone, sets 0.8 and 0.9.
- **The dialogue box** (the code's `bubble`) stands above the sheet: one panel in the theme's
  `--panel-raised` and `--line` edge, the host's chathead inside it at the left, 92px (72px compact, 56px on a
  phone), an event NPC's at the right (§12). The name is pinned centred to its top in
  `--speaker`, with room under it, and always shows; on the reveal your points sit at the
  row's right end as a chip, in the box's ink ("+850", "No answer · +0"), none for a player who
  could not answer. The line below reads from the left, in Quill. A hidden line keeps its room, so the sheet never moves when the host speaks, and the box
  is from the first frame as tall as the most its screen will say.
- **Elsewhere the host stands beside the sheet**: on the TV. There it stands at the scroll's bottom-left,
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
- **Between routes** (Create to the lobby, Home to Join), Suggest's list and editor the old screen fades out (150 ms) and the new
  one in (200 ms); reduced motion cuts. A room's first frame waits behind a "Connecting…" popup that
  only appears after 400 ms.
  After the first screen loads, the browser fetches the NPCs, emblems, team logos and pet chatheads
  (`lib/preload.ts`), so those do not pop in mid-fade.
- **Every line types in** at 50 letters a second: on the splash the bubble's greeting and blurb
  once the stage is in place, and a question's ask line in the bubble from 400 ms in the server's
  hold before `answerable_at`, then its stem on the sheet, the answers waiting under the line. Once
  you answer, the waiting line shows in the bubble, dimmed to 60%; on a phone while the TV
  has the stage, alone under the answers. Names show whole. Otherwise as §12.
- **Any answer that scores** pins the theme's pin on the sheet's bottom edge, 65% across: right,
  partial credit or a graded guess alike. It is the same rosette in every theme, so it always
  reads as a prize, painted in the theme's `--rosette-*` tokens; `wilderness` swaps the star at
  its heart for a skull. Full credit alone adds a burst of confetti (900 ms) in
  the theme's gem colours. `+0` gets nothing.
- **The sheet** is an original inline SVG and CSS component in layer 8's tokens. An `<img>` could
  not read the theme's custom properties (§13). The knobs are fixed pieces; a roll stretches only
  along its length. Every theme has its own paper.
- **Below the scroll** are the answers on a panel; gems never sit on parchment, so every gem
  check still measures against `--panel`. **At the table** (`AtTable`): the table panel (§9), with
  the lobby's and splash's buttons at its foot.
- **The host's voice** is the mode's copy in `lib/modes/`, all in the dialogue box: splash line,
  blurb, several ask, waiting and reveal lines, three or more waiting lines for each speed (bands
  1–2 quick, 3 middling, 4–5 "Just in time!") and step (first early, then later), and three or
  more reveal lines for each of right, partial credit, wrong and no answer. The host always speaks: ask while a question is
  open, waiting once you answer (by `answer_ack`'s band once it comes; the plain lines before it
  and on a ranked question), on the reveal the line for how you did (the plain reveal line
  if you could not answer) with the question's explanation; what follows and when is
  the timer's tab (§10). The line is seeded by the question's place in its round, so the room and
  the TV agree and neighbours never repeat. A mode's standing instruction is an ask line ("What is
  this the examine of?"), so the sheet holds only the question: the examine, the quote, or the
  item and its picture; the fixed prompts of Who's That NPC? and Who Said That? are not drawn. The TV says the ask and the plain reveal line at the sheet's foot, never a waiting line; a player's sheet has no foot. Question prompts stay plain: a prompt is parsed against the clock, and a joke around it
  is a second thing to read. Random events are the exception, in their NPC's voice.
- **The art** is the wiki's chathead, or the head of its render, mirrored to face the
  sheet. A mode with no host, or a host with no art, gets the generic boar.
- **Home** is a 960px column. Its host, as the lobby's (§9), is the selfhoster's hero for the theme
  (§14), else the Wise Old Man, saying the site's line in the dialogue box at its usual sizes. The
  theme's sheet under it holds the code field, Join and Create a room, and beside them
  one playable mode at a time, shuffled per visit: host's chathead, name, hint, "Presented by: <host>". It crossfades
  every 4.5 s, holds on hover or keyboard focus and under reduced motion, and is as tall as the
  tallest mode; a row of chatheads (dots on a phone) picks one. The label over the field is "Join an existing room". Then Public
  rooms while any are listed; Rooms you created here, Past party games while they have rows, and
  the Daily challenge in two columns, under the shorter of those two, one panel alone at full width (By yourself, 10 questions,
  One try and Play, then a ring with the points, with Your dailies under it); and Reldo's dialogue box, his chathead right: *How to play* and *Give feedback* (the Discord) for all, and for
  a browser that may suggest or holds the admin token also Suggest a question, Report a question and *Admin (n)*, n the pending suggestions.

## 9. The table panel, the splash and the ready check

The table panel (`TablePanel`) is who is at the table, on the theme's panel beside the stage. It
has two halves, each with its count: the lobby's and splash's "Ready" over "Not ready yet", a
question's "Answered" over "Still thinking". A pet moves up as
its player readies or answers. Pets sit three abreast, a 48px chathead over the whole name, which wraps
rather than being cut, yours first in your half and in bold, the rest below in join order and above in the order they arrived. An away pet
fades to grey, says "away" and stays below, since the server only knows who is still to answer
among the connected. A team game splits each half by team in god order, the teamless last. The
TV sits apart under "TV" at the foot. A question nobody answers lists everyone under "At the table".
On a phone a question's panel is a strip at the foot, "2 of 9 answered" and the first four faces,
answered first; in a reveal "5 of 9 got it right" and the faces of who did. It opens the panel
as a sheet, the reveal's as "Results", and a new question closes it. A reveal's panel is its
results (§3), 380px wide. The lobby and splash
keep the whole panel under the stage, since it holds their buttons. The threshold, countdowns and
take-back rule are architecture §7. A found item (§11) heads the column through its round: an
inventory square (charges top left), its name, line and "Gone after this round"; on a phone a square
at the strip's right end, opening it as a sheet. Every pet wears its item in a round slot on its
shoulder; one that breaks stays through that reveal. An item you use has its button under the
slot while it can be used, one tap, no confirm; on a phone a bar over the strip, the item, its line
and the button. Once used the slot, or the bar, has the after-use line and a spent square until
the reveal ends; nobody else sees a change until then. The Book swaps the answers for its line
and a disabled Answered, and its reveal says "Answered by the Book of Knowledge".

- **Lobby.** The hero, else the Wise Old Man, says the lobby line in the bubble. The scroll holds
  "Your friends join with this code", then on one line the link's prefix ("jollyboar.com/r/"), small,
  the code in the large face, which copies the invite link, and "Copy invite link"; an invite-only
  room has no prefix and says so instead of printing a link that carries its key
  (an error and the link to copy by hand where the clipboard refuses). Under it, for a player, a panel: the
  night's line, a card per round A–Z (its host's chathead, name and question count; a hidden
  round is "A surprise" with a "?"; from 9 rounds the 8th tile is "+N more", a popover of every
  round that Esc, a click outside or the button closes), "How to play" and "Quicker and correct answers score
  more." For the host, the dialogue box and scroll share a row, and Tonight's game takes the rest of the room: its title and tabs on
  one row, Rounds (the hosts beside Pick for me and the running order), House rules (Mystery Boxes
  among them, Off and fixed in a team game) and Random events, sent as they edit, 250 ms after the last change. A host's own question is written in a pop-up, which fills a phone. At the table: the host's Free for all or Teams, then join requests, a team game's gods, the halves,
  the Ready switch, and Start (plain at the threshold, "Start anyway" below it, which asks first; off
  until a round is picked) or "Waiting for the host to start…". The host taps a pet to kick or promote.
- **Emotes (#771).** The game's Emotes button, twice its size, only while the room lets you send one: at the
  table column's foot (on a phone the strip's left end), beside Ready in the lobby. It opens the
  emote tab, the theme's panel with the eight icons at their own pixel size, named on hover; a pick
  sends and closes it, as do Esc and a tap outside. For 3 s after the server's frame it is disabled
  under a shade draining left to right. The pet's line shows 3 s in the game's chatbox font with a
  black outline, in its chat colour and effect, while the chathead acts it out; over every pet the
  screen draws, and nothing clips either. Reduced motion holds both still. No sound.
- **Doors shut.** `/create` is that lobby before the room exists: "Your room's code" and Reroll on
  the scroll, Tonight's game under it, and at the head of the table column a room panel, Who can
  join, Surprise rounds and Open the doors, which goes when they open. Those stay as they are from
  then on, and only a room with Surprise rounds lets Pick for me keep its draw from the host too.
  Under 1024px the room panel stands under the scroll, and Tonight's game scrolls inside itself so
  the table stays in reach.
- **TV row:** the host's pet menu makes another player or admin the TV ("Make TV", never the
  last admin) and back ("Not the TV"), at once. Its pet wears a screen. The TV gets no ready,
  and its settings no name or pet.
- **Switches:** "Ready" is a large switch (`Switch.svelte`: the track and its label, no button
chrome or circle around them), on in `--ok`, in lobby and splash;
  where it cannot be taken back (the splash allows one take-back) it sits disabled, on. On touch
  devices, and in a room drawn below scale 1 (§8), a smaller "Full screen" switch of the same look
  sits beside it and follows the browser's state; below scale 1 a line adds "Short on room? Full
  screen shows the whole question." It is absent where the browser lacks the API (iPhone, #319).
- **Splash.** The host's greeting and blurb in the bubble. The scroll, centred: the mode's name,
  its Create hint alone, then small "Round 4 of 10, 5 questions" and a price round's date. Under it,
  "Tonight", only the row, centred: a host per round, past ones faded, the current one large and
  named, the rest numbered; a host shows only where the client knows it, so a shuffled or hidden
  round still to come shows Create's random-event "?" square. Ten fit a row; past 12 it shows the
  nearest 12, on a phone the nearest 5, with "+N" for the rest. The table panel holds,
  over the Ready switch, "Waiting for 2 more to be ready", never by name, then "Starting in 4",
  large, once the countdown runs.
- **How to play:** a row per way of answering: a small drawing of the control and one plain
  sentence, with every Submit named in bold, since players overlooked it. The Lobby's link opens
  them on a sheet: its rounds' types, or all of them when random events, host's questions or
  hidden rounds could bring any, ending with the Mystery Box line (items on, no teams) and "Quicker
  and correct answers score more.", as the trail's answering stop does. On Home, Reldo's
  How to play and a slide's mode name open `/how-to-play` and `/how-to-play/<mode>`: under the dialogue
  box, which stays, the sheet and panels fade out and the page fades in. The overview (Reldo speaking): Back,
  the three ways to play, each a drawing in theme tokens, the trail, and a tile per playable mode and one
  for Random events. The trail sits on the theme's sheet: a dashed path of stamps, an X on the last, with
  the stop you are on open under it (a drawing, or every way of answering, then Create a room and Try a question). A tile
  swaps the page to its mode (the host saying greeting and blurb; name, host, hint and only its
  types from `/api/modes`) or to Random events (the Mysterious Old Man; every event NPC and its
  theme), with All game modes back. Try a question (the overview's is More or Less's, a mode's
  where `lib/samples.ts` has one) plays a sample in the box's place with the room's timer, sheet,
  answers and reveal, the host's verdict and points; Again, or Try the next mode. Nothing is sent.

## 10. The question screen and the reveal

- The timer is a thin bar under the top bar, with the seconds in a tab at the stage's right edge
  and the question's number (`2/3`) in one at its left. In a reveal it counts to what follows,
  the tab naming it, "Next in 6s", "Standings in 6s" or "Final in 6s", and the fill in `--muted`,
  never turning urgent.
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
  Who's That NPC? gives it the stage height left over, less five 2.5rem suggestion rows under the
  answer input (160px to 12rem, never above one image pixel per screen pixel; 12rem off a room's
  stage); the list stays inside the stage. One box open, answered and revealed, and its shadow, which fades into the render (700 ms)
  with the name under it on the reveal. One flat colour, no glow or gradient, so a see-through part shows lighter
  in every theme: the scroll ink, Toktz's lava orange and the Gauntlet's crystal cyan.
  An item's inventory icon, in a 72px box at whole pixels, sits under The Price is Right's question
  and above each More or Less name. Without a file, the name stands alone.
- The `pick_from_list` combobox (behaviour in architecture §4) is full width, 56px tall, in the body
  face, with a 56px Submit under it. Its list floats over the page, so opening it never scrolls: below the field, and on a phone
  *above* it, clear of the keyboard. Typed text reads as a search; only a selection lights Submit.
  No visible label, "Search the list" for a screen reader.
- Answered and waiting shows your answer held and dimmed.
- **With a TV connected** a phone draws no stage: no host, scroll, stem, picture or event NPC,
  bar a picture pin's picture, which is its answers. The answers and the table's strip take the
  screen, and the reveal puts your points on their plaque above your marked answers, with no
  tally, counts, others' guesses or explanation. A TV that drops gives phones the whole question back.

On reveal everything recedes except the correct answer and your points. Buttons fade (§3); a typed,
picked or numeric answer fades beside the correct value. Your points go on a chip on the
dialogue box's name row (§8), no taller than the name so nothing moves, the same in every mode,
in display tabular numerals and the box's ink:

| Outcome | Slot shows |
|---|---|
| Right | `+850` |
| Wrong | `+0` |
| No answer | `No answer · +0`, muted |
| Graded (closest guess) | `+340`, the number carries the verdict |

- A timeout is not a wrong answer, and the slot says so. The number is the verdict: `--ok` and
  `--bad` do not reach 4.5:1 on parchment. A random event's card keeps them, on a plaque (#106).
- An item's points are the chip's second part, its icon, name and points: `+120 | Ring of Life
  +380`, Phoenix necklace's on the round's last reveal, whichever answer it raised, a charmed miss
  `−540`. The Book's points are the answer's own, so its chip has no second part. A phone with a
  TV adds it to the plaque.
- Only what you earned: the total waits for the standings. The slot never explains a number; a
  speed bonus explained mid-reveal is a second thing to read.
- No standings under a reveal: a board every question makes the game a spreadsheet. A team game
  ends the tally with a row per team, logo, name and its members' mean points on the question
  (silent is 0), in god order, not ranked.
- A suggested question whose player asked to be named ends the tally with "Question by Name",
  muted and off the scroll, so the reveal reads the same without it.

**The map.** `map_pin`'s answers are the stage: the map fills it, the sheet on it at the top left,
the bubble at the bottom left. Your pet is your pin; once all are down, Lock in stands over the last
one placed or moved. Stacked, the sheet crosses the top and the bubble the foot. The reveal opens close on the target's box for 4 s,
then pulls back to fit every pin, so the worst lands last: far pins are named first, the furthest
in `--bad`, and the table ranks them all. The TV shows no map until the reveal. One map stays up into
the reveal and the next map question: the old pins fade with the words as it glides on.
KGP Recon's photo is a print of its own on the map, a little askew, in its own shape and under a
surveillance camera drawn in the frame's own units (scanlines, vignette, corner marks, a red REC dot,
KGP-CAM 03, SURVEILLANCE), always 16:9: beside the
sheet on a wide map, under it otherwise. A tap opens it whole; Hide puts it away and Show photo on the
sheet brings it back. The reveal keeps pins clear of it. The TV, with no map, shows it on the sheet.

**The picture.** `picture_pin`'s answers are its picture, whole and full width, at most 55% of the
screen's height, Lock in under it; no zoom. Your pet is your pin, its exact spot a dot; on a grid the
lines are drawn and the tapped cell lights in `--accent`. The reveal draws the target box or cells,
every pet and a dashed line from each miss, yours tagged You. The TV shows it under the stem.

## 11. Standings

Standings appear between rounds and at the end, never between questions, in the `standings` phase
(architecture §7). A single-round game shows only the final ones. Both are the Wise Old Man's
hiscores on the stage (§8), for wiseoldman.net, where OSRS players track their gains. He speaks in
his bubble and the table is the whole sheet; the TV puts him at the sheet's top-left beside his
line, the title "Hiscores" or "Final hiscores" over it.

The table is the OSRS hiscores. On a desktop each row is one line: Rank, the places moved (▲2,
▼1), pet and name, "This round" (+1,240, muted) and bold points. On a phone and the TV it is `#`,
name and points, two lines a row, the move under the rank and the gain under the
total. "(you)" never splits from itself. The first round has no moves. Your row is highlighted,
and between rounds pinned to the sheet's foot when below it.

**Between rounds** he says "Round 2 done. Let's see who truly knows Gielinor best." The rows start
where they stood before the round, with the totals then; once his line has typed the gains count
up, a second later the rows move to their places, and then your row pins. About three seconds.
The table panel says "Next up": the next round's host, its name, "Round 3 of 3, 5 questions"
(`room.next_segment`, so hidden and shuffled rounds too) and "Moving on in 8", large, under them; the
panel is as tall as that, not its column.
On a phone it is a strip at the foot, "Next up: Bestiary" and the count, that opens nothing. The
timer bar counts to the next round in the quiet fill, its tabs `2/3` (rounds played) and `8s`.
The TV shows none of it.

**Mystery Boxes.** Once the rows have moved, a box lands on each finder's row in a column of its
own after the name, shakes, bursts and opens into the item's icon (its name the tooltip), a beat
after the row above; the standings hold 4 s longer. Yours opens large in "You found" under Next up
(on a phone a sheet over the strip): name, line, "Gone after Bestiary". Reduced motion, a reload or
a late arrival shows them open. With standings off the slot says "You found" on the next splash.

**The final** opens on "The final scores are in!", then presents fifth place to first: his line
names the place and its Quest Speedrunning trophy (Bronze to Diamond), "For 2nd place, the
platinum trophy goes to…" (at least three per place, and for a shared place, in `lib/modes.ts`),
with the trophy in his dialogue box beside it; then the scroll shows the place's pets (three, then
`+N`), names and points. First holds longest, with confetti from its trophy. Ranks are
dense, so tied players share a place; nobody on 0 points gets one, and a room where nobody scored
has no ceremony. The place then fades, the sheet unrolls to the full table with the rows arriving
top to bottom, and he says "Gz, Name! Here are the full hiscores." A Skip button jumps there.

The final standings have no table panel: the stage stands in the middle of the room. The TV,
which has no dialogue box, holds the trophy beside his line at the sheet's head. The ceremony plays only for a client that watched the game end. A reload, a late arrival and a
past game show the table at once, as does reduced motion. A past game (`/history`) is drawn as
this final, totals only: no moves or gains. A game this browser never kept has him say "I've no
record of that game. This browser kept no hiscores for it." over a sheet saying "Room FireCape". Trophies are art, not tokens.

**A team game** ranks its teams instead, with the same moves, gains and timing: rank, logo, name
and points, the god's colour on the team's edge, and under each its members with their own
totals, best first, so the weak link shows. The ceremony presents teams, fifth to first, each with
its logo, name, average points and the god's colour, in plain lines ("In fifth place…", "Tied
for second…"), no trophy, and confetti from first's logo; the final line names the winning team ("Saradomin wins!", "Saradomin and Zamorak win!"), and Past party games names it
on the game's entry.

## 12. Random events: the interlude (#106)

A random event is a question from an NPC who has nothing to do with the round. How often and who
asks what are architecture §5. This is how it looks.

**The event NPC sits on the right** of the dialogue box above the sheet; no box carries a tag,
only the speaker's name. The host always stands left, so position says "this is not the round's
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
- In the reveal the bubble comes back undimmed with the NPC's `right` or `wrong` line and the
  `explanation` (§8), and your points on its name row's chip. The bubble keeps
  room for all of it, two lines of explanation among it, from the first frame.
- The return takes the reveal's last 900 ms, off `next_at`: the NPC's bubble crossfades to the
  host's, empty, in one 300 ms fade, the sheet's words going with it; the next question's words
  then arrive in that bubble as §8. On the TV the NPC and the words fade out (225 ms), the scroll
  slides back (375 ms) and the host fades in (300 ms). A skipped reveal hands the stage back as §8.
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
3. **`media-src 'self'`**: sound files are the client's own.
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
| The poster's skull, floor props | Wiki sprites, as SVGs pixel for pixel | **Yes**, `assets/sprites/`, with a note beside it |
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
it, *We count games and rounds per day. No cookies, no personal data.* Beside it: GitHub, Discord, the licence, the OSRS Wiki (CC BY-NC-SA), Credits and the version, linked to its release. Its sheet ranks the named question authors by count, ties sharing a rank, with a way to `/suggest`, and thanks the wiki. The
AGPL wants a source link reachable from the service, and this is it. GitHub is also a muted icon in
the bar (§5). Every link opens a new tab, so a room is never
left.

**Selfhoster branding.** Four build-time env vars, which compose passes as build args:
`PUBLIC_SITE_NAME` (default *The Jolly Boar Inn*; also the tab title), `PUBLIC_SITE_LOGO` (an image
in `branding/`, also the tab icon; missing or unloadable, the bundled sign; a `logo-<theme>` beside it
overrides it per theme, an `og-card.png` is a shared link's picture, a `hero` and `hero-<theme>` host
Home and the lobby), `PUBLIC_HERO_NAME` (the hero's name; unset, the site's) and `PUBLIC_DEFAULT_THEME`
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
  starts again; with Mystery Boxes it goes to the foot first and holds while they open, with no
  "You found". The final's ceremony plays whole, without Skip.
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
| `forgetful_bard` | Falo the Bard
| `scaperune` | Mr. Mordaut
| `tales_of_gielinor` | The Wise Old Man, so he left the random-event roster
| `uris_unravelling` | Uri, who turns up at the end of an emote clue
| `slayer_master` | Konar quo Maten, who speaks of bringing balance
| `guess_examine` | The Examiner, from the Dig Site 
| `whos_that_npc` | Postie Pete
| `random_events_only` | The crowned frog from Kiss the Frog
| `custom` | The Jolly Boar Inn's bartender, since it is the host's inn 
| `sort_it_out` | Historian Minas, Varrock Museum 
| `drop_table` | Nieve 
| `bestiary` | Ardougne Zoo keeper 
| `who_said_that` | Cracked Jenny's Tea Cup, the parrot in Brimhaven
| `odd_one_out` | Dunce
| `minigame_madness` | Lanthus, who runs Castle Wars
| `whats_that_noise` | The Town Crier
| `minimap_guesser` | Captain Errdo |
| `scrying_pool` | Archmage Sedridor
| `lost_in_gielinor` | Hans
| `diary_dash` | Twiggy O'Korn, who sells the Achievement Diary cape
| `entrana_customs` | The Monk of Entrana, who searches every bag for weapons
| `kgp_recon` | A KGP Agent, the Cold War penguin spy
