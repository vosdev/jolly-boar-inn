# Design

The frontend design task list. The architecture it sits on lives in
`ideas/architecture.md`; the modes it has to draw live in `ideas/games.md` and
`ideas/phase2.md`. This file does not repeat any of them — it says what the app should look
like, why, and in what order to build it.

Tasks are numbered **D1–D12** rather than continuing the T-numbers, because design work and
mode work touch almost disjoint sets of files and can land in either order. D1 is the only
task everything else waits on.

## What this document decides

1. **One inn, several rooms.** The Jolly Boar Inn palette is the identity and the default.
   Themes are a picker, not a coin flip.
2. **Tokens in layers, with a contract.** A theme may repaint the furniture. It may not
   repaint what "you got it wrong" looks like.
3. **Nobody types a name unless they want to.** A random name is filled in, not suggested.
4. **A head is not a preference.** It has to be visible to everyone else, so it cannot live
   in localStorage the way the theme does.
5. **Two sound switches, not one**, because one of them can make a round unplayable.
6. **A quiet footer**, carrying the trademark line, the GitHub link and the licence.
7. **Seven gems, and the reveal never recolours one.** Position is identity. The verdict
   lives in the points slot, where it is the same shape in every mode.
8. **Standings between rounds, on a podium.** Never between questions. The top five stand on
   the Quest Speedrunning trophies, and everyone else is on the hiscores table below them.

Every question this document once left open has been answered. The answers are folded into
the sections below and listed, one line each, under "Decided" at the end; new questions go
back into "Needs decision" as they turn up.

---

## 1. One theme or many?

You asked whether to go with one Jolly Boar Inn look or a set of themes. Two ways to
go forward:

**A. One theme, light and dark.** A single warm-tavern palette in two brightnesses. Cheapest
to build, cheapest to keep good, and it makes the app recognisable in a screenshot — every
screenshot looks like the same product. The cost is that a quiz night is a *long* sitting
and one palette for two hours is the visual equivalent of one song on repeat.

**B. A named theme picker.** Four or five palettes with OSRS place names, one of them the
default. Costs roughly one extra day over option A once the tokens exist, because a theme
becomes a block of thirty custom properties and nothing else. It is also the single best
feature for the selfhosting audience: "The Dancing Donkey Inn" wants to look different from
your instance, and a theme file is how they do that without forking CSS.

**Recommended: B, with the variety per round coming from art rather than colour.** The
theme stays where the player put it. What changes between rounds is the splash artwork and
one decorative accent used *only* on the splash card and the round chrome — never on an
answer button, never on a verdict. You get "oh, a new round, and it looks like a new place"
without the palette shifting under a question.

### The themes

| id | Name | Mood | Base | Accent |
|---|---|---|---|---|
| `jolly` | Jolly Boar Inn | Default. Oak, candlelight, spilled ale. | Warm mid-brown, cream panels | Ale amber / hearth orange |
| `pollnivneach` | Pollnivneach | Bright desert noon. Bleached, high-contrast, dusty. | Sandstone, off-white panels | Terracotta, indigo shade |
| `wilderness` | Wilderness | Dark. Cold ash and ember, nothing cosy. | Near-black slate | Ember red, bone white |
| `party_room` | Party Room | Loud. Balloons, partyhats, a drop party. | Deep purple | Gold, partyhat cyan/pink |

`jolly` is the default for a browser that has never chosen — always, and **there is no
`auto` theme and nothing follows `prefers-color-scheme`.** Jolly sits between a light and a
dark palette, so it is a defensible first thing to see on any device, and a player who wants
brighter or darker picks `pollnivneach` or `wilderness` from the menu. That keeps the default
one branch instead of two, and it means a first-time visitor whose phone is in dark mode is
never dropped into the Wilderness before they have seen the inn.

Two warnings on `party_room`: it is the theme people will pick first and the theme most
likely to fail contrast, and it is the one theme whose accent wants to be used on everything
— which is exactly what the token contract below forbids. So it is **not part of D5.** It is
D12, built last against a contract that already has teeth, and cut without ceremony if it
cannot pass the check.

---

## 2. Colour: the token contract

`client/src/app.css` already has the right instinct in it. The comment on `--more` / `--less`
— that "more" and "less" are not "right" and "wrong", and must not borrow their colours —
is the whole design system in miniature. D1 generalises it.

Tokens split into seven layers. A theme may freely override layers 1, 2, 5, 6 and 7. Layers
3 and 4 are a **contract**: a theme sets them, but the values must pass a contrast check
that runs in CI.

| Layer | Tokens | Theme may change? |
|---|---|---|
| 1. Surface | `--bg` `--panel` `--panel-raised` `--line` `--ink` `--muted` | Freely |
| 2. Brand | `--accent` `--accent-ink` `--accent-hover` | Freely |
| 3. Verdict | `--ok` `--ok-ink` `--bad` `--bad-ink` `--warn` `--warn-ink` | Must pass contrast + hue check |
| 4. Semantic | `--more` `--less` | Must pass; must differ from layer 3 by hue or shape cue |
| 5. Gems | `--gem-sapphire` `--gem-emerald` `--gem-ruby` `--gem-diamond` `--gem-dragonstone` `--gem-onyx` `--gem-zenyte` `--gem-ink` | Freely, but `--ok` must stay visible against each |
| 6. Shape | `--radius` `--border-width` `--shadow` `--font-display` `--font-body` `--font-numeric` | Freely |
| 7. Texture | `--texture-panel` `--texture-bg` (a local `url()` or `none`) | Freely |

Layer 6 is what makes themes feel like different places rather than different hues.
`wilderness` wants `--radius: 2px` and a hard 2px border; `jolly` wants `10px` and a soft
inner shadow like a worn tabletop; `party_room` wants a wide radius and no border at all.
That does more work than colour does.

**The check.** A script in CI parses `app.css`, walks every `[data-theme]` block, and
asserts for each: `--ok` and `--bad` reach 4.5:1 against `--panel`; `--ink` reaches 7:1
against both `--bg` and `--panel`; `--muted` reaches 4.5:1 against `--panel`; and `--ok`
and `--bad` are at least 60° apart in hue so they stay distinguishable to the ~8% of players
who will not see them as green and red. That last one is why "wrong" is drawn with a border
and a glyph as well as a colour, everywhere, without exception.

One assertion is there for the reveal specifically. The correct answer keeps its gem fill and
gains an `--ok` ring, so `--ok` lands on top of a gem rather than on `--panel` — and an `--ok`
green ringing an emerald button is a ring nobody can see. The script therefore also asserts
**`--ok` reaches 3:1 against every `--gem-*` in the theme**, the non-text threshold for a UI
boundary. A neutral ring would have avoided the check; it would also have thrown away the one
moment in the game where `--ok` is doing its actual job, so the check is the cheaper of the
two. A theme that cannot satisfy it moves its gem, not the ring.

### The gem buttons and the reveal problem

Sapphire / emerald / ruby / diamond / dragonstone for multiple-choice answers is a good
idea and it has one sharp edge: **a ruby button that turns out to be the correct answer, and
an emerald button that turns out to be wrong.** If the verdict is painted as a green or red
fill, the emerald button quietly lies for the half-second before anyone reads it.

