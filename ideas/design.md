# Design

What the app looks like and why. The architecture under it is `ideas/architecture.md`, which this
file links to rather than repeats. Tasks are D1–D16, numbered apart from the T tasks because they
touch different files; `ideas/TODO.md` says which have landed. Sections describe the built app,
and name the open D task where one will change it.

## 1. Themes

A theme is a palette the player picks, kept in `localStorage["jbi:theme"]`, never on the server.

| id | Name | Mood | Base | Accent |
|---|---|---|---|---|
| `jolly` | Jolly Boar Inn | Default. Oak, candlelight, spilled ale. | Warm mid-brown, cream panels | Ale amber / hearth orange |
| `pollnivneach` | Pollnivneach | Bright desert noon. | Sandstone, off-white panels | Terracotta, indigo shade |
| `wilderness` | Wilderness | Dark. Cold ash and ember. | Near-black slate | Ember red, bone white |
| `party_room` | Party Room (D12) | Loud. A drop party. | Deep purple | Gold, partyhat cyan/pink |

- `jolly` is the default unless a selfhoster sets `PUBLIC_DEFAULT_THEME` (§14). There is no `auto`
  theme and nothing reads `prefers-color-scheme`: a phone in dark mode should still meet the inn.
- Variety between rounds comes from the round's host (§8), never from the palette. A palette that
  shifts under a question changes what the buttons mean.
- `party_room` is its own task, built last and cut if it fails the contract.

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
| 8. Scroll (D13) | `--scroll-paper` `--scroll-edge` `--scroll-ink` `--scroll-muted` | Must pass contrast; must still read as parchment |

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
- Layer 8 (D13): `--scroll-ink` at 7:1 and `--scroll-muted` at 4.5:1 on `--scroll-paper`, and the
  paper at least 10 ΔE from `--bg` and `--panel`, so the scroll stands off the page. `wilderness`
  gets a dark, smoke-stained scroll with pale ink, not a cream rectangle glowing in the dark.

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
- Six gems means no question offers more than six options (T32).
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
│ [sign] The Jolly Boar Inn       [⌥]  [head] Name   [🔊] [🎨] │  56px, sticky
└──────────────────────────────────────────────────────────────┘
```

- **Left:** the sign, a plain `href="/"` link home, then the wordmark. Both are configurable (§14).
  The version is in the footer.
- **Right, in order:** GitHub, identity, sound (D6), theme. The name is the bar's priority: it
  shows at every width, and it is the one item that shrinks, ellipsising. Sound and theme are 36px
  each at the outer edge. GitHub is `--muted`, as the one control not about the game.
- **Under 26rem** the wordmark and GitHub hide, and nothing folds into a `⋯` menu. At 320px the name
  keeps about 125px.
- **No room code.** Codes are words like `ThermonuclearSmokeDevil`, which either truncate to nothing
  or push the controls off a phone. The lobby and Join show the code instead.

The identity chip edits the local profile outside a room and the live player (`set_profile`)
inside one: one popover, two save paths.

## 6. Names and heads

The profile, `localStorage["jbi:profile"]`, holds this browser's name and head permanently. A
player is per room and temporary. There are no accounts.

- **Join and Create** never ask. A browser with no profile joins or hosts as a generated name,
  which becomes its profile, and the chip nudges once: *"You're Cow31337Killer42 — tap to
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

## 7. Sound (D6)

| Switch | Covers | Safe to mute? |
|---|---|---|
| **Music & effects** | Splash stings, the countdown tick, the reveal chime, lobby music, a random event's entrance | Yes. Decorative. |
| **Question audio** | Audio that is the question (Name that spell, a music round) | **No.** Those rounds become unplayable. |

- One mute button could not warn anyone, so there are two. Muting question audio says: *"Some
  rounds are audio-only. You will not be able to answer those."*
- The CSP has no `media-src` yet, so audio is blocked until D6 adds `media-src 'self'`.
- Browsers block audio until a gesture. The ready tap (§9) unlocks it. A player who never sees a
  splash (`splash_seconds: 0`, or a reload mid-game) unlocks it with their first answer tap. An
  audio-only question that cannot play says so rather than sitting silent.
- `prefers-reduced-motion` is the sibling setting: anything that moves has a static fallback (D11).

## 8. The stage: a host and a clue scroll (D13, D14)

Every round is presented by an NPC, the **host**, standing beside a **clue scroll**. The scroll
carries the round's introduction on the splash and then every question; the answers sit under it.
Create lists each mode under its host: *Grand Exchange Clerk presents: The Price is Right*. Until
D13 lands, the splash shows a placeholder tavern scene, which D13 removes.

```
          ╭────────────────────────────────────────────╮
          │  ROUND 2 OF 5                              │  display face, --scroll-muted
   ▄▄     │  The Price is Right                        │  display face
  (••)    │  "Welcome, welcome! Step up to my counter."│  the host's line, body face
 ▟████▙   │  One item, four prices. Which one does it  │  the blurb, in the host's voice
  host    │  really go for on the Grand Exchange?      │
          ╰────────────────────────────────────────────╯
