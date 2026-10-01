# Design

What the app looks like and why. The architecture under it is `ideas/architecture.md`, which this
file links to rather than repeats. Sections describe the built app, and name the open issue
where one will change it.

## 1. Themes

A theme is a palette the player picks, kept in `localStorage["jbi:theme"]`, never on the server.

| id | Name | Mood | Base | Accent |
|---|---|---|---|---|
| `jolly` | Jolly Boar Inn | Default. Oak, candlelight, spilled ale. | Warm mid-brown, cream panels | Ale amber / hearth orange |
| `pollnivneach` | Pollnivneach | Bright desert noon. | Sandstone, off-white panels | Terracotta, indigo shade |
| `wilderness` | Wilderness | Dark. Cold ash and ember. | Near-black slate | Ember red, bone white |
| `party_room` | Party Room | Loud. A drop party, as in game. | Two-blue checks, balloons, white panels | Tablecloth blue |

- `jolly` is the default unless a selfhoster sets `PUBLIC_DEFAULT_THEME` (§14). There is no `auto`
  theme and nothing reads `prefers-color-scheme`: a phone in dark mode should still meet the inn.
- Variety between rounds comes from the round's host (§8), never from the palette. A palette that
  shifts under a question changes what the buttons mean.
- `party_room` scatters balloons and red partyhats across its floor afresh each visit
  (`PartyFloor.svelte`), the one theme whose page is not a static texture.

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
| 8. Scroll | `--scroll-paper` `--scroll-edge` `--scroll-ink` `--scroll-muted` | Must pass contrast; must still read as parchment |

`--more` and `--less` are not right and wrong, so they never borrow layer 3's colours. Layer 6 is
what makes a theme a different place: `wilderness` has a 2px radius and a hard border.

The script asserts, per `[data-theme]` block:

- `--ink` at 7:1 against `--bg` and `--panel`; `--muted`, `--ok` and `--bad` at 4.5:1 against
  `--panel`.
- `--ok` and `--bad` at least 60° apart in hue. About 8% of players will not see green and red,
  which is also why "wrong" always carries a glyph as well as a colour.
- `--gem-ink` at 4.5:1 on every gem, lit and faded. Faded is the gem mixed 25% into `--panel`.
- Every gem at least 20 apart (CIE76 ΔE) from its own faded self, because lit against faded is the
  whole reveal. That is why there is no diamond or onyx: white and black wash into a panel of their
  own lightness.
- Layer 8: `--scroll-ink` at 7:1 and `--scroll-muted` at 4.5:1 on `--scroll-paper`, and the
  paper at least 10 ΔE from `--bg` and `--panel`, so the scroll stands off the page. `wilderness`
  borrows `jolly`'s scroll: parchment reads as parchment, not as a dark sheet.

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
  six, so a screen reader reads them in order. While a pick waits, nothing moves.
- Your own pick carries a small "you", right or wrong, the only thing ever added to a button. The
  verdict is the points slot (§10), not the button.
- Under every reveal: "3 of 5 got it right", then a line per partial-credit band (90%, 80%, 70%)
  that has someone in it. With `name_wrong_answers` on, the names of everyone under 70% follow. A
  player who did not answer is not wrong.
- Six gems means no question offers more than six options.
- Gems are for `multiple_choice`, `price_is_right` and `ordering`. `more_less` keeps `--more` and
  `--less`, because its buttons carry item pictures, which a gem fill would drown.
  `pick_from_list` has a list of hundreds, answered through a combobox, with no gems.

## 4. Typography

- **Display** (`--font-display`): headings, the wordmark, round names, room codes, the timer and
  points. Things you glance at.
- **Body** (`--font-body`, `system-ui`): every sentence a player has to read, prompts and answers
  included. Pixel faces are hard to read at 16px, and hardest for the players already struggling.
- **Numbers** (`--font-numeric`): the display face with `tabular-nums`, so points and the countdown
  never jitter.
- No display face is chosen yet. `--font-display` falls back, and nothing depends on it.

## 5. The top bar