The rule that fixes it: **on reveal, no button changes colour.** The correct button keeps its
gem fill and gains a `--ok` ring plus a leading ✓. Every other button fades — the fill loses
saturation, the answer text stays at 4.5:1 or better, because people want to read what the
other options said. It does not matter which gem is correct: if Sapphire is right, ruby,
emerald and diamond fade and sapphire stays lit. The gem stays as identity, and green and red
never land on a gem.

Your own pick is the one exception to "faded means nothing". If you pressed Ruby and it was
wrong, Ruby is faded like the rest but carries a ✗ and a small "you" marker, so you can still
see what you chose. Five states per button, all of which need drawing in D8: idle,
pressed-by-you-and-waiting, revealed-correct, revealed-faded, revealed-your-wrong-pick.

Fading on its own does not say whether *you* were right — you would have to compare your
button with the lit one. The verdict is the points slot in §7.2.

Gems are also ordering, not decoration: **sapphire, emerald, ruby, diamond, dragonstone,
onyx, zenyte** is the in-game value order, so position 1 is always sapphire, position 2
always emerald, and so on down. That holds however many options are on screen — a two-option
question shows sapphire and emerald, never sapphire and zenyte — because the whole value of
the scheme is that a player learns the position, which is worth more than variety.

Seven gems is therefore also a cap: **no mode may offer more than seven options.** That is a
constraint on question generation rather than on this document, and it is tracked as its own
task outside the D-tasks.

Which modes get gems: `multiple_choice`, `price_is_right` and `ordering` — every mode whose
answer is "pick one of these". That leaves only `more_less`, which keeps `--more` / `--less`
and the reasoning in §7.2, and which would not want a gem fill anyway: its two buttons carry
the item picture, and a picture on a gem fill is a picture nobody can read.