──────────────────────────────────────────────────────────────
         [ ✓ I'm ready ]   ●●●○●●○   Waiting for 2 more
```

- **Wide (40rem up):** the host takes about a fifth of a 56rem stage, overlapping the scroll's left
  edge. The stage is wider than the lobby's 42rem, because a fifth of 42rem is a head, not a person.
- **Narrow:** the scroll is full width and the host shrinks to a 64px head on its top-left corner,
  like a chat head on a dialogue box. No host is worth a line of question text on a phone.
- **The scroll** is an original inline SVG component in layer 8's tokens. An `<img>` could not read
  the theme's custom properties (§13). Its rolled ends are fixed pieces; only the paper stretches.
- **Below the line** is the page: the ready check, then the answers. Gems never sit on parchment, so
  every gem check still measures against `--panel`.
- **The host's voice** is the mode's copy: splash line, blurb, waiting line, reveal line, in
  `lib/modes.ts`. Question prompts stay plain: a prompt is parsed against the clock, and a joke
  around it is a second thing to read. Random events are the exception, already written in their
  NPC's voice.
- **The art** is original, fixed-colour SVG on one shared rig (D14), so some thirty NPCs look like
  one cast. A mode with no host gets a generic innkeeper.

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

- The timer is a thin bar under the top bar. The prompt is 1.4rem body. Answer buttons are 56px tall
  and full width on a phone: thumb targets at a pub table.
- From D13 the stem (prompt, item picture, examine line) is on the scroll in `--scroll-ink`, and the
  answers, combobox, waiting state, tally and points slot are under the line.
- The `pick_from_list` combobox (behaviour in architecture §4) is full width, 56px tall, in the body
  face, with a 56px Submit under it. On a phone its list opens *above* the field so the keyboard
  never covers it. Typed text reads as a search; only a selection lights Submit.
- Answered and waiting shows your answer held and dimmed, "waiting for the room" and the answered
  count.

On reveal everything recedes except the correct answer and your points. Buttons fade (§3); a typed,
picked or numeric answer fades beside the correct value. Points sit in one slot, in the same place
in every mode, in display tabular numerals:

| Outcome | Slot shows |
|---|---|
| Right | `+850`, `--ok` and a ✓ |
| Wrong | `+0`, `--bad` and a ✗ |
| No answer | `No answer · +0`, muted, no ✗ |
| Graded (closest guess) | `+340`, the number carries the verdict |

- A timeout is not a wrong answer, and the slot says so. Layer 3 lives here now, on the slot and
  its glyphs, not on buttons.
- Under the points, in `--muted`, the running total: `+850` over `9,270`. The slot never explains a
  number; a speed bonus explained mid-reveal is a second thing to read.
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

## 12. Random events: the interlude (D16)

A random event is a question from an NPC who has nothing to do with the round. How often and who
asks what are architecture §5 and `ideas/random-events.md`. This is how it looks.

**The event NPC stands on the right.** The host always stands left, so position says "this is not
the round's question" before a word is read.

Everything happens inside the hold before `answerable_at` (`random_event_seconds`, 2 by default),
so the wait costs nobody points and the server times nothing:

```
  0 ms   the host fades out; the scroll slides left into the space it leaves   ≤ 250 ms
150 ms   the event NPC fades in on the right                                   ≤ 250 ms
400 ms   the NPC's name and opening line appear on the scroll, whole
         the prompt "types" in, in a fixed 800 ms whatever its length           800 ms
~1.2 s   settled: nothing moves again until the answers appear
2.0 s    answerable_at: the answers appear under the line and the timer bar starts
```

- The typing is capped by time, not paced by character, so a long prompt is never still typing
  when the answers arrive. A shorter hold compresses the sequence; at 0 the NPC is simply there.
- The typing is a mask, not a mutation: the whole prompt is in the DOM from the first frame. A
  screen reader reads it once, and a polite live region announces who interrupted.
- The NPC's `explanation` goes on the scroll in the reveal.
- The return mirrors the entrance in the reveal's last 250 ms, off `next_at`; a skipped reveal gets
  a 200 ms cross-fade.
- On a phone the heads swap corners and the scroll stays put.
- With reduced motion the NPC replaces the host in one frame and the prompt shows whole. The
  answers still wait, because that is a rule of the game, not an animation.
- An NPC this build does not know is drawn as the Mysterious Old Man.

## 13. What the build constrains

All from the CSP in `server/app/http/headers.py`:

1. **`style-src 'self'`, no `'unsafe-inline'`.** No inline `style=` and no Svelte `style:`
   directive for anything themed. Themes switch by setting `document.documentElement.dataset.theme`
   over palettes written statically in `app.css`. SVG art that must follow the theme is an inline
   component with classes, because an SVG loaded by `<img>` or `url()` cannot see custom
   properties.
2. **`font-src 'self'`.** Self-hosted fonts only. No Google Fonts, no CDN.
3. **No `media-src`**, so audio is blocked until D6.
4. **`img-src 'self' data:`** covers local art and Vite's inlined assets.

The theme must be set before first paint, and `script-src 'self'` forbids an inline script. So
`main.ts` sets `data-theme` first, and `color-scheme` on `:root` covers the one-frame gap.

## 14. Assets, branding and the footer

| Art | Source | In the repo? |
|---|---|---|
| Item and NPC renders | Game assets, fetched by Phase 3's importer | No, fetched |
| Speedrunning trophies | Game renders | No, fetched; D9 shipped placeholders |
| Display font | Self-hosted, once chosen | No, fetched |
| Chat heads | 50 hand-picked (§6) | **Yes** |
| Hosts and event NPCs | Original SVG on one rig (§8) | **Yes** |
| Clue scroll, logo, palettes, icons | Original | **Yes** |

- Fetching keeps the checkout small. Fetch scripts refuse to run without the operator's own
  User-Agent, per the wiki's terms.
- Heads are committed because curation is a person's judgement. NPCs are drawn because renders
  come in thirty scales and poses.
- Every art slot takes a file with no code change: the sign, the trophies, the heads, the NPCs. The
  display face, the logo and `make fetch-assets` are the owner's, and no D task waits on them.

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

```
D6 sound switches            (the bar exists)
D12 party_room               (D5's themes)
D13 the stage ──┬─▶ D14 hosts + their voice ──▶ D15 the event NPCs
                └─▶ D16 the interlude  (needs D15)
D11 motion + reduced-motion pass  (last, after D16)
```

### D6. Sound

`media-src 'self'` in the CSP; the two switches, the volume slider, the three-state icon; the
unlock gesture wired to the ready-check tap **and to the first answer tap**, for the players who
never see a splash (§7); `lib/audio.ts` with a null implementation so the switches work before any
audio file exists.

**Accept:** with no audio assets present, both switches persist and no console error appears;
muting question audio shows the warning copy; a fresh tab that has not been tapped does not throw
an autoplay error; a player who reloaded mid-game, or who is in a room with `splash_seconds: 0`, has
working audio from their second question onwards; an audio-only question that cannot play its audio
says so instead of showing a silent prompt; the CSP change is covered by the existing headers test.

### D11. Motion and the reduced-motion pass

Every transition audited, a `prefers-reduced-motion` branch for each, and the animation budget
written down so it stays small.

**Accept:** with reduced motion on, nothing moves except the timer bar and it does so by changing
width without easing; no animation exceeds 250ms, except the interlude's typed prompt at 800ms
(§12), which is the one written exception; no animation runs while a question's answers are open
except the timer — the interlude plays inside the hold before `answerable_at` and in the reveal,
never over live answers.

### D12. The Party Room theme

`party_room` on its own, against the contract: deep purple base, gold and partyhat accents, a wide
radius, no border. Its accent most wants to be used everywhere, which §2 forbids, so it must be able
to fail, or be cut, without taking the other themes with it.

**Accept:** it passes the contrast script unmodified, `--gem-ink` against every gem and layer 8's
scroll included, and its scroll still reads as parchment; no `party_room` rule touches a layer-3 or
layer-4 token outside its own `[data-theme='party_room']` block; a reveal is readable on a phone at
low brightness in a dark room; if it cannot do those things it is deleted rather than exempted, and
the other themes are unaffected either way.

### D13. The stage: the host slot and the clue scroll

The layout of §8, used by the splash and by every question screen: the host slot on the left, the
clue scroll, and the line the ready check and the answers sit below. The scroll is an inline SVG
component — paper, rolled ends, a wax seal — whose ends are fixed pieces and whose paper stretches.
Layer 8 (`--scroll-*`) is written for `jolly`, `pollnivneach` and `wilderness`, and
`scripts/check_contrast.py` learns its assertions (§2). The stage is 56rem at its widest, and under
40rem it collapses to a full-width scroll with a 64px head on its corner.

The host slot ships holding the generic innkeeper (a placeholder until D14 lands the rig), so this
task is not blocked on art. It removes the splash's tavern scene: the `scene` field, `SCENES`,
`splashArt` and the scene globs come out of `lib/modes.ts`, the scene slot out of `Splash.svelte`,
and `assets/scenes/` goes.

**Accept:** the splash and every question type render on the stage; prompts on the scroll reach 7:1
and muted text 4.5:1 in every theme, checked by the script, and the script fails a deliberately
washed-out `--scroll-ink`; the scroll reads as parchment in `wilderness` as well as `jolly`, with
screenshots of all three in the PR; no gem button, combobox or points slot sits on the parchment;
the scroll unrolls in 200ms on the splash, stays put into the round's first question, and simply
appears with reduced motion; at 375px, six gem buttons at 56px and a two-line prompt fit without
scrolling; the rolled ends do not stretch at any width; there is no horizontal scroll at 320px; no
scroll colour is set by an inline style or a `style:` directive; the existing ready-check and gem
tests pass unchanged.

### D14. Hosts, and the voice they speak in

The rig: one SVG construction every NPC is built on, with a shared head, proportions, outline weight
and two-tone shading, and the hat, hair, beard, clothing and palette as the parts that vary. The rig
is saved as a template with its conventions in `client/src/assets/npcs/README.md`, so drawing the
next NPC is filling it in. Each NPC is drawn once, head and upper body, and cropped to its head for
the phone corner (§8), so there is one file per NPC.

Then the hosts for every mode that exists when this task lands: the Grand Exchange Clerk for The
Price is Right, and one each for More or Less, Guess the Examine and the host's own questions (the
innkeeper, whose inn it is), plus the generic innkeeper for a mode this build does not know.
`lib/modes.ts` gains `host` (an NPC id with the name to print) and the host's lines: the splash
greeting, the blurb rewritten in the host's voice, the waiting line and a short reveal line. Create
lists each mode as *<Host> presents: <Mode>*. Question prompts are not rewritten (§8).

**Accept:** every mode in `MODES` has a host with a drawing and all four lines, and a test holds
them to it; a mode id with no entry gets the innkeeper and its generic lines; each drawing is
legible as its NPC at the 64px head crop, judged side by side in the PR; the hosts look like one
cast, with the same outline and shading; a drawing is a file found by name, and replacing one needs
no code change; the SVGs are optimised, and all of them together weigh under 60kB; Create shows
*<Host> presents:* above each mode's label without pushing its checkbox row past one line at 375px.

### D15. The random-event NPCs

A drawing on D14's rig for every id in `server/app/random_events.py` (sixteen today), plus the
Mysterious Old Man, who stands in for an id this build does not know (§12). Art only: the NPCs'
names and lines are `lib/randomEvents.ts`. A drawing whose NPC is not on the roster yet may land
early.

**Accept:** every roster id has a drawing, and a test fails on one that does not; each reads as its
NPC at the 64px head crop; they sit in the same cast as the hosts, and no event NPC could be
mistaken for the host of a mode; replacing one needs no code change.

### D16. The interlude

The sequence of §12, built on `answerable_at`, `random_event` and D13's stage: the host out, the
scroll across, the event NPC in on the right, the name and opening line, the typed prompt, the
answers at `answerable_at`, and the return in the last 250ms of the reveal. It turns today's
`RandomEvent.svelte` card into the stage. T30's NPC picker previews through it. Its entrance sting
is D6's; without D6 it is silent and nothing else changes.

**Accept:** the answers never appear before `answerable_at`, and the stage is settled — nothing
moving — by then, at the default 2 seconds and at 1; at `random_event_seconds: 0` the event NPC is
simply in place when the question opens; the typed prompt takes 800ms whatever its length, and a
200-character prompt is fully shown by 1.2s; a screen reader reads the prompt once, whole, and
hears who interrupted; with reduced motion nothing slides, fades or types and the answers still
wait; on a phone the head swaps corners and the scroll does not move; a reconnect inside the hold
lands on the settled stage with the right delay and no replay; the host is back in place for
whatever follows the event, the standings included; an unknown NPC id shows the Mysterious Old Man;
the `explanation` shows on the scroll in the reveal.

## Needs decision

**Who hosts each mode.** The owner picks, before D14 for the modes that exist and inside each T
task for the rest. A host must not also be on the random-event roster, or the face that means
"interruption" would sometimes mean "the round".

| Mode | Host | |
|---|---|---|
| `price_is_right` | Grand Exchange Clerk | chosen |
| `clipped` (Know Your Content Creator) | Gnome Child | chosen |
| `more_less` | Bob Barter, the Grand Exchange's price-watcher | suggestion |
| `guess_examine` | The Examiner, from the Dig Site | suggestion |
| `custom` | The Jolly Boar Inn's bartender, since it is the host's inn | suggestion |
| `release_order` | Historian Minas, Varrock Museum | suggestion |
| `drop_table`, `bestiary` | A Slayer master (Konar, Duradel) | suggestion |
| `who_said_that`, `odd_one_out`, `sort_it_out` | — | open |