```
┌──────────────────────────────────────────────────────────────┐
│ [sign] The Jolly Boar Inn            [⌥]  [head Name emblem] │  56px, sticky
└──────────────────────────────────────────────────────────────┘
```

- **Left:** the sign, a plain `href="/"` link home, then the wordmark. Both are configurable (§14).
  The version is in the footer.
- **Right:** GitHub (`--muted`, the one control not about the game), then one control: the head,
  the name and the current theme's **emblem**. One thumb target, not three. The name is the bar's
  priority: it shows at every width and is the one item that shrinks, ellipsising.
- **Under 26rem** the wordmark and GitHub hide. At 320px the name keeps about 165px.
- **No room code.** Codes are words like `ThermonuclearSmokeDevil`, which either truncate to nothing
  or push the controls off a phone. The lobby and Join show the code instead.

The control opens one panel: **You** (name and head; the local profile outside a room, the live
player via `set_profile` inside one), **Sound** (§7) and **Theme**, a column of emblems beside their
names, the chosen one ringed. Picking a theme repaints at once and the panel stays open. Escape, a
tap outside or tabbing out closes it, and focus returns to the control unless the tap gave it
elsewhere. An emblem is the Leagues flag of the theme's area (§14); until one is dropped in, a flat
mark in the theme's `--accent` stands in. `tzhaar` is listed already, disabled, until its
palette exists.

## 6. Names and heads

The profile, `localStorage["jbi:profile"]`, holds this browser's name and head permanently. A
player is per room and temporary. There are no accounts.

- **Join and Create** never ask. A browser with no profile joins or hosts as a generated name,
  which becomes its profile, and the bar's control nudges once: *"You're Cow31337Killer42 — tap to
  change."* The moment a link is tapped is when a distracted person puts the phone down, so
  nothing stands in the way; a host renames from the lobby like anyone else.
- **Renaming** is `set_profile`. A player who never taps the nudge stays a joke name, so every
  generated name must be one you are happy to see win.

Generated names come from `data/player-names.json`: invented usernames in the register of a 2007
friends list (`ScapeRune77`, `AFKFisher`). Never NPC names, or somebody is called Hans while
wearing a goblin's face, and never real players. Base names are at most 21 characters so the suffix
fits. A duplicate is a 409, and the client re-rolls the suffix up to three times. A name matching
the room code is skipped: not a bug, but it reads like one.

Heads must reach other players, so the server stores them. `players.avatar` is a nullable id; the
client draws `player.avatar ?? derivedFrom(id)`, so a player who never chose still has a face.

- There are exactly 50 heads, because a room holds 50 players. They are hand-picked and committed
  in `data/heads/` with `heads.json` as the manifest. **The index is the contract**: an id may be
  redrawn but never repointed at another face.
- One sprite sheet, rendered pixelated at 32px and 48px, so each head is 16×16. The fifty shipped
  are placeholders the owner replaces file for file.

## 7. Sound (#102)

| Switch | Covers | Safe to mute? |
|---|---|---|
| **Music & effects** | Splash stings, the countdown tick, the reveal chime, lobby music, a random event's entrance | Yes. Decorative. |
| **Question audio** | Audio that is the question (Name that spell, a music round) | **No.** Those rounds become unplayable. |

- One mute button could not warn anyone, so there are two, in the bar menu's Sound section (§5).
  Muting question audio says: *"Some rounds are audio-only. You will not be able to answer those."*
- The CSP has no `media-src` yet, so audio is blocked until #102 adds `media-src 'self'`.
- Browsers block audio until a gesture. The ready tap (§9) unlocks it. A player who never sees a
  splash (`splash_seconds: 0`, or a reload mid-game) unlocks it with their first answer tap. An
  audio-only question that cannot play says so rather than sitting silent.