`pick_from_list` (Guess the Examine, and later Who's That NPC? and Pixel Hunt) is "pick one
of these" too, but of a few hundred, not seven. It gets no gems and no buttons: it answers
through a combobox (§7.2), and the seven-option cap does not apply to it.

---

## 3. Typography

Two faces, one job each.

- **Display** (`--font-display`): the OSRS-style pixel face. Headings, the logo wordmark,
  the splash mode name, the room code, the timer, and points. Nowhere else.
- **Body** (`--font-body`): what is there today — `system-ui` and friends. Every sentence a
  player actually has to read: blurbs, question prompts, answer text, settings, errors.

Pixel faces at 16px with real line-wrapping are genuinely hard to read, and the people who
struggle most are the ones already struggling. The rule "display for things you glance at,
body for things you read" gets 90% of the flavour for none of the cost.

- **Numbers** (`--font-numeric`): whatever the theme's display face is, plus
  `font-variant-numeric: tabular-nums`. Points and the countdown must not jitter as digits
  change. This is one line of CSS and it is the difference between a timer that feels solid
  and one that twitches.

Fonts must be **self-hosted** — `font-src 'self'`, no Google Fonts, see §8.

**No display face has been chosen yet**, and finding one whose licence survives being
committed to this repo is the owner's, tracked in `ideas/TODO.md` rather than in any D-task.
Until it lands, `--font-display` falls back to the browser default and the app renders in
body type throughout. Everything above is written so that this costs flavour and nothing
else: no layout, no contrast check and no accept criterion depends on the pixel face
existing, and dropping the file in later is a change to one token.

---

## 4. The top bar

Today `App.svelte` renders `<main>` and nothing else. D2 adds a shell:

```
┌──────────────────────────────────────────────────────────────┐
│ [sign] The Jolly Boar Inn      [⌥]  [head] Name   [🔊] [🎨]  │  56px, sticky
└──────────────────────────────────────────────────────────────┘
```

- **Left: logo + wordmark.** Both configurable (§9.4) so a selfhoster's instance is theirs.
  The wordmark hides under 26rem; the sign never does. **The sign is a link home** — a
  plain `href="/"`, so a modified click still opens a tab. Following it from inside a room
  loses nothing: the session stays in this browser and the room's link brings you back.
- **Right, in order: GitHub, identity (head + name), sound, theme.** Identity leads the
  group because the player's name is the bar's priority: it is shown at every width, and
  it is the one item in the bar allowed to shrink — it ellipsises rather than dropping to
  just the head. Sound and theme sit outermost at a fixed 36px each, where a thumb finds
  them. GitHub sits innermost and at `--muted` — it is the only control in the bar that is
  not about the game, so it should read that way (§9.3).
- **Height 56px, `position: sticky`, `top: 0`**, carrying the mark and the controls and
  nothing else. **The room code is deliberately not in the bar.** It was, for one build —
  `The Jolly Boar Inn · DRAGON` reads well, and a code on screen at every moment is a real
  thing for a latecomer reading it off somebody's phone. But the codes this app generates
  are words, not six letters: `SaradominGodsword`, `ThermonuclearSmokeDevil`. One of those
  in 56px beside four controls has two ways to go and both are bad — truncate to
  `THERMONUC…`, which is worth less than nothing, or squeeze the controls off a phone. So
  the code keeps the places with room for it: the lobby shows it big, next to the link to
  share, and Join keeps its own `<h1>Room {code}</h1>`, which is the only thing on that
  screen that says which room this is. Inside a room, the lobby and the host cover it.
- **Under 26rem** the wordmark and the GitHub icon hide (the footer always carries GitHub),
  and nothing else collapses: no `⋯` popover. Sign, name, sound, theme. At 320px that
  leaves the name about 125px, enough for most of a 24-character name before the ellipsis.
  The identity popover anchors to the bar's column, not to the chip, since the chip is no
  longer the rightmost item.

**A subtlety worth writing down:** identity in this app is per-room. A player exists because
they joined a room; there is no account. So the chip means two different things in two
places, and both are correct:

- **Outside a room** (Home, Create, Join) it shows the *local profile* — the name and head
  stored in this browser, which is what will be filled in the next time you join something.
  Clicking it edits that stored profile.
- **Inside a room** it shows the real `PlayerView` from the server. Clicking it edits the
  live player, which sends a message and updates for everyone.

The popover is the same component with two different save paths.

---

## 5. Who you are: names and heads

### 5.1 The name

**The flow.** Identity is per-room on the server, but the *profile* — the name and head
this browser will use next time — is local and permanent. That split is what lets a
returning player skip the question entirely.

```
first visit ──▶ profile empty, top bar reads "Set your name"
                     │
      ┌──────────────┴───────────────┐
      ▼                              ▼
  Create Game                    Join a room
      │                              │
  profile empty?                 profile empty?
      │ yes                          │ yes
      ▼                              ▼
  popup, blocking            (§5.1.1 — two answers, and they differ)
  — the host's name is
    read aloud and                   │ no
    anchors the room                 ▼
      │                          join straight through
      ▼
  create the room
```

The blocking popup on **Create** is right and it is free: no room exists yet, so there is
no server involved, no uniqueness check, and nothing to undo. The host's name is the one
that gets read out loud and sits at the top of the standings, so a beat to choose it is
time well spent.

#### 5.1.1 Join: gate first, or join first and rename?

You asked whether a player can land in the room as `Cow31337Killer42` and change it
afterwards. **Yes — but not with today's protocol.** `display_name` is set at join and there
is no message that changes it; `POST /api/rooms/{code}/join` is the only place a name is
ever written. So join-first needs a new websocket message.

The good news is that **D4 needs exactly the same message anyway.** Re-rolling a head has
the identical shape: a field on `players`, validated, checked, broadcast as `room_updated`.
Build one `set_profile {display_name?, avatar?}` rather than a `set_name` and a `set_avatar`,
and join-first costs nothing beyond what heads already cost.

So the two options are really "before or after `set_profile` exists":

**A. Gate the join too** (no protocol change). Same blocking popup as Create. Costs one
modal between a tapped link and the room, which is the exact moment a distracted person at a
party puts their phone down. Ships in D3 with zero server work.

**B. Join first, nudge after** (needs `set_profile`). The player is in the room in one tap,
sees the player list, sees other people arriving — and the top bar chip pulses once with
*"You're Cow31337Killer42 — tap to change."* Non-blocking, dismissible, and still there in
the lobby for as long as the lobby lasts.

**Recommended: A in D3, B in D4**, because that ordering means the join flow is never broken
and B is a strict improvement dropped on top rather than a rewrite. B is the better end
state and it is worth getting to.

One caveat for B: a player who never taps the nudge stays `Cow31337Killer42` on the
standings forever, and some fraction of a party will do that. That is fine — it is a party
game and a table of joke names is funnier than a table of real ones — but it does mean the
names in `player-names.json` have to be names you are happy to see win.

#### 5.1.2 The generator, and why it does not touch `room-words.json`

`data/room-words.json` (room codes) and `data/player-names.json` (player names) are
different corpora doing different jobs, and **neither needs revising because of the other.**

- **Room codes** want short, recognisable, shoutable nouns that survive being read across a
  noisy table — `DRAGON`, `CABBAGE`, `TINDERBOX`. A mix of items and NPCs is exactly right
  and `ideas/room-names.md` should stay as it is.
- **Player names** want *usernames* — the register of a 2007 friends list, not the register
  of an NPC roster.

That distinction also dissolves the head-mismatch problem you spotted: **it only exists if
the name list contains NPC names.** Keep the list to invented usernames and nobody is ever
called Hans while wearing a goblin's face. My earlier examples broke this rule — `Zezima`
and `Woox` are real players, `BurntLobster` is an item and belongs in the room-code list.
The right register is invented:

```
Cow31337Killer   ScapeRune77      AlchAddict      xX_Lumby_Xx      NoobSlayer
FreeArmorPlz     RangedTank       PurePkr2006     TeleportedAway   AFKFisher
DDSandPray       LostMyTrimmed    WillyTheWizard  OneHpPure        BankStander
```

Three constraints the server already imposes, which the generator has to respect:

- **1–24 characters** (`rooms/settings.py` normalisation). Base names must be ≤ 21 so the
  numeric suffix always fits.
- **No `<` or `>`**, no control characters.
- **Unique per room, case-insensitively.** Two players rolling the same base name in one
  room is a `409`, and it will happen. The client must catch it and re-roll the suffix
  automatically — up to three times — before showing an error. Without this, the
  random-name feature produces a confusing failure at exactly the moment it was supposed to
  remove friction.

One cheap nicety: when generating, skip a name that matches the room code. `CABBAGE` joining
room `CABBAGE` is not a bug, but it reads like one.

If you later want name-and-head coherence rather than mere non-contradiction, the move is to
**roll the head first and let it pick the name's register** — a goblin head draws from a
scruffier sub-list than a wizard head. That is a nice-to-have, not a requirement, and it
doubles the curation work.

Store the chosen name and head in `localStorage["jbi:profile"]`, following the existing
`jbi:` prefix and the throws-tolerant accessor pattern in `lib/session.ts`.

### 5.2 The head

This is the one that has a hidden cost, and it is worth being explicit about it: **a chat
head is not like a theme.** The theme is yours alone and lives in localStorage forever for
free. A head has to appear next to your name in *other people's* lobbies and on *their*
standings screen — so it has to travel over the wire, which means the server has to know it.

Three ways:

**A. Derived from the player id.** `PlayerView.id` is a uuid the client already has, and
`Standing.player_id` is the same uuid on the standings screen. Hash it, mod the number of
heads, done. **Zero protocol change, zero migration, zero server code**, and every client in
the room independently computes the same head for the same player. The cost is absolute: it
can never be re-rolled, because there is nothing to change.

**B. A stored field.** `0005_player_avatar.sql` adds `players.avatar smallint`, null for a
player who never chose; `display_name` gains a companion in the join and create payloads; `PlayerView`
gains `avatar`; a `set_profile` ws message updates it and broadcasts `room_updated` (the
same message that carries a rename, §5.1.1). Roughly
the size of T7. Re-rollable, which is the whole point of the feature as you described it.

**C. No heads.** A coloured tile with the first letter, tinted from the id hash. Free,
legible, and about as charming as a spreadsheet.

**Recommended: B, and design the client so A is the fallback.** `avatar` is read as
`player.avatar ?? derivedFrom(player.id)`, so the client works against a server that has not
shipped the column yet, and an old room rehydrated after the migration still has heads. That
lets D4 ship the visuals against derived heads on day one and add the column in the same
task or a later one without a second design pass. The column is nullable for the same
reason: a `not null default 0` would have given every player in an old room head 0, where
null gives each of them the head their id derives.

Practical notes: **there are exactly 50 heads.** `max_players_per_room` is 50
(`server/app/config.py`), so 50 is the number at which a full room can still give everyone a
different face, and the fifty-first buys nothing. The owner picks them by hand — from the
wiki, or drawn — which is also why they are the one asset class with no fetch step (§9.1).

They live in **`data/heads/`**, committed: `data/heads/NNN-<slug>.png` for the art, and
`data/heads/heads.json` as the manifest, an array of
`{"id": 0, "file": "000-guard.png", "name": "Guard"}` in the style of the repo's other
`data/*.json`. **The index is the contract.** `players.avatar` is a `smallint` holding that
`id`, so a head may be replaced in place and the list may grow, but an existing id must never
be repointed at a different face: an old room rehydrated afterwards would silently repaint
its players. The build packs the manifest into one sprite sheet — the client never fetches
fifty files — and `derivedFrom(player.id)` takes the id hash modulo the manifest length.

Render at 32px in the top bar and lobby list, 48px on standings. Heads in-game are drawn at
low resolution, so `image-rendering: pixelated` and integer scaling, or they turn to mush.
That makes **16×16** the size a head is saved at: both 32 and 48 are whole multiples of it,
and `test_heads.py` holds every file to a square whose side divides both. The fifty D4
shipped are generated placeholders in that format, each named for what it shows, so the
owner's picks replace them file for file under the same ids.

---

## 6. Sound

Two independent switches, because they mean different things and one of them is
load-bearing.

| Switch | Covers | Safe to mute? |
|---|---|---|
| **Music & effects** | Splash stings, the countdown tick, the reveal chime, lobby music | Yes. Purely decorative. |
| **Question audio** | Audio that *is* the question — `ideas/games.md` has a "name that spell or spec" mode, and a music round | **No.** Muting it makes those rounds unplayable. |

The bar's speaker icon shows three states (all on / partial / all off) and opens a popover
with both switches plus a volume slider. When a player mutes **question audio**, the popover
says so plainly — *"Some rounds are audio-only. You will not be able to answer those."* —
rather than letting them find out mid-round. That is the whole reason for splitting the
switches; a single mute button cannot say this.

Three implementation facts that need to be in the task, not discovered during it:

1. **The CSP blocks audio today.** `server/app/http/headers.py` is `default-src 'none'` with
   no `media-src` directive, so every `<audio>` load fails. D6 adds `media-src 'self'` and
   nothing else.
2. **Browsers block autoplay until a user gesture.** A phone that has joined and not been
   touched since cannot play the round-start sting. The fix is mostly free: `ideas/TODO.md`
   already wants the splash countdown replaced with a per-player **ready check**, and that
   tap is the audio unlock. Build them in the same task and the problem never exists on the
   ordinary path.

   Two players never see that splash: one in a room with `splash_seconds: 0`, and one who
   joins mid-game. For them the unlock is **the first answer tap** — the next question they
   touch. The cost is small and worth stating plainly: that one question plays no audio, and
   every question after it does. The case where it bites is a player whose very first
   question is an audio-only one, who would get silence on a question they cannot answer
   without sound. Handle it the way a muted question-audio switch is handled (the table
   above): say so on the question rather than letting them work it out from the silence.
3. **`prefers-reduced-motion` is the sibling setting.** Anything that pulses, counts, or
   slides gets a static fallback. It is also the honest answer to "no super splashy
   animations": pick animations that are *removable*, and the reduced-motion version is
   proof they were decoration.

---

## 7. Screens

### 7.1 The splash

Today it is a bordered box with a heading and a timer, and it already carries the comment
`<!-- Artwork for the mode goes here -->`. That is the whole task.

```
┌────────────────────────────────────────┐
│                                        │
│     [ full-bleed tavern artwork ]      │  16:9, fades at the bottom edge
│                                        │
├────────────────────────────────────────┤
│  ROUND 2 OF 5                          │  display face, --muted, 0.12em tracking
│  Drop Table                            │  display face, 2.2rem, --accent
│  Which boss drops this?                │  body face
│                                        │
│  8 questions · 15 seconds each         │  --muted
│                                        │
│  [ ✓ I'm ready ]   ●●●○●●○               │  heads, lit as people tap
└────────────────────────────────────────┘
```

**Artwork, and how much of it to commission.** Thirteen modes by the end of Phase 2 means
thirteen images if each mode gets its own, which is a lot to draw and a lot to keep
consistent. Cheaper and, I think, better: **six tavern scenes and a per-mode silhouette.**
The scenes are NPCs drinking in six different pubs — the Blue Moon, the Rusty Anchor, the
Dead Man's Chest, the Jolly Boar itself — and each mode is assigned one plus a small
foreground element that says what the round is (a coin stack for The Price is Right, a
scroll for Guess the Examine). Modes can share a scene without looking lazy, a new mode
costs one small silhouette instead of one full illustration, and the pub-crawl theme lands
harder with six pubs than with thirteen unrelated pictures.

**None of that art exists yet, and D7 does not wait for it.** The scenes ship as placeholder
blocks — a flat `--panel` rectangle carrying the mode name — and the real images are dropped
in later without a second task, because the deliverable here is the slot, its aspect ratio
and the mode-to-scene table; the image is a file sitting behind them. Same for the sign in
§9.1.

This is also where the per-round variety from §1 goes: the scene changes, the palette does
not.

#### The ready check: two different widgets, not one

You are right to be suspicious of the full ready list on the splash. **The lobby and the
splash are asking different questions and deserve different answers.**

**In the lobby — the full list, by name.** This happens once, everyone is looking at their
phone, and the host genuinely needs to know *who* is missing before pressing Start, because
the answer is usually "Dave, who is at the bar". A name with a dim head next to it is
actionable; a number is not. This is the version worth building, and it is the one your
instinct pointed at.

There is no timer here — the host still presses Start. The list is information for a human
decision, not a mechanism.

**On the splash — heads only, no names, no list.** A round splash happens up to thirteen
times in a game. A named checklist at each one turns an eight-second beat into a social
negotiation, thirteen times, and the thing it is nagging about is smaller each time. The
light version keeps everything the mechanism is actually for:

- A row of heads, dim, lighting up as people tap. Seven heads is one line and no vertical
  space.
- It still gives the **audio unlock gesture** (§6), which is the unglamorous reason the
  ready check earns its place at all.
- "We are waiting on two people" is legible at a glance without anyone being named and
  shamed between every round.

**The 80% rule, specified.** The instinct is right and it needs a cap, or it misbehaves in
small rooms:

- **Eligible** = connected players who can answer. A disconnected player never holds up a
  round, which matters because a locked phone is the common case, not an edge case.
- **Threshold** = `min(ceil(0.8 × eligible), eligible - 1)`. That is a **cap**, not a floor
  — which is what the earlier wording of this rule had backwards. In a room of three, 80%
  rounds up to three and one person in the kitchen stalls the game; capping at
  `eligible - 1` means two of three is enough. Above four the cap is never binding and the
  rule is plain 80%, so it needs no separate small-room branch.
- **A room of one is exempt.** The cap would give it a threshold of zero, which starts the
  round before the only player has looked at it. With `eligible == 1` the threshold is 1:
  that player taps ready like everyone else, and the tap is also the audio unlock (§6) a
  solo player would otherwise never perform.
- **No clock until the threshold.** The splash waits for the room; there is no fixed
  splash length any more. `splash_seconds` survives only as the on/off switch for the
  splash (0 is off), so every stored room still reads.
- **Threshold reached → a 10-second countdown.** The one person at the bar has that long
  to look up.
- **Everyone ready → 3 seconds**, from nothing or from the ten. Enough to register that
  it is about to start.
- **A tap can be taken back, once per splash.** Dropping below the threshold that way
  stops the countdown again; a second take-back is refused, so nobody can spam the
  countdown on and off. The lobby's toggle stops nothing and has no limit. A connect or disconnect never stops one — a room of phones locking and waking
  would otherwise never finish counting — and a running countdown is never pushed back.
- **The host's skip is the override**, whether the splash is waiting or counting.

The lobby uses the same threshold: the host taps ready like everyone else, and Start is
the plain button once the connected room reaches it. Short of it, it is "Start anyway",
which asks first.

The server stays the single source of timing via `next_at`, which is null while a splash
waits and the countdown's end once one runs.

**Motion budget: one transition.** A 200ms cross-fade into the splash, and heads lighting up
as people tap. Nothing else. The countdown is the animation.

### 7.2 The question screen

Mostly a matter of removing chrome. Today a question is a `.panel` inside a `<main>` capped
at 42rem, with an `<h1>` and a round counter above it. In play, the question should be the
only thing with any visual weight:

- The timer moves to a thin bar **under the top bar**, full width, draining left to right.
  It is glanceable without being a thing you stare at, and it frees the vertical space the
  current `Timer` block costs on a phone.
- The prompt gets `--font-body` at 1.4rem and room to breathe. Answer buttons get a minimum
  height of 56px and full width on mobile — thumb targets at a pub table, not mouse targets.
- `more_less`'s two buttons keep `--more` / `--less` and the existing reasoning.
- Every `pick_from_list` mode answers through one **combobox**: a searchable dropdown that
  only submits an entry of its list (behaviour in `ideas/architecture.md` §2). The search
  field is full width, 56px tall and in `--font-body`, the Submit button under it is 56px
  like any answer button, and the open list sits **above** the field on a phone so the
  keyboard never covers it. The typed text reads as a search, not an answer: nothing in the
  field looks committed until an entry is selected, and the selected name then shows in the
  field with the Submit button lit.
- Answered-and-waiting is a state that lasts up to 15 seconds and currently shows one line
  of `.note`. It should show your answer held, dimmed, with a quiet "waiting for the room"
  and the count of who has answered — it is dead time and it is where people look up at each
  other, so it should reward the glance rather than punish it.

#### The reveal

The same rule applies to every question type, not only multiple choice: **on reveal,
everything recedes except the correct answer and your points.** For buttons that is §2's
fade. For a typed, picked or numeric answer it is your answer card fading beside the
correct value.

Points earned sit in one fixed slot, in the same place in every mode, in the display face
with tabular numerals. The player learns where to look once.

| Outcome | Slot shows |
|---|---|
| Right | `+850`, with `--ok` and a ✓ |
| Wrong | `+0`, with `--bad` and a ✗ |
| No answer | `No answer · +0`, muted, no ✗ |
| Graded (closest guess) | `+340`, the number carries the verdict |

A timeout is not the same as a wrong answer, and the slot has to say so. `--ok` and `--bad`
now live here and on the ✓ / ✗ glyphs rather than on buttons, so the layer-3 contract in §2
still applies to them.

The slot carries **one** other thing: the running total, set under the points earned in
`--muted` and the same tabular numerals — `+850` over `9,270`. It is the number the standings
are about to show anyway, it answers "where am I" without a screen change, and it costs one
line in a slot that already exists.

What it does **not** carry is the reason for the number. A speed bonus explained mid-reveal
is a second thing to read in a beat that is already short, and a player who wants to know why
they got 850 rather than 1000 will work it out over a round or two by watching the timer.
Points earned, running total, nothing else.

And there is **no standings table under the reveal.** A board after every question makes the
game a spreadsheet that updates every twenty seconds. Inside a round, the running total in the
slot is the only answer to "where am I", and the whole room's picture waits for the end of the
round (§7.3).

### 7.3 Standings: a podium, then the hiscores

The standings are the screen everyone looks at longest, and a plain list is the least fun
way to show them. So the top of the board is a podium, and the rest is the OSRS hiscores.

#### When: between rounds, in a phase of their own

Standings appear **between rounds and at the end of the game, never between questions.**
They get their own server phase, `standings`, rather than borrowing the splash. The splash
only runs when a round introduces a new mode, and a room can turn it off with
`splash_seconds: 0`. Standings need to follow every round whatever happens to the splash.

The loop becomes `… reveal → standings → splash / open …`:

- The phase follows the reveal of **each round's last question**, except the game's last
  question. That one goes straight to `finished` and the final screen, which uses the same
  component.
- It lasts `standings_seconds`, a new room setting: default 10, 0–30 at creation, and 0
  turns the phase off, as `splash_seconds: 0` does for the splash. `next_at` carries its
  end, and the host's skip ends it early, as it ends every other phase.
- A single-round game never enters it. Its only standings are the final ones.
- `phase` is not a column, so a room that restarts mid-standings resumes in the reveal
  (`_recover`) and moves straight on. That round's standings are lost, which is accepted
  rather than fixed: it costs one screen after a crash.

#### The podium: ranks 1–5 on the speedrunning trophies

The Quest Speedrunning trophies come in exactly five tiers, which map onto ranks 1–5:
**Diamond, Platinum, Gold, Silver, Bronze**. The podium puts first in the middle, Olympic
style:

```
                    ┌─────────┐
                    │ DIAMOND │
          ┌─────────┤ [head]  ├─────────┐
          │PLATINUM │ Cow313… │  GOLD   │
┌─────────┤ [head]  │  8,420  │ [head]  ├─────────┐
│ SILVER  │ ScapeR… │         │ AlchAd… │ BRONZE  │
│ [head]  │  7,115  │         │  6,980  │ [head]  │
│ xX_Lu…  │         │         │         │ NoobS…  │
│  5,210  │         │         │         │  4,870  │
│    4    │    2    │    1    │    3    │    5    │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

- **Left to right the ranks are 4 · 2 · 1 · 3 · 5**, and the steps get lower from the
  centre. Each step shows its trophy, the head at 48px, the name, and the points in tabular
  numerals.
- **Ranks are dense** (the existing tie-break), so players who tie share a step. A step
  holds up to three heads, then `+N`.
- **Nobody with 0 points stands on the podium.** A trophy nobody earned is shown dimmed on
  an empty step. This also stops the first standings of a quiet room from being five
  zero-point "winners".
- **Names wrap to two lines, then ellipsise.** Five steps on a 375px screen gives each one
  about 64px, which a 24-character name will never fit. The full name is in the step's
  accessible label, and in full on the final screen's table (below).

#### The hiscores table: rank 6 down

Below the podium, the OSRS hiscores, which are a strong, instantly recognisable table:

```
 RANK          NAME                        POINTS
 ─────────────────────────────────────────────────
  6   [head]  PurePkr2006                   4,410
  7   [head]  BankStander                   3,905
  8   [head]  Cow31337Killer42              3,120
```

Tabular numerals, right-aligned points, and rank numbers in plain `--ink`. **The
gold/silver/bronze medals on the top three are gone.** The trophies do that job now, and a
"Gold" third place beside a gold first-place medal would contradict itself. Your own row is
highlighted. Between rounds, if your row is below the fold, a copy is pinned to the bottom
of the panel, so the one row you are looking for never needs a scroll.

On the final screen the table lists everyone, ranks 1–5 included, below the podium. That is
the one place a long name on the podium is guaranteed to be read in full.

**Motion:** the steps rise once when the phase opens, and nothing else moves. Under
`prefers-reduced-motion` the podium is simply there (§6, D11).

**Colour:** the trophy tiers are art, not tokens. They add no token layer and never touch
layers 3 or 4.

---

## 8. What the existing build constrains

Four hard constraints, all from the CSP in `server/app/http/headers.py`. None of them are
problems; all of them are things that will waste an afternoon if they are discovered rather
than planned for.

1. **`style-src 'self'` with no `'unsafe-inline'`.** Inline `style="..."` attributes are
   blocked — so a theme can *never* be applied by writing custom properties onto an element
   from JavaScript. Themes switch by setting `document.documentElement.dataset.theme`, with
   every palette written statically in `app.css` under `[data-theme='wilderness']`. This
   also rules out Svelte's `style:` directive for anything theme-related.
2. **`font-src 'self'`.** Self-hosted font files only. No Google Fonts, no CDN.
3. **No `media-src` at all**, so `default-src 'none'` applies and audio is blocked. §6.
4. **`img-src 'self' data:`** is fine as-is for local art and Vite's inlined assets.

And one that is not the CSP: **the theme must be set before first paint.** `main.ts` is a
module script, so it is deferred, and a naive implementation flashes the default palette
before switching. `script-src 'self'` forbids the usual inline-script fix. Mitigations, in
order of preference: set `data-theme` as the literal first statement of `main.ts` before any
import with a side effect; keep `color-scheme` on `:root` so the browser paints the right
canvas colour during the gap; and accept that the gap is one frame on a local server. Worth
one line in the D1 accept criteria so nobody ships a flash.

Dropping `auto` (§1) helps here as well: the value to write is a string out of `localStorage`
or the literal `jolly`, with no media query to consult and no second code path to get wrong
before the first paint.

---

## 9. Assets, branding and the footer

### 9.1 Where the art comes from

| | Source | Committed? |
|---|---|---|
| Item and NPC renders | Game assets. Phase 3's importer fetches these anyway. | Fetched |
| NPC chat heads | 50, picked by hand, in `data/heads/` (§5.2). | **Committed** |
| Speedrunning trophies | The five Quest Speedrunning trophy renders for the podium (§7.3). | Fetched |
| Fonts | A self-hosted display face, once one is chosen (§3). | Fetched |
| Prices, combat levels, release dates | Facts. | Committed, as `prices.json` already is |
| Logo, splash art, palettes, icons | **Original.** | Committed |

**Fetched, not committed** is an engineering call, not a legal one: `make fetch-assets`
matches the `make gen-price-questions` pattern the repo already uses, keeps the checkout
small, and Phase 3's importer needs a fetch step regardless. It also answers the open
`ideas/architecture.md` question about where assets live under a read-only container — one
mount, one decision.

**The heads are the exception, and deliberately so.** They are fifty small files, each
chosen by a person for how it reads at 32px, and a script cannot make that judgement — it
would either pull a whole wiki category or hard-code the same fifty names the manifest
already holds. Committing them keeps the curation in review where it belongs, and it costs
some tens of kilobytes. Renders and the font stay fetched: there are thousands of the former,
and open licence questions around the latter.

**The logo and splash art are original** because that is what makes this the Jolly Boar Inn
rather than a RuneScape skin. A sign somebody drew for this app is a better mark than a game
asset with the text swapped, and it is what gives the selfhoster branding below something to
swap.

Download scripts would need to enforce a custom User Agent env variable before they can continue, according to the Wiki Terms of Use.

**Neither `make fetch-assets` nor the logo is owned by a D-task.** Both are the owner's, both
are tracked in `ideas/TODO.md`, and nothing in D1–D12 blocks on either: the heads D4 needs
are committed, the display face §3 wants falls back, **D2 ships a placeholder mark** — the
wordmark set in whatever type is loaded, over a plain sign shape — D7 ships placeholder
scenes, and D9 ships placeholder trophies, one plain cup shape tinted per tier. Every one of those slots is built to be replaced by a file, so no task reopens when
the art arrives.

### 9.2 The footer

One line, small, `--muted`, on every screen:

> RuneScape and RuneScape Old School are the trademarks of Jagex Limited.

Next to it, two links: **GitHub** (`https://github.com/vosdev/jolly-boar-inn`) and the
licence. The AGPL wants a source link reachable from a network service anyway, so the footer
is where that obligation is discharged.

The footer also carries the version (`ideas/architecture.md` §10). Until the footer exists,
the version sits in the top bar beside the wordmark, in its own element so it never becomes
part of `PUBLIC_SITE_NAME`. **D10 moves it here** and takes it out of the bar.

### 9.3 The GitHub link

- **Footer: always.** This is its real home, and it is where anyone looking for it will look.
- **Top bar: a small icon**, leftmost in the right-hand group, at `--muted` rather than
  `--ink`, so it sits behind identity, sound and theme in the visual order. It is the one
  control in the bar that is not about the game, so it should read that way.
- **On mobile** it hides under 26rem, along with the wordmark, so the player's name keeps
  the room. The footer is still one scroll away.

Deliberately *not* phase-dependent. A top bar that shows different controls during a
question than between them is a bug farm for the sake of a few pixels.

The Home screen gets a third, louder mention near the tagline — an open-source party game is
a selling point to the kind of person reading the homepage, and that is the one screen with
room to say so.

### 9.4 Selfhoster branding

Three env vars, read at build time into the client: `PUBLIC_SITE_NAME` (default
`The Jolly Boar Inn`), `PUBLIC_SITE_LOGO` (a path, default the bundled sign), and
`PUBLIC_DEFAULT_THEME`. Someone's instance is *The Dancing Donkey* without a fork — which is
also the honest reason the themes are named after places rather than after this inn.

`PUBLIC_DEFAULT_THEME` takes a theme id and nothing else — there is no `auto` to pass (§1) —
and it changes only what a browser that has never chosen sees. A player's own pick still
wins, on every instance.

**A host cannot pin a theme for a room.** It was considered, in the mildest form available:
the host picks one at creation, it arrives in the welcome frame as a *suggestion*, and it
applies only to players who have not chosen for themselves. One settings field, one client
branch. It is dropped anyway. The theme is the one thing in this app that is purely the
player's, it is the setting most likely to answer a real need rather than a taste — a dark
pub, a bright garden, tired eyes — and a "suggestion" that repaints someone's screen is not a
suggestion to the person holding it. Everyone picks their own or keeps `jolly`. This is a
decision not to build a feature and it stays decided: no room setting, no protocol field.

The GitHub link is **not** configurable: a fork's footer should still point at the upstream
project, and anyone who wants it to point elsewhere is editing one line.

---

## 10. The tasks

```
D1 tokens + theme engine
 ├─▶ D2 app shell / top bar ──┬─▶ D3 names + profile popover ──▶ D4 heads + set_profile
 │                            ├─▶ D5 the three themes + picker ──▶ D12 party_room
 │                            └─▶ D6 sound switches
 ├─▶ D7 splash + ready check
 ├─▶ D8 question screens + gem buttons
 └─▶ D9 standings
        D10 selfhoster branding   (needs D2)
        D11 motion + reduced-motion pass  (last)
```

Every D task, like every T task, bumps the minor version in `VERSION` when it lands
(`ideas/architecture.md` §10, Versioning).

Build order for the biggest visible change soonest: **D1, D2, D5, D3.** That is the tokens,
the shell, the themes and the names — after which the app stops looking generic, and D4 and
D6–D9 are refinements on something that already has a face.

### D1. Tokens and the theme engine

The layered token set from §2 in `app.css`, the `[data-theme]` mechanism, and
`lib/theme.ts` (read, set, persist to `jbi:theme`, fall back to `jolly` — there is no
`prefers-color-scheme` branch, §1). No new palette: today's colours become `jolly` and
today's dark block becomes `wilderness`, unchanged, so the diff is a rename and a
restructure. `scripts/check_contrast.py` and a CI step. All seven gem tokens are defined here
even though no button uses them yet, so the `--ok`-against-`--gem-*` assertion has something
to check from day one.

**Accept:** `jolly` and `wilderness` render byte-identically to today's light and dark; a
browser with no `jbi:theme` and an OS in dark mode gets `jolly`; setting `data-theme` on
`<html>` from DevTools repaints everything with no reload; nothing in `client/src` sets a
colour through an inline style or a `style:` directive (grep is in the test); the contrast
script fails a deliberately broken `--bad`, fails an `--ok` that cannot be seen against
`--gem-emerald`, and passes both themes; first paint is not a flash of the wrong palette.

### D2. The app shell

`App.svelte` grows a `<TopBar>` above `<main>`: logo, wordmark, and three named slots.
Sticky, 56px, wordmark hidden under 26rem. No room code in the bar (§4), so the screens
that name the room go on naming it; what comes out is the `<h1>Room {code}</h1>` on Room's
connecting and disconnected states, where it never said anything the screen did not, and
the Home `<h1>` that repeated the wordmark now sitting above it. Controls are placeholders
in this task.

**Accept:** every existing screen renders under the bar with nothing clipped or double-titled;
the bar is present on Home, Create, Join and Room; at 320px wide the wordmark is hidden, the
sign is not, the player's name is still shown next to the head, sound and theme are still in
the bar, and there is no horizontal scroll; the sign links home; the bar is the same width whatever room you
are in; the sticky bar does not cover a focused input when a mobile keyboard opens.

### D3. Names and the profile popover

`data/player-names.json` (invented usernames only, §5.1.2), `lib/names.ts` (generate,
respecting 21 chars + suffix, skipping the room code), the identity chip and popover from §4,
`jbi:profile` in localStorage, the blocking popup on Create and Join for an empty profile
(§5.1 option A), pre-filled and re-rollable name fields, and automatic suffix re-roll on a
`409` duplicate.

Client only. No server change, no migration, no protocol change.

**Accept:** the chip shows the name at every width, down to 320px, ellipsised rather than
hidden; a first-time browser cannot reach Create or Join without setting a name, and the
popup is pre-filled so that takes one tap; a returning browser goes Home → lobby in two taps
and is never asked again; the re-roll button changes the name without losing focus; a name
longer than 24 characters cannot be submitted; two browsers forced to the same generated
name both join successfully and end up with different names; no generated name is an NPC
name; localStorage throwing leaves the app usable for that session.

### D4. Heads, and changing your mind

`0005_player_avatar.sql`; `avatar` through create/join and `PlayerView`; one
`set_profile {display_name?, avatar?}` websocket message covering **both** the head re-roll
and the rename, validated and uniqueness-checked exactly like join, broadcast as
`room_updated`; the fifty committed heads in `data/heads/` and the sprite sheet built from
`heads.json` (§5.2); `player.avatar ?? derivedFrom(player.id)` on the client. Heads in the
top bar, the lobby list and the standings.

With `set_profile` in place, Join switches from the blocking popup to **join-first**
(§5.1.1 option B): the player lands in the lobby as a random name and the top bar chip
nudges once, non-blocking and dismissible.

**Accept:** two browsers see each other's heads identically; re-rolling or renaming in one
updates the other within a frame of `room_updated`; a rename to a name already taken in the
room is rejected and the old name survives unchanged; a rename mid-game does not disturb
standings or an open answer; a room created before the migration shows heads for its
players; a client built before this task still plays against a server that has it; heads are
crisp, not blurred, at 32px and 48px; a full room of 50 can be given 50 different heads; an
`avatar` outside the manifest is rejected at the edge rather than stored and rendered as a
gap.

### D5. The three themes and the picker

`pollnivneach` written; `jolly` and `wilderness` extended into layers 5–7 (radius, borders,
texture); the picker popover in the top bar with a live swatch per theme. `party_room` is not
in this task — it is D12.

**Accept:** all three pass the D1 contrast script; switching theme mid-question does not
disturb the layout or the timer; the picker offers exactly the themes present in `app.css`
and no "follow my device" entry; a player who has never chosen sees `jolly` as the selected
swatch rather than nothing selected; a theme is a single contiguous block in `app.css` that a
selfhoster can copy and edit.

### D6. Sound

`media-src 'self'` in the CSP; the two switches, the volume slider, the three-state icon; the
unlock gesture wired to the ready-check tap **and to the first answer tap**, for the players
who never see a splash (§6); `lib/audio.ts` with a null implementation so the switches work
before any audio file exists.

**Accept:** with no audio assets present, both switches persist and no console error appears;
muting question audio shows the warning copy; a fresh tab that has not been tapped does not
throw an autoplay error; a player who joined mid-game, or who is in a room with
`splash_seconds: 0`, has working audio from their second question onwards; an audio-only
question that cannot play its audio says so instead of showing a silent prompt; the CSP
change is covered by the existing headers test.

### D7. Splash and the ready check

Artwork slot — **placeholder scenes now, real art dropped in later** (§7.1) — the layout from
§7.1, the six-scene assignment table in `lib/modes.ts`, and the two ready widgets: the
**named list in the lobby**, and the **heads row on the splash** with the 80% rule from §7.1.

The threshold maths (`min(ceil(0.8 × eligible), eligible - 1)`, eligible = connected players
who can answer, a room of one exempt at a threshold of 1) lives on the server next to the
timer task, and only ever moves `next_at` earlier.

**Accept:** the splash shows the scene for its mode and falls back to a default scene for a
mode this build has no entry for; a placeholder scene reads as deliberate rather than as a
broken image, and swapping in a real file needs no code change; a splash with nobody
ready waits rather than timing out; threshold-reached starts 10 seconds and everyone ready
gives 3; taking a tap back below the threshold stops the countdown, and a second take-back on the
same splash is refused; a room of three with one
player in the kitchen still starts; a room of one does not start until that player taps
ready; a disconnecting player lowers the threshold rather than stalling the round; the host
can still skip; a player who joins mid-splash sees the right ready state; `splash_seconds: 0`
still skips the splash entirely; the lobby list names who is not ready and the splash does
not; the lobby's Start asks before starting a room short of its threshold.

### D8. Question screens

Timer as a bar under the top bar; the gem button component with its five states and the
reveal rule from §2, used by `multiple_choice`, `price_is_right` and `ordering` and sized for
up to seven options; the points slot from §7.2, earned points over the running total; the
waiting state; touch targets at 56px. `more_less` keeps its own two buttons and its own two
tokens. Fixes the `ideas/TODO.md` bug where an unanswered `more_less` question highlights a
button as if it had been pressed.

**Accept:** a colour-blind simulation of the reveal is unambiguous with colour removed
entirely; whichever gem is correct, it is the only one not faded, and no button changes
colour on reveal; your own wrong pick is still identifiable; faded answer text is still
readable at 4.5:1; a timeout shows `No answer · +0` and is distinguishable from a wrong
answer; the points slot is in the same place in every mode and its running total agrees with
the next standings screen; seven gem buttons at 56px fit a 375px screen without pushing the
prompt off it; no answer submitted shows no button as pressed; the timer bar
is accurate against `ends_at` after a 20-second phone lock; every button is reachable and
operable by keyboard with a visible focus ring.

### D9. Standings: the podium and the `standings` phase

Everything in §7.3, which is the first D-task since D7 with server work in it.

**Server:** `standings` joins the phase set (`rooms/state.py`, `ws/protocol.py`);
`standings_seconds` in `RoomSettings` and `NewRoomSettings` (`rooms/settings.py`), defaulted
so a stored room still reads; the timer loop enters the phase after a round's last reveal,
except the game's last; `skip` accepts it.

**Client:** `standings` in `Phase` (`lib/protocol.ts`); the per-question `<Scoreboard>`
comes out of the reveal in `Room.svelte`; a standings screen with a timer to the next round;
the podium and the hiscores table as **one component**, shared by that screen and the final
one (`Scoreboard.svelte` grows into it); placeholder trophies (§9.1); a `standings_seconds`
field on Create next to the reveal and splash lengths.

**Accept:** no standings appear between two questions of the same round; every round but the
last ends in a `standings` phase of `standings_seconds` that the host can skip, and with 0
the rounds run straight on; the last round goes straight to the final screen, which uses the
same component; a single-round game shows standings only at the end; the podium reads ranks
4 · 2 · 1 · 3 · 5 from left to right, with Diamond to Bronze on ranks 1–5; tied players share
a step, and a step with more than three shows `+N`; nobody with 0 points stands on the
podium; five steps and eight table rows fit a 375px screen with no horizontal scroll; a
24-character name is whole in the table and in the podium's accessible label; points do not
shift horizontally as they change; ranks tie correctly per the existing tie-break; a player
who joins or reconnects during `standings` sees the podium and the right `next_at`; a room
created before this task still plays; a client built before this task survives the new phase
value by falling through to its "waiting for the next question" state; a placeholder trophy
reads as deliberate, and a real render drops in with no code change.

### D10. Selfhoster branding

`PUBLIC_SITE_NAME`, `PUBLIC_SITE_LOGO`, `PUBLIC_DEFAULT_THEME` through Vite into the client,
documented in `.env.example` and the README. Plus the persistent footer from §9.2 (the
trademark line, the GitHub link, the licence link, the version) and the GitHub icon in the
top bar (§9.3). The version moves out of the top bar and into the footer.

**Accept:** an instance with all three set shows its own name, logo and default theme with no
code change; an instance with none set is identical to today; a `PUBLIC_DEFAULT_THEME` naming
a theme that does not exist falls back to `jolly` rather than rendering untokenised; a missing logo file falls back
to the bundled sign rather than a broken image; the footer is present on every screen
including mid-question and never overlaps an answer button on a 375px screen; the GitHub
link works from both the footer and the top bar, and the bar icon hides under 26rem; the version shows in the footer on every screen, including under 26rem, and nowhere in
the bar.

### D11. Motion and the reduced-motion pass

Every transition audited, a `prefers-reduced-motion` branch for each, and the animation
budget written down so it stays small.

**Accept:** with reduced motion on, nothing moves except the timer bar and it does so by
changing width without easing; no animation exceeds 250ms; no animation runs while a
question is open except the timer.

### D12. The Party Room theme

`party_room` on its own, after D5 and against a contract that already has teeth: deep purple
base, gold and partyhat accents, a wide radius, no border. It is a separate task because it
is the theme most likely to fail the D1 check and the one whose accent most wants to be used
everywhere — which is exactly what §2 forbids — so it needs to be able to fail, or be cut,
without taking a release of D5 with it.

**Accept:** it passes the D1 contrast script unmodified, `--ok` against every `--gem-*`
included; no `party_room` rule touches a layer-3 or layer-4 token outside its own
`[data-theme='party_room']` block; a reveal is readable on a phone at low brightness in a
dark room; if it cannot do those things it is deleted rather than exempted, and D5's three
themes are unaffected either way.

---

## Needs decision

Nothing. Every question this document raised has been answered and folded into the sections
above. New ones go here as they turn up.

## Decided

[x] **Themes are a per-player preference in localStorage**, not a room setting. No protocol
change, no migration.

[x] **Random theme per round: no.** §1. The variety comes from splash artwork instead.

[x] **`jolly` is always the default, and there is no `auto` theme.** Nothing consults
`prefers-color-scheme`: jolly sits between light and dark, and a player who wants brighter or
darker picks a theme. §1.

[x] **No host-pinned room theme**, not even as a suggestion applied only to players who have
not chosen. The theme stays the one thing that is purely the player's. §9.4.

[x] **`party_room` is built, as D12**, separately from D5 and cut without ceremony if it
cannot pass the contrast check. §1.

[x] **The profile is local and permanent; the player is per-room and temporary.** No
accounts. `jbi:profile` holds the name and head; the server never sees a returning player as
the same person, and does not need to. §5.1.

[x] **An empty profile blocks Create, and blocks Join until `set_profile` exists.** Then Join
becomes join-first-and-nudge. §5.1.1.

[x] **One `set_profile` message, not a `set_name` and a `set_avatar`.** Renaming and
re-rolling a head are the same operation on the same row. §5.1.1.

[x] **`player-names.json` holds invented usernames, not NPC names**, which is what stops a
player called Hans wearing a goblin's face. `room-words.json` is a separate corpus and does
not change. §5.1.2.

[x] **Chat heads need a server field**, with a derived-from-id fallback so the client works
either way. §5.2.

[x] **Fifty chat heads, picked by hand and committed** to `data/heads/` behind an index
manifest, because `max_players_per_room` is 50 and a full room should be able to have fifty
different faces. The index is a contract: `players.avatar` stores it, so an id is never
repointed at a different head. §5.2.

[x] **Seven gems, seven options, three modes.** Sapphire, emerald, ruby, diamond,
dragonstone, onyx, zenyte, in that order and position-stable however many are shown.
`multiple_choice`, `price_is_right` and `ordering` use them; `more_less` keeps `--more` /
`--less` and its item pictures. No mode offers more than seven options, which is tracked as
its own task outside this document. §2.

[x] **The `--ok` ring stays on the winning gem**, and the contrast script grows an assertion
of `--ok` at 3:1 against every `--gem-*` rather than the ring going neutral. §2.

[x] **The points slot shows earned points over the running total**, and never the reason for
a bonus. §7.2.

[x] **Two ready widgets, not one.** A named list in the lobby, a heads row on the splash. §7.1.

[x] **The splash has no clock of its own.** It waits for the ready threshold, then counts
down 10 seconds, 3 once everyone is ready; the host's skip overrides it. The lobby's Start
waits on the same threshold, with "Start anyway" as the override. §7.1.

[x] **The ready threshold is a cap, not a floor** — `min(ceil(0.8 × eligible), eligible - 1)`
— and a room of one is exempt at a threshold of 1 rather than starting instantly. §7.1.

[x] **Standings only between rounds, in their own `standings` phase**, never between
questions and not on the splash, which only runs when the mode changes and can be switched
off. `standings_seconds` sets its length, and the host can skip it. §7.3.

[x] **The top five stand on a podium with the Quest Speedrunning trophies**, Diamond to
Bronze, ordered 4 · 2 · 1 · 3 · 5, with the hiscores table from sixth down. The
gold/silver/bronze rank medals are gone. §7.3.

[x] **Trophy art is fetched game renders, and D9 ships placeholders.** §9.1.

[x] **Two sound switches**, because muting question audio can make a round unplayable. §6.

[x] **Audio unlocks on the first answer tap** for the players who never see a splash: a room
with `splash_seconds: 0`, or a player who joined mid-game. One question of silence, once. §6.

[x] **One-line trademark notice in the footer, next to the GitHub and licence links.** §9.2.

[x] **The logo, splash art, palettes and icons are original work**; game renders and the
display face are fetched by `make fetch-assets`; the fifty chat heads are committed, because
curation is not something a script can do. §5.2, §9.1.

[x] **Splash art and the logo ship as placeholders.** The slots are the deliverable and the
files arrive later, so neither D2 nor D7 reopens when the art lands. §7.1, §9.1.

[x] **The display face, `make fetch-assets` and the logo are owned outside the D-tasks.**
Nothing in D1–D12 blocks on any of them: `--font-display` falls back to the browser default,
D4's heads are committed, and D2 draws a placeholder mark. §3, §9.1.

[x] **The room code is not in the top bar.** Appending it to the wordmark was the plan and
it lasted one build: a code here is a word like `ThermonuclearSmokeDevil`, and one of those
in a 56px bar beside four controls either truncates to something useless or pushes the
controls off a phone. The lobby and Join carry the code instead. §4.

[x] **The player's name is the top bar's priority.** Right group is identity, sound, theme,
in that order; the name shows at every width and is the only thing in the bar that shrinks.
On mobile the wordmark hides, the sign stays, and nothing folds into a `⋯` popover. The sign
links home. §4.

[x] **Design work is D1–D12**, independent of the T-numbers, and can interleave with Phase 2.