- `prefers-reduced-motion` is the sibling setting: anything that moves has a static fallback (#103).

## 8. The stage: a host and a clue scroll

Every round is presented by an NPC, the **host**, standing beside a **clue scroll** drawn after the
game's quest reward scroll: upright rolls with knobs, a sheet torn top and bottom. The scroll
carries the round's introduction on the splash and then every question; the answers sit under it.
Create shows each mode on a card with its host's chathead. The stage was agreed in
`client/prototypes/clue-scroll.html`, on the real tokens; under `make dev` it is at
`/prototypes/clue-scroll.html`.

```
        ╥────────────────────────────────╥
        ║ Know Your Content Creator      ║   display face
   ▄▄   ║ "Psst. Seen this one before?"  ║   the host's line, body face
  (••)  ║ Are you sure you are a fan?    ║   the blurb, in the host's voice
 ▟████▙ ║                                ║
        ╨──────────────────────✿─────────╨   the ribbon, for any points
──────────────────────────────────────────────
Round 2 of 5 · 5 questions · 20 seconds each
[ ✓ I'm ready ]   ●●●○●●○   Waiting for 2 more
```

- **One size.** The stage is at most 30rem wide at every width, and the answers under it take the
  same width. `--scroll-scale` sizes the rolls, margins and ribbon, `--scroll-text` the words; a
  stage under 26rem, a phone, sets 0.8 and 0.9.
- **The host** stands at the scroll's bottom-left, over its left roll: 78px wide overlapping 30px,
  and 68px overlapping 32px on a phone. Its chathead at both.
- **Under 448px of screen** the sheet runs edge to edge and the rolls sit half off the screen's
  edges. The host then stands on the sheet, which keeps a column clear for it.
- **The sheet** is at least four prompt lines tall, so a one-line question still makes a scroll,
  and faint facets crease it. An examine line sits centred in the height the prompt leaves.
- **It opens from the middle**, both rolls travelling outward, in 300 ms. It opens on the splash
  and stays put into the round's first question; anywhere else it is simply there. When it closes
  again is not decided, so for now it does not.
- **Any answer that scores** pins a red rosette ribbon on the sheet's bottom edge, 65% across:
  right, partial credit or a graded guess alike. Full credit alone adds a burst of confetti
  (900 ms) in the theme's gem colours. `+0` gets nothing.
- **The scroll** is an original inline SVG component in layer 8's tokens. An `<img>` could not read
  the theme's custom properties (§13). The knobs are fixed pieces; a roll stretches only along its
  length. `jolly` and `pollnivneach` have their own paper; `wilderness` uses `jolly`'s.
- **Below the line** is the page: on the splash the round's count and pace and the ready check;
  on a question only the answers, in a panel. Gems never sit on parchment, so every gem check
  still measures against `--panel`. The round is said on the splash only.
- **The host's voice** is the mode's copy: splash line, blurb, waiting line, reveal line, in
  `lib/modes.ts`. The splash scroll holds the mode's name, greeting and blurb; the waiting and
  reveal lines go at the sheet's foot, the reveal's beside the points. Question
  prompts stay plain: a prompt is parsed against the clock, and a joke around it is a second thing
  to read. Random events are the exception, already written in their NPC's voice.
- **The art** is the wiki's chathead, or the head of its render, mirrored to face the
  sheet. A mode with no host, or a host with no art, gets the generic innkeeper.

## 9. The splash and the ready check

The lobby and the splash ask different questions, so they get different widgets. The threshold,
countdowns and take-back rule are architecture §7.

- **Lobby: a named list.** The host needs to know *who* is missing before Start, and the answer is
  usually "Dave, at the bar". Start is plain once the room reaches the threshold, and "Start anyway"
  below it, which asks first.
- **Splash: a row of heads, no names.** A splash comes up to thirteen times a game; a named
  checklist each time turns a beat into a negotiation. Heads light as people tap, and "Waiting for
  2 more" says the rest.

## 10. The question screen and the reveal

- The timer is a thin bar under the top bar, with the seconds in a tab at the stage's right edge
  and the question's number (`2/3`) in one at its left. Answer buttons are 56px tall and full
  width on a phone: thumb targets at a pub table.
- The stem (prompt, item picture, examine line, More or Less's question) is on the scroll in
  `--scroll-ink`, and the answers, combobox, waiting state and tally are under the line. The
  question's heading is for a screen reader only.
- The `pick_from_list` combobox (behaviour in architecture §4) is full width, 56px tall, in the body
  face, with a 56px Submit under it. On a phone its list opens *above* the field so the keyboard
  never covers it. Typed text reads as a search; only a selection lights Submit.
- Answered and waiting shows your answer held and dimmed, "waiting for the room" and the answered
  count.

On reveal everything recedes except the correct answer and your points. Buttons fade (§3); a typed,
picked or numeric answer fades beside the correct value. The host says your points at the foot of
the scroll, a line held from the start so nothing under the sheet moves, the same in every mode,
in display tabular numerals and the scroll's ink:

| Outcome | Slot shows |
|---|---|
| Right | `+850` and a ✓ |
| Wrong | `+0` and a ✗ |
| No answer | `No answer · +0`, muted, no ✗ |
| Graded (closest guess) | `+340`, the number carries the verdict |

- A timeout is not a wrong answer, and the slot says so. The glyph is the verdict: `--ok` and
  `--bad` do not reach 4.5:1 on parchment. A random event's card keeps them, on a plaque (#106).
- Only what you earned: the total waits for the standings. The slot never explains a number; a
  speed bonus explained mid-reveal is a second thing to read.
- No standings under a reveal: a board every question makes the game a spreadsheet.

## 11. Standings

Standings appear between rounds and at the end, never between questions, in the `standings` phase
(architecture §7). A single-round game shows only the final ones. The final screen uses the same
component.

The top five stand on the Quest Speedrunning trophies, Diamond, Platinum, Gold, Silver and Bronze,
first in the middle:

```
                    ┌─────────┐
                    │ DIAMOND │
          ┌─────────┤ [head]  ├─────────┐
          │PLATINUM │ Cow313… │  GOLD   │
┌─────────┤ [head]  │  8,420  │ [head]  ├─────────┐
│ SILVER  │ ScapeR… │         │ AlchAd… │ BRONZE  │
│ [head]  │  7,115  │         │  6,980  │ [head]  │
│ xX_Lu…  │         │         │         │ NoobS…  │
│    4    │    2    │    1    │    3    │    5    │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

- Left to right, ranks 4 · 2 · 1 · 3 · 5, lower towards the edges. Each step has its trophy, a 48px
  head, the name and the points.
- Ranks are dense, so tied players share a step: up to three heads, then `+N`.
- Nobody with 0 points stands on the podium; the trophy shows dimmed on an empty step. A quiet
  room's first standings are not five zero-point winners.
- Names wrap to two lines, then ellipsise; the full name is in the accessible label.

Below it, the OSRS hiscores from rank 6: rank, head, name, right-aligned tabular points. There are no
gold, silver or bronze medals; a "Gold" third place beside a gold medal would contradict itself.
Your row is highlighted, and between rounds it is pinned to the bottom when it would be below the
fold. The final screen's table lists everyone, ranks 1–5 included.

The steps rise once when the phase opens, and nothing else moves. Trophies are art, not tokens.

## 12. Random events: the interlude (#106)

A random event is a question from an NPC who has nothing to do with the round. How often and who
asks what are architecture §5 and `ideas/random-events.md`. This is how it looks.

**The event NPC stands on the right.** The host always stands left, so position says "this is not
the round's question" before a word is read.

Everything happens inside the server's fixed 3.5 s hold before `answerable_at`, so the wait costs
nobody points and the server times nothing:

```
  0 ms   the NPC's name is on the scroll, whole; the scroll takes the prompt's height
         the host fades out; the scroll slides left into the space it leaves   ≤ 250 ms
150 ms   the event NPC fades in on the right                                   ≤ 250 ms
900 ms   the prompt "types" in at 60 letters a second
−200 ms  settled, 200 ms before answerable_at: nothing moves until the answers appear
answerable_at: the answers appear under the line and the timer bar starts
```

- The typing always ends 200 ms before `answerable_at`: a prompt too long for 60 a second types
  faster, and a hold too short for the 900 ms start starts sooner. At 0 the NPC is simply there.
- The typing is a mask, not a mutation: the whole prompt is in the DOM from the first frame. A
  screen reader reads it once, and a polite live region announces who interrupted.
- The NPC's `explanation` goes on the scroll in the reveal.
- The return mirrors the entrance in the reveal's last 250 ms, off `next_at`; a skipped reveal gets
  a 200 ms cross-fade.
- On a phone the NPCs swap sides and the scroll stays put.
- With reduced motion the NPC replaces the host in one frame and the prompt shows whole. The
  answers still wait, because that is a rule of the game, not an animation.
- An NPC this build does not know is drawn as the Mysterious Old Man.
- The panel holding the answers exists, with the buttons faded out.
- When the answers appear, they fade in (200ms)

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
| Item and NPC renders | Game assets, fetched by Phase 3's importer | No, fetched |
| Speedrunning trophies | Game renders | No, fetched; placeholders ship |
| Display font | Self-hosted, once chosen | No, fetched |
| Chat heads | 50 hand-picked (§6) | **Yes** |
| Hosts and event NPCs | Wiki chatheads (§8) | No, fetched; the innkeeper is committed |
| Theme emblems | Leagues area flags | No, fetched; inline placeholder marks |
| Clue scroll, logo, palettes, icons | Original | **Yes** |

- Fetching keeps the checkout small. Fetch scripts refuse to run without the operator's own
  User-Agent, per the wiki's terms.
- Heads are committed because curation is a person's judgement.
- Every art slot takes a file with no code change: the sign, the trophies, the heads, the NPCs, the
  emblems (`client/src/assets/themes/<theme>.<ext>`). The display face, the logo and
  `make fetch-assets` are the owner's, and no D task waits on them.

**Footer.** One small `--muted` line on every screen, in the flow and never fixed, so it cannot
cover an answer: *RuneScape and RuneScape Old School are the trademarks of Jagex Limited.* Beside
it: GitHub, the licence, the OSRS Wiki (CC BY-NC-SA) and the version, linked to its release. The
AGPL wants a source link reachable from the service, and this is it. GitHub is also a muted icon in
the bar (§5) and an "Open source" panel on Home. Every link opens a new tab, so a room is never
left.

**Selfhoster branding.** Three build-time env vars, which compose passes as build args:
`PUBLIC_SITE_NAME` (default *The Jolly Boar Inn*; also the tab title), `PUBLIC_SITE_LOGO` (an image
in `branding/`, also the tab icon; missing or unloadable, the bundled sign) and `PUBLIC_DEFAULT_THEME`
(a theme id for browsers that never chose; unknown, `jolly`). The GitHub link is not configurable:
a fork's footer should still point upstream.

A host cannot pin a room's theme, even as a suggestion: the theme is the one thing purely the
player's.

## 15. Open tasks

The open design tasks are GitHub issues labelled
[`design`](https://github.com/vosdev/jolly-boar-inn/issues?q=is%3Aopen+label%3Adesign), with their
dependencies, on the [project board](https://github.com/users/vosdev/projects/3).

## NPC Hosts

**Who hosts each mode.** The owner picks, in each new mode's issue. A host must not also be on the random-event roster, or the face that means
"interruption" would sometimes mean "the round".

| Mode | Host | |
|---|---|---|
| `price_is_right` | Grand Exchange Clerk
| `clipped` (Know Your Content Creator) | Gnome Child
| `more_less` | Ali Morrisane
| `pixel_hunt` | Sherlock
| `guess_examine` | The Examiner, from the Dig Site 
| `who_is_that_npc` | Postie Pete
| `custom` | The Jolly Boar Inn's bartender, since it is the host's inn 
| `release_order` & `sort_it_out` | Historian Minas, Varrock Museum 
| `drop_table` | Nieve 
| `bestiary` | Ardougne Zoo keeper 
| `who_said_that` | Parroty Pete (Parrot)
| `odd_one_out` | Wise Old Man or Sandwich Lady
| `minimap_guesser` | Captain Errdo |
